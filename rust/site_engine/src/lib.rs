//! Pure workbench engine for the Andrea Bozzo static site.
//!
//! The browser owns fetching and rendering. This crate owns deterministic item
//! normalization, topic scoring, search ranking, and graph coordinates.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn build_workbench(payload_json: &str) -> String {
    serde_json::to_string(&build(parse_payload(payload_json))).unwrap_or_else(|_| "{}".to_string())
}

#[wasm_bindgen]
pub fn tick_layout(state_json: &str) -> String {
    let state: SimState = serde_json::from_str(state_json).unwrap_or_default();
    serde_json::to_string(&simulate(state)).unwrap_or_else(|_| "{}".to_string())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    #[serde(default)]
    topics: Vec<Topic>,
    #[serde(default)]
    posts: Vec<Post>,
    #[serde(default)]
    contributions: Vec<Contribution>,
    #[serde(default)]
    case_studies: Vec<CaseStudy>,
    #[serde(default)]
    active_topic: String,
    #[serde(default)]
    query: String,
    #[serde(default)]
    selected_id: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct Topic {
    #[serde(default)]
    id: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct Post {
    #[serde(default)]
    title: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    permalink: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    content: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct Contribution {
    #[serde(default)]
    name: String,
    #[serde(default)]
    desc: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    stars: String,
    #[serde(default)]
    prs: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseStudy {
    #[serde(default)]
    slug: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    subtitle: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    stack: Vec<String>,
    #[serde(default)]
    status: String,
    #[serde(default)]
    repo_url: String,
    #[serde(default)]
    related_posts: Vec<String>,
    #[serde(default)]
    cover_image: String,
    #[serde(default)]
    media_slots: Vec<MediaSlot>,
    #[serde(default)]
    sections: Vec<CaseSection>,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct MediaSlot {
    #[serde(default)]
    label: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    placeholder: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct CaseSection {
    #[serde(default)]
    heading: String,
    #[serde(default)]
    body: String,
}

#[derive(Debug, Clone)]
struct WorkItem {
    id: String,
    kind: String,
    label: String,
    title: String,
    summary: String,
    tags: Vec<String>,
    topics: Vec<String>,
    url: String,
    base_score: f32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Output {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    results: Vec<ResultCard>,
    selected: Selected,
    topics: Vec<TopicCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Edge {
    from: String,
    to: String,
    kind: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Node {
    id: String,
    kind: String,
    label: String,
    x: f32,
    y: f32,
    score: f32,
    visible: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ResultCard {
    id: String,
    kind: String,
    title: String,
    summary: String,
    tags: Vec<String>,
    url: String,
    score: f32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Selected {
    id: String,
    kind: String,
    title: String,
    summary: String,
    tags: Vec<String>,
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TopicCount {
    id: String,
    label: String,
    count: usize,
}

fn parse_payload(payload_json: &str) -> Payload {
    serde_json::from_str(payload_json).unwrap_or_default()
}

fn build(mut payload: Payload) -> Output {
    if payload.active_topic.trim().is_empty() {
        payload.active_topic = "all".to_string();
    }

    let topics = normalize_topics(std::mem::take(&mut payload.topics));
    let items = normalize_items(&payload);
    let query = payload.query.trim().to_lowercase();
    let active_topic = payload.active_topic.as_str();

    let mut scored: Vec<(WorkItem, f32, bool)> = items
        .into_iter()
        .map(|item| {
            let topic_match =
                active_topic == "all" || item.topics.iter().any(|t| t == active_topic);
            let search_score = score_query(&item, &query);
            let visible = topic_match && (query.is_empty() || search_score > 0.0);
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
    let mut by_kind_counts: std::collections::HashMap<&str, usize> =
        std::collections::HashMap::new();
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
    }
}

fn derive_edges(items: &[WorkItem]) -> Vec<Edge> {
    let topic_ids: std::collections::HashSet<&str> = items
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
        for slot in &study.media_slots {
            if !slot.label.is_empty() {
                tags.push(slot.label.clone());
            }
            if !slot.kind.is_empty() {
                tags.push(slot.kind.clone());
            }
            if !slot.placeholder.is_empty() {
                tags.push(slot.placeholder.clone());
            }
        }
        for section in &study.sections {
            if !section.heading.is_empty() {
                tags.push(section.heading.clone());
            }
            if !section.body.is_empty() {
                tags.push(section.body.clone());
            }
        }
        let text = format!(
            "{} {} {} {} {} {} {}",
            study.title,
            study.subtitle,
            study.summary,
            study.stack.join(" "),
            study.related_posts.join(" "),
            study.repo_url,
            study.cover_image
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
        });
    }

    for (index, contribution) in payload.contributions.iter().enumerate() {
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
        });
    }

    out
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
        })
        .collect()
}

fn score_query(item: &WorkItem, query: &str) -> f32 {
    if query.is_empty() {
        return 0.0;
    }
    let haystack = format!(
        "{} {} {} {} {}",
        item.title,
        item.label,
        item.summary,
        item.tags.join(" "),
        item.topics.join(" ")
    )
    .to_lowercase();

    query
        .split_whitespace()
        .map(|term| {
            if item.title.to_lowercase().contains(term) {
                4.0
            } else if item
                .tags
                .iter()
                .any(|tag| tag.to_lowercase().contains(term))
            {
                3.0
            } else if haystack.contains(term) {
                1.5
            } else {
                0.0
            }
        })
        .sum()
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
    if let Some((item, score, _)) = scored
        .iter()
        .find(|(item, _, visible)| item.id == selected_id && *visible)
    {
        return selected_from_item(item, *score);
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
        .map(|(item, score, _)| selected_from_item(item, *score))
        .unwrap_or_else(|| Selected {
            id: "data-platforms".into(),
            kind: "topic".into(),
            title: "Data platforms".into(),
            summary: "Pipelines, lakehouse systems, and analytical storage.".into(),
            tags: vec!["Iceberg".into(), "Lakehouse".into()],
            url: "./blog/".into(),
        })
}

fn selected_from_item(item: &WorkItem, _score: f32) -> Selected {
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

fn topics_for_text(text: &str) -> Vec<String> {
    let haystack = text.to_lowercase();
    let mut topics = Vec::new();
    if contains_any(
        &haystack,
        &[
            "iceberg",
            "lakehouse",
            "pipeline",
            "storage",
            "lance",
            "arrow",
            "tabular",
            "database",
            "data platform",
            "analytics",
            "profiler",
            "contract",
        ],
    ) {
        topics.push("data-platforms".to_string());
    }
    if contains_any(
        &haystack,
        &[
            "rust", "polars", "tokio", "axum", "async", "runtime", "no_std", "embassy", "embedded",
        ],
    ) {
        topics.push("rust-systems".to_string());
    }
    if contains_any(
        &haystack,
        &[
            "streaming",
            "risingwave",
            "event-driven",
            "jetstream",
            "websocket",
            "webhook",
            "server-sent",
            "sse",
            "nats",
            "grpc",
        ],
    ) {
        topics.push("streaming".to_string());
    }
    if contains_any(
        &haystack,
        &[
            "scrap",
            "harvest",
            "ares",
            "ceres",
            "schema extraction",
            "json schema",
            "open data portal",
            "web scraper",
        ],
    ) {
        topics.push("scraping".to_string());
    }
    if contains_any(
        &haystack,
        &[
            "finops",
            "cost",
            "dbu",
            "green ai",
            "edge ai",
            "machine learning",
            "tinyml",
            "llm",
            "agent",
            "physical ai",
            "robotics",
            " ml ",
        ],
    ) {
        topics.push("ai-finops".to_string());
    }
    if topics.is_empty() {
        topics.push("data-platforms".to_string());
    }
    topics.sort();
    topics.dedup();
    topics
}

fn tags_for_text(text: &str) -> Vec<String> {
    let haystack = text.to_lowercase();
    let candidates = [
        ("rust", "Rust"),
        ("python", "Python"),
        ("go", "Go"),
        ("iceberg", "Iceberg"),
        ("lakehouse", "Lakehouse"),
        ("stream", "Streaming"),
        ("scrap", "Harvesting"),
        ("arrow", "Arrow"),
        ("polars", "Polars"),
        ("ai", "AI"),
    ];
    candidates
        .iter()
        .filter(|(needle, _)| haystack.contains(needle))
        .map(|(_, label)| (*label).to_string())
        .collect()
}

fn compact_tags(mut tags: Vec<String>, max: usize) -> Vec<String> {
    if tags.is_empty() {
        return Vec::new();
    }
    tags.retain(|tag| !tag.trim().is_empty());
    for tag in &mut tags {
        *tag = tag.trim().to_string();
    }
    tags.sort_by_key(|tag| tag.to_lowercase());
    tags.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    tags.truncate(max);
    tags
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn first_non_empty(left: &str, right: &str) -> String {
    if left.trim().is_empty() {
        right.to_string()
    } else {
        left.to_string()
    }
}

fn title_from_slug(slug: &str) -> String {
    slug.replace('-', " ")
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn slugify(slug: &str, fallback: &str) -> String {
    let source = if slug.trim().is_empty() {
        fallback
    } else {
        slug
    };
    let mut out = String::new();
    let mut last_dash = false;
    for ch in source.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn small_hash(s: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

// ---- Force-directed layout simulation ----
//
// Coords are in the same 0..100 space the radial layout already uses, so the
// existing CSS percentage positioning continues to work for the DOM fallback
// path while the new canvas renderer maps 0..100 to pixels.
//
// Algorithm: classic spring-electrical model with an O(n^2) repulsion loop.
// At ~14 nodes that's ~200 ops per tick — quadtree (Barnes-Hut) would be
// premature here. Revisit if node count grows past ~100.

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimState {
    #[serde(default)]
    nodes: Vec<SimNode>,
    #[serde(default)]
    edges: Vec<Edge>,
    #[serde(default)]
    selected_id: String,
    #[serde(default)]
    dt: f32,
    /// Cooling coefficient in (0, 1]. Caller decreases it across ticks so the
    /// system anneals into a stable layout even with a noisy start. Defaults
    /// to 1.0 for hot starts.
    #[serde(default)]
    temperature: f32,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
struct SimNode {
    id: String,
    #[serde(default)]
    kind: String,
    x: f32,
    y: f32,
    #[serde(default)]
    vx: f32,
    #[serde(default)]
    vy: f32,
    /// Radius in simulation units. Used by repulsion to keep visible circles
    /// from overlapping. 0 means "treat as point particle".
    #[serde(default)]
    radius: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimResult {
    nodes: Vec<SimNode>,
    kinetic_energy: f32,
}

const REPULSION: f32 = 8.0;
const SPRING_K: f32 = 0.18;
const SPRING_REST: f32 = 16.0;
const DAMPING: f32 = 0.80;
const FOCUS_PULL: f32 = 0.015;
const CENTER_PULL: f32 = 0.13;
const COLLISION_PAD: f32 = 1.2;
const COLLISION_K: f32 = 1.2;
const MIN_DIST: f32 = 2.0;
const MAX_VEL: f32 = 2.5;
const BOUND_LOW: f32 = 14.0;
const BOUND_HIGH: f32 = 86.0;

fn simulate(mut state: SimState) -> SimResult {
    let dt = if state.dt > 0.0 && state.dt <= 2.0 {
        state.dt
    } else {
        1.0
    };
    let temperature = if state.temperature > 0.0 && state.temperature <= 1.0 {
        state.temperature
    } else {
        1.0
    };
    let n = state.nodes.len();
    if n == 0 {
        return SimResult {
            nodes: Vec::new(),
            kinetic_energy: 0.0,
        };
    }

    let mut fx = vec![0.0_f32; n];
    let mut fy = vec![0.0_f32; n];

    // Repulsion (Coulomb-like, 1/dist falloff) plus a stiff collision force
    // that activates when circles would visually overlap. The collision term
    // is what stops nodes from drawing on top of each other; long-range
    // repulsion just helps the layout breathe.
    let min_dist_sq = MIN_DIST * MIN_DIST;
    for i in 0..n {
        for j in (i + 1)..n {
            let mut dx = state.nodes[i].x - state.nodes[j].x;
            let mut dy = state.nodes[i].y - state.nodes[j].y;
            let mut dist_sq = dx * dx + dy * dy;
            if dist_sq < min_dist_sq {
                let bias = ((i * 17 + j * 31) % 7) as f32 * 0.01 + 0.05;
                dx += bias;
                dy -= bias;
                dist_sq = (dx * dx + dy * dy).max(min_dist_sq);
            }
            let dist = dist_sq.sqrt();
            let ux = dx / dist;
            let uy = dy / dist;
            let mut force = REPULSION / dist;

            let target = state.nodes[i].radius + state.nodes[j].radius + COLLISION_PAD;
            if dist < target {
                force += COLLISION_K * (target - dist);
            }

            fx[i] += ux * force;
            fy[i] += uy * force;
            fx[j] -= ux * force;
            fy[j] -= uy * force;
        }
    }

    // Spring attraction along edges.
    let id_to_index: std::collections::HashMap<&str, usize> = state
        .nodes
        .iter()
        .enumerate()
        .map(|(idx, node)| (node.id.as_str(), idx))
        .collect();
    for edge in &state.edges {
        let (Some(&i), Some(&j)) = (
            id_to_index.get(edge.from.as_str()),
            id_to_index.get(edge.to.as_str()),
        ) else {
            continue;
        };
        let dx = state.nodes[j].x - state.nodes[i].x;
        let dy = state.nodes[j].y - state.nodes[i].y;
        let dist = (dx * dx + dy * dy).sqrt().max(MIN_DIST);
        let displacement = dist - SPRING_REST;
        let force = SPRING_K * displacement;
        let ux = dx / dist;
        let uy = dy / dist;
        fx[i] += ux * force;
        fy[i] += uy * force;
        fx[j] -= ux * force;
        fy[j] -= uy * force;
    }

    // Centering pull + selected-node focus pull.
    let selected_idx = if state.selected_id.is_empty() {
        None
    } else {
        id_to_index.get(state.selected_id.as_str()).copied()
    };
    let (focus_x, focus_y) = match selected_idx {
        Some(idx) => (state.nodes[idx].x, state.nodes[idx].y),
        None => (50.0, 50.0),
    };
    for i in 0..n {
        fx[i] += (50.0 - state.nodes[i].x) * CENTER_PULL;
        fy[i] += (50.0 - state.nodes[i].y) * CENTER_PULL;
        if selected_idx.is_some() && Some(i) != selected_idx {
            fx[i] += (focus_x - state.nodes[i].x) * FOCUS_PULL;
            fy[i] += (focus_y - state.nodes[i].y) * FOCUS_PULL;
        }
    }

    // Integrate. Temperature scales the effective velocity so the caller can
    // anneal over time by walking it from 1.0 down to ~0.3.
    let max_step = MAX_VEL * temperature;
    let mut ke = 0.0_f32;
    for i in 0..n {
        if Some(i) == selected_idx {
            state.nodes[i].vx = 0.0;
            state.nodes[i].vy = 0.0;
            continue;
        }
        let mut vx = (state.nodes[i].vx + fx[i] * dt) * DAMPING;
        let mut vy = (state.nodes[i].vy + fy[i] * dt) * DAMPING;
        let speed = (vx * vx + vy * vy).sqrt();
        if speed > max_step {
            let scale = max_step / speed;
            vx *= scale;
            vy *= scale;
        }
        state.nodes[i].vx = vx;
        state.nodes[i].vy = vy;
        state.nodes[i].x = (state.nodes[i].x + vx * dt).clamp(BOUND_LOW, BOUND_HIGH);
        state.nodes[i].y = (state.nodes[i].y + vy * dt).clamp(BOUND_LOW, BOUND_HIGH);
        ke += vx * vx + vy * vy;
    }

    SimResult {
        nodes: state.nodes,
        kinetic_energy: ke,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> &'static str {
        r#"{
            "topics": [
                {"id": "all", "label": "All work"},
                {"id": "data-platforms", "label": "Data platforms"},
                {"id": "rust-systems", "label": "Rust systems"}
            ],
            "posts": [
                {"title": "Async in Python and Rust", "summary": "Tokio and asyncio", "tags": ["Rust", "Python"], "permalink": "/blog/async/"}
            ],
            "contributions": [
                {"name": "polars", "desc": "Rust-native analytics", "url": "https://github.com/pola-rs/polars"}
            ],
            "caseStudies": [
                {"slug": "dataprof", "title": "dataprof", "summary": "Arrow-powered data profiler", "stack": ["Rust", "Apache Arrow"]}
            ],
            "activeTopic": "rust-systems",
            "query": "rust",
            "selectedId": "case-dataprof"
        }"#
    }

    #[test]
    fn malformed_json_falls_back_to_empty_output() {
        let out = build_workbench("{not-json");
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(!parsed["nodes"].as_array().unwrap().is_empty());
        assert!(parsed["results"].as_array().unwrap().is_empty());
    }

    #[test]
    fn topic_matching_detects_rust_and_data_platforms() {
        let topics = topics_for_text("Rust Apache Arrow profiler with Polars");
        assert!(topics.contains(&"rust-systems".to_string()));
        assert!(topics.contains(&"data-platforms".to_string()));
    }

    #[test]
    fn search_ranking_prioritizes_title_matches() {
        let item = WorkItem {
            id: "x".into(),
            kind: "post".into(),
            label: "Rust async".into(),
            title: "Rust async".into(),
            summary: "Tokio".into(),
            tags: vec!["Python".into()],
            topics: vec!["rust-systems".into()],
            url: "/".into(),
            base_score: 0.0,
        };
        assert!(score_query(&item, "rust") > score_query(&item, "tokio"));
    }

    #[test]
    fn graph_coordinates_are_deterministic() {
        let a: Output = serde_json::from_str(&build_workbench(sample_payload())).unwrap();
        let b: Output = serde_json::from_str(&build_workbench(sample_payload())).unwrap();
        let a_nodes: Vec<_> = a.nodes.iter().map(|n| (&n.id, n.x, n.y)).collect();
        let b_nodes: Vec<_> = b.nodes.iter().map(|n| (&n.id, n.x, n.y)).collect();
        assert_eq!(a_nodes, b_nodes);
    }

    #[test]
    fn selected_item_drops_hidden_selection_when_filtered() {
        let payload = r#"{
            "topics": [
                {"id": "all", "label": "All work"},
                {"id": "scraping", "label": "Harvesting", "summary": "Collection systems"}
            ],
            "caseStudies": [
                {"slug": "dataprof", "title": "dataprof", "summary": "Arrow-powered data profiler", "stack": ["Rust", "Apache Arrow"]},
                {"slug": "ares", "title": "Ares", "summary": "Schema-driven web scraper", "stack": ["Rust", "Web Scraping"]}
            ],
            "activeTopic": "scraping",
            "query": "",
            "selectedId": "case-dataprof"
        }"#;

        let out: Output = serde_json::from_str(&build_workbench(payload)).unwrap();
        assert_eq!(out.selected.id, "scraping");
        assert_ne!(out.selected.id, "case-dataprof");
    }

    #[test]
    fn grappler_no_longer_maps_to_scraping_topic() {
        let topics =
            topics_for_text("Zero Grappler is an embedded TinyML crate built with Embassy");
        assert!(!topics.contains(&"scraping".to_string()));
        assert!(topics.contains(&"rust-systems".to_string()));
    }

    #[test]
    fn build_emits_edges_from_items_to_topics() {
        let out: Output = serde_json::from_str(&build_workbench(sample_payload())).unwrap();
        let topic_ids: std::collections::HashSet<&str> = out
            .nodes
            .iter()
            .filter(|n| n.kind == "topic")
            .map(|n| n.id.as_str())
            .collect();
        assert!(!out.edges.is_empty());
        for edge in &out.edges {
            assert!(
                topic_ids.contains(edge.to.as_str()),
                "edge target should be a topic node"
            );
        }
    }

    #[test]
    fn force_sim_converges() {
        let payload: SimState = serde_json::from_str(
            r#"{
                "nodes": [
                    {"id": "a", "kind": "topic", "x": 50.0, "y": 50.0, "vx": 0.0, "vy": 0.0},
                    {"id": "b", "kind": "post", "x": 50.0, "y": 50.5, "vx": 0.0, "vy": 0.0},
                    {"id": "c", "kind": "post", "x": 49.5, "y": 50.0, "vx": 0.0, "vy": 0.0}
                ],
                "edges": [{"from": "b", "to": "a", "kind": "topic"}],
                "selectedId": "",
                "dt": 1.0
            }"#,
        )
        .unwrap();

        let mut state = payload;
        let mut last_ke = f32::INFINITY;
        for tick in 0..200 {
            let temperature = (1.0 - (tick as f32 / 200.0)).max(0.05);
            let result = simulate(SimState {
                nodes: state.nodes,
                edges: state.edges.clone(),
                selected_id: state.selected_id.clone(),
                dt: 1.0,
                temperature,
            });
            state = SimState {
                nodes: result.nodes,
                edges: state.edges,
                selected_id: state.selected_id,
                dt: 1.0,
                temperature,
            };
            last_ke = result.kinetic_energy;
        }
        assert!(last_ke < 0.05, "expected sim to settle, last_ke={last_ke}");
        // Coincident nodes should have separated.
        let dx = state.nodes[1].x - state.nodes[2].x;
        let dy = state.nodes[1].y - state.nodes[2].y;
        assert!((dx * dx + dy * dy).sqrt() > 1.0);
    }

    #[test]
    fn selected_node_anchors_position() {
        let payload: SimState = serde_json::from_str(
            r#"{
                "nodes": [
                    {"id": "anchor", "kind": "topic", "x": 30.0, "y": 30.0},
                    {"id": "free", "kind": "post", "x": 70.0, "y": 70.0}
                ],
                "edges": [],
                "selectedId": "anchor",
                "dt": 1.0
            }"#,
        )
        .unwrap();

        let result = simulate(payload);
        let anchor = result.nodes.iter().find(|n| n.id == "anchor").unwrap();
        assert!((anchor.x - 30.0).abs() < 0.01);
        assert!((anchor.y - 30.0).abs() < 0.01);
        assert!((anchor.vx).abs() < 0.001);
    }

    #[test]
    fn coincident_points_do_not_blow_up() {
        let payload = SimState {
            nodes: vec![
                SimNode {
                    id: "a".into(),
                    kind: "topic".into(),
                    x: 50.0,
                    y: 50.0,
                    vx: 0.0,
                    vy: 0.0,
                    radius: 6.5,
                },
                SimNode {
                    id: "b".into(),
                    kind: "post".into(),
                    x: 50.0,
                    y: 50.0,
                    vx: 0.0,
                    vy: 0.0,
                    radius: 4.0,
                },
            ],
            edges: vec![],
            selected_id: String::new(),
            dt: 1.0,
            temperature: 1.0,
        };
        let result = simulate(payload);
        for node in &result.nodes {
            assert!(node.x.is_finite() && node.y.is_finite());
            assert!(node.x >= BOUND_LOW && node.x <= BOUND_HIGH);
            assert!(node.y >= BOUND_LOW && node.y <= BOUND_HIGH);
        }
    }

    #[test]
    fn tick_layout_handles_malformed_json() {
        let out = tick_layout("{not-json");
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["nodes"].as_array().unwrap().len(), 0);
    }
}
