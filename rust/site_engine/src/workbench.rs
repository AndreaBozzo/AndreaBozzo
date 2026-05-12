use crate::classify::{tags_for_text, topics_for_text};
use crate::models::{
    Contribution, Edge, Node, Output, Payload, ResultCard, Selected, Topic, TopicCount, WorkItem,
};
use crate::query;
use crate::utils::{compact_tags, first_non_empty, slugify, small_hash, title_from_slug};
use std::collections::{BTreeMap, HashMap, HashSet};

pub(crate) fn parse_payload(payload_json: &str) -> Payload {
    serde_json::from_str(payload_json).unwrap_or_default()
}

pub(crate) fn build(mut payload: Payload) -> Output {
    if payload.active_topic.trim().is_empty() {
        payload.active_topic = "all".to_string();
    }

    let topics = normalize_topics(std::mem::take(&mut payload.topics));
    let items = normalize_items(&payload);
    let query = payload.query.trim().to_string();
    let parsed_query = if query::looks_structured(&query) {
        query::parse(&query).map_err(Some)
    } else {
        Ok(None)
    };
    let query_error = parsed_query.as_ref().err().and_then(|error| error.clone());
    let parsed_query = parsed_query.ok().flatten();
    let legacy_query = if parsed_query.is_none() && query_error.is_none() {
        query.to_lowercase()
    } else {
        String::new()
    };
    let active_topic = payload.active_topic.as_str();

    let mut scored: Vec<(WorkItem, f32, bool)> = items
        .into_iter()
        .map(|item| {
            let topic_match =
                active_topic == "all" || item.topics.iter().any(|t| t == active_topic);
            let search_score = parsed_query
                .as_ref()
                .map(|expr| query::evaluate(expr, &item))
                .map(|matched| {
                    if matched.matched {
                        matched.score.max(1.0)
                    } else {
                        0.0
                    }
                })
                .unwrap_or_else(|| score_query(&item, &legacy_query));
            let has_query = !legacy_query.is_empty() || parsed_query.is_some();
            let visible = topic_match && (!has_query || search_score > 0.0);
            let score = item.base_score + search_score + if topic_match { 2.0 } else { 0.0 };
            (item, score, visible)
        })
        .collect();

    scored.sort_by(|left, right| {
        right
            .2
            .cmp(&left.2)
            .then_with(|| right.1.total_cmp(&left.1))
            .then_with(|| left.0.title.cmp(&right.0.title))
    });

    let mut graph_items = topics_to_items(&topics);
    let mut by_kind_counts: HashMap<&str, usize> = HashMap::new();
    let per_kind_cap = 5;
    for (item, score, visible) in &scored {
        let count = by_kind_counts.entry(item.kind.as_str()).or_insert(0);
        if *count >= per_kind_cap {
            continue;
        }
        *count += 1;
        let mut cloned = item.clone();
        cloned.base_score = *score + if *visible { 10.0 } else { 0.0 };
        graph_items.push(cloned);
    }
    graph_items.truncate(20);

    let positions = layout(&graph_items);
    let nodes = graph_items
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            let (x, y) = positions.get(&item.id).copied().unwrap_or((50.0, 50.0));
            let visible = if item.kind == "topic" {
                active_topic == "all" || item.id == active_topic
            } else {
                scored
                    .iter()
                    .find(|(scored_item, _, _)| scored_item.id == item.id)
                    .map(|(_, _, visible)| *visible)
                    .unwrap_or(idx < 6)
            };
            Node {
                id: item.id.clone(),
                kind: item.kind.clone(),
                label: item.label.clone(),
                x,
                y,
                score: item.base_score,
                visible,
            }
        })
        .collect();

    let mut results: Vec<ResultCard> = scored
        .iter()
        .filter(|(item, _, visible)| *visible && item.kind != "topic")
        .take(6)
        .map(|(item, score, _)| result_card(item, *score))
        .collect();
    if results.is_empty() {
        results = scored
            .iter()
            .filter(|(item, _, _)| item.kind != "topic")
            .take(6)
            .map(|(item, score, _)| result_card(item, *score))
            .collect();
    }

    let selected = select_item(&payload.selected_id, active_topic, &topics, &scored);
    let topic_counts = count_topics(&topics, &scored);
    let edges = derive_edges(&graph_items);

    Output {
        nodes,
        edges,
        results,
        selected,
        topics: topic_counts,
        query_error,
    }
}

fn derive_edges(items: &[WorkItem]) -> Vec<Edge> {
    let topic_ids: HashSet<&str> = items
        .iter()
        .filter(|item| item.kind == "topic")
        .map(|item| item.id.as_str())
        .collect();

    let mut edges = Vec::new();
    for item in items {
        if item.kind == "topic" {
            continue;
        }
        for topic in &item.topics {
            if topic_ids.contains(topic.as_str()) {
                edges.push(Edge {
                    from: item.id.clone(),
                    to: topic.clone(),
                    kind: "topic".into(),
                });
            }
        }
    }
    edges
}

fn normalize_topics(mut topics: Vec<Topic>) -> Vec<Topic> {
    if topics.is_empty() {
        topics = vec![
            Topic {
                id: "all".into(),
                label: "All work".into(),
                summary: "Writing, projects, and open-source work.".into(),
                tags: vec!["Rust".into(), "Data".into()],
            },
            Topic {
                id: "data-platforms".into(),
                label: "Data platforms".into(),
                summary: "Pipelines, lakehouse systems, and analytical storage.".into(),
                tags: vec!["Iceberg".into(), "Lakehouse".into()],
            },
        ];
    }
    topics
        .into_iter()
        .filter(|topic| !topic.id.trim().is_empty())
        .map(|mut topic| {
            if topic.label.trim().is_empty() {
                topic.label = title_from_slug(&topic.id);
            }
            topic
        })
        .collect()
}

fn normalize_items(payload: &Payload) -> Vec<WorkItem> {
    let mut out = Vec::new();

    for study in &payload.case_studies {
        let title = first_non_empty(&study.title, &study.slug);
        let mut tags = study.stack.clone();
        if !study.status.is_empty() {
            tags.push(study.status.clone());
        }
        let media_text = study
            .media_slots
            .iter()
            .map(|slot| format!("{} {} {}", slot.label, slot.kind, slot.placeholder))
            .collect::<Vec<_>>()
            .join(" ");
        let section_text = study
            .sections
            .iter()
            .map(|section| format!("{} {}", section.heading, section.body))
            .collect::<Vec<_>>()
            .join(" ");
        let anatomy_text = [
            study.system_anatomy.inputs.join(" "),
            study.system_anatomy.core.join(" "),
            study.system_anatomy.outputs.join(" "),
            study.system_anatomy.constraints.join(" "),
        ]
        .join(" ");
        let text = format!(
            "{} {} {} {} {} {} {} {} {} {}",
            study.title,
            study.subtitle,
            study.summary,
            study.stack.join(" "),
            study.related_posts.join(" "),
            study.repo_url,
            study.cover_image,
            media_text,
            section_text,
            anatomy_text
        );
        out.push(WorkItem {
            id: format!("case-{}", slugify(&study.slug, &title)),
            kind: "case-study".into(),
            label: title.clone(),
            title,
            summary: first_non_empty(&study.summary, &study.subtitle),
            tags: compact_tags(tags, 4),
            topics: topics_for_text(&text),
            url: format!("./work/{}/", slugify(&study.slug, &study.title)),
            base_score: 7.0,
            stars: 0.0,
            prs: 0.0,
        });
    }

    for (index, post) in payload.posts.iter().take(12).enumerate() {
        let title = first_non_empty(&post.title, "Untitled note");
        let text = format!(
            "{} {} {} {}",
            post.title,
            post.summary,
            post.content,
            post.tags.join(" ")
        );
        out.push(WorkItem {
            id: format!("post-{index}-{}", slugify("", &title)),
            kind: "post".into(),
            label: title.clone(),
            title,
            summary: first_non_empty(&post.summary, "A technical note from the archive."),
            tags: compact_tags(post.tags.clone(), 4),
            topics: topics_for_text(&text),
            url: first_non_empty(&post.permalink, "./blog/"),
            base_score: 4.0,
            stars: 0.0,
            prs: 0.0,
        });
    }

    for (index, contribution) in payload.contributions.iter().enumerate() {
        normalize_contribution(&mut out, contribution, index);
    }

    out
}

fn normalize_contribution(out: &mut Vec<WorkItem>, contribution: &Contribution, index: usize) {
    let title = first_non_empty(&contribution.name, "Open source project");
    let text = format!(
        "{} {} {} {}",
        contribution.name, contribution.desc, contribution.stars, contribution.prs
    );
    out.push(WorkItem {
        id: format!("project-{index}-{}", slugify("", &title)),
        kind: "project".into(),
        label: title.clone(),
        title,
        summary: contribution.desc.clone(),
        tags: compact_tags(tags_for_text(&text), 4),
        topics: topics_for_text(&text),
        url: contribution.url.clone(),
        base_score: 5.0,
        stars: parse_metric(&contribution.stars),
        prs: parse_metric(&contribution.prs),
    });
}

fn topics_to_items(topics: &[Topic]) -> Vec<WorkItem> {
    topics
        .iter()
        .filter(|topic| topic.id != "all")
        .map(|topic| WorkItem {
            id: topic.id.clone(),
            kind: "topic".into(),
            label: topic.label.clone(),
            title: topic.label.clone(),
            summary: topic.summary.clone(),
            tags: topic.tags.clone(),
            topics: vec![topic.id.clone()],
            url: "./blog/".into(),
            base_score: 9.0,
            stars: 0.0,
            prs: 0.0,
        })
        .collect()
}

pub(crate) fn score_query(item: &WorkItem, query: &str) -> f32 {
    if query.is_empty() {
        return 0.0;
    }
    query
        .split_whitespace()
        .map(|term| query::term_score(item, term))
        .sum()
}

fn parse_metric(value: &str) -> f32 {
    let text = value.trim().to_ascii_lowercase();
    if text.is_empty() {
        return 0.0;
    }
    let (number, multiplier) = if let Some(base) = text.strip_suffix('k') {
        (base, 1_000.0)
    } else if let Some(base) = text.strip_suffix('m') {
        (base, 1_000_000.0)
    } else {
        (text.as_str(), 1.0)
    };
    number.parse::<f32>().unwrap_or(0.0) * multiplier
}

fn layout(items: &[WorkItem]) -> BTreeMap<String, (f32, f32)> {
    let clusters = [
        ("topic", 50.0_f32, 50.0_f32, 22.0_f32),
        ("case-study", 72.0, 50.0, 24.0),
        ("post", 38.0, 58.0, 28.0),
        ("project", 28.0, 42.0, 22.0),
    ];
    let mut by_kind: BTreeMap<&str, Vec<&WorkItem>> = BTreeMap::new();
    for item in items {
        by_kind.entry(&item.kind).or_default().push(item);
    }

    let mut out = BTreeMap::new();
    for (kind, cx, cy, radius) in clusters {
        if let Some(group) = by_kind.get(kind) {
            let n = group.len().max(1) as f32;
            let r = if group.len() <= 1 { 0.0 } else { radius };
            for (index, item) in group.iter().enumerate() {
                let jitter = (small_hash(&item.id) % 31) as f32 / 31.0;
                let theta = (index as f32 / n) * std::f32::consts::TAU + jitter;
                out.insert(
                    item.id.clone(),
                    (
                        (cx + r * theta.cos()).clamp(8.0, 92.0),
                        (cy + r * theta.sin() * 0.78).clamp(10.0, 90.0),
                    ),
                );
            }
        }
    }

    let unseen: Vec<&WorkItem> = items
        .iter()
        .filter(|item| !out.contains_key(&item.id))
        .collect();
    let n = unseen.len().max(1) as f32;
    for (index, item) in unseen.iter().enumerate() {
        let theta = (index as f32 / n) * std::f32::consts::TAU;
        out.insert(
            item.id.clone(),
            (50.0 + 18.0 * theta.cos(), 50.0 + 14.0 * theta.sin()),
        );
    }

    out
}

fn select_item(
    selected_id: &str,
    active_topic: &str,
    topics: &[Topic],
    scored: &[(WorkItem, f32, bool)],
) -> Selected {
    if let Some((item, _, _)) = scored
        .iter()
        .find(|(item, _, visible)| item.id == selected_id && *visible)
    {
        return selected_from_item(item);
    }

    if let Some(topic) = topics
        .iter()
        .find(|topic| topic.id == active_topic && topic.id != "all")
    {
        return Selected {
            id: topic.id.clone(),
            kind: "topic".into(),
            title: topic.label.clone(),
            summary: topic.summary.clone(),
            tags: topic.tags.clone(),
            url: "./blog/".into(),
        };
    }

    scored
        .iter()
        .find(|(_, _, visible)| *visible)
        .map(|(item, _, _)| selected_from_item(item))
        .unwrap_or_else(|| Selected {
            id: "data-platforms".into(),
            kind: "topic".into(),
            title: "Data platforms".into(),
            summary: "Pipelines, lakehouse systems, and analytical storage.".into(),
            tags: vec!["Iceberg".into(), "Lakehouse".into()],
            url: "./blog/".into(),
        })
}

fn selected_from_item(item: &WorkItem) -> Selected {
    Selected {
        id: item.id.clone(),
        kind: item.kind.clone(),
        title: item.title.clone(),
        summary: item.summary.clone(),
        tags: item.tags.clone(),
        url: item.url.clone(),
    }
}

fn result_card(item: &WorkItem, score: f32) -> ResultCard {
    ResultCard {
        id: item.id.clone(),
        kind: item.kind.clone(),
        title: item.title.clone(),
        summary: item.summary.clone(),
        tags: item.tags.clone(),
        url: item.url.clone(),
        score,
    }
}

fn count_topics(topics: &[Topic], scored: &[(WorkItem, f32, bool)]) -> Vec<TopicCount> {
    topics
        .iter()
        .map(|topic| {
            let count = if topic.id == "all" {
                scored
                    .iter()
                    .filter(|(item, _, _)| item.kind != "topic")
                    .count()
            } else {
                scored
                    .iter()
                    .filter(|(item, _, _)| item.topics.iter().any(|t| t == &topic.id))
                    .count()
            };
            TopicCount {
                id: topic.id.clone(),
                label: topic.label.clone(),
                count,
            }
        })
        .collect()
}
