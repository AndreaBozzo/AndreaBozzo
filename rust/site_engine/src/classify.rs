use crate::utils::contains_any;

pub(crate) fn topics_for_text(text: &str) -> Vec<String> {
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
			"rust",
			"polars",
			"tokio",
			"axum",
			"async",
			"runtime",
			"no_std",
			"embassy",
			"embedded",
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

pub(crate) fn tags_for_text(text: &str) -> Vec<String> {
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