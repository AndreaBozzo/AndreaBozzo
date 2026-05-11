use crate::classify::topics_for_text;
use crate::models::{Output, SimNode, SimState, WorkItem};
use crate::query;
use crate::simulation::{BOUND_HIGH, BOUND_LOW, simulate};
use crate::workbench::score_query;
use crate::{build_workbench, tick_layout};

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
        stars: 0.0,
        prs: 0.0,
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
    let topics = topics_for_text("Zero Grappler is an embedded TinyML crate built with Embassy");
    assert!(!topics.contains(&"scraping".to_string()));
    assert!(topics.contains(&"rust-systems".to_string()));
    assert!(topics.contains(&"ml-systems".to_string()));
}

#[test]
fn finops_maps_to_data_platforms_not_ml_systems() {
    let topics = topics_for_text("FinOps and DBU cost controls for a lakehouse architecture");
    assert!(topics.contains(&"data-platforms".to_string()));
    assert!(!topics.contains(&"ml-systems".to_string()));
}

#[test]
fn query_parser_respects_precedence_and_parens() {
    let parsed = query::parse("tech:rust AND (topic:streaming OR topic:data-platforms)")
        .unwrap()
        .unwrap();
    let item = WorkItem {
        id: "x".into(),
        kind: "project".into(),
        label: "RisingWave".into(),
        title: "RisingWave".into(),
        summary: "Streaming database work".into(),
        tags: vec!["Rust".into()],
        topics: vec!["streaming".into()],
        url: "/".into(),
        base_score: 0.0,
        stars: 9_000.0,
        prs: 1.0,
    };
    assert!(query::evaluate(&parsed, &item).matched);
}

#[test]
fn query_parser_handles_not_and_numeric_comparisons() {
    let parsed = query::parse("stars:>50 AND NOT topic:streaming")
        .unwrap()
        .unwrap();
    let item = WorkItem {
        id: "x".into(),
        kind: "project".into(),
        label: "polars".into(),
        title: "polars".into(),
        summary: "DataFrame engine".into(),
        tags: vec!["Rust".into()],
        topics: vec!["data-platforms".into()],
        url: "/".into(),
        base_score: 0.0,
        stars: 38_400.0,
        prs: 3.0,
    };
    assert!(query::evaluate(&parsed, &item).matched);
}

#[test]
fn query_parser_reports_malformed_input_offsets() {
    let error =
        query::parse("tech:rust AND (topic:streaming OR").expect_err("query should be malformed");
    assert!(error.offset > 0);
    assert!(error.message.contains("expected"));
}

#[test]
fn build_workbench_surfaces_query_errors_without_crashing() {
    let payload = r#"{
            "topics": [{"id": "all", "label": "All work"}],
            "contributions": [{"name": "polars", "desc": "Rust-native analytics", "url": "https://github.com/pola-rs/polars", "stars": "38.4k", "prs": "3"}],
            "query": "stars:>"
        }"#;

    let out: serde_json::Value = serde_json::from_str(&build_workbench(payload)).unwrap();
    assert_eq!(out["queryError"]["offset"], 6);
    assert!(out["results"].as_array().is_some());
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
