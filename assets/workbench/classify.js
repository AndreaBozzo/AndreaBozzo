export function normalizeText(value) {
    return String(value || '').toLowerCase();
}

export function topicForItem(text) {
    const haystack = normalizeText(text);
    const matches = [];

    if (/(iceberg|lakehouse|pipeline|storage|lance|arrow|tabular|database|data platform|analytics|profiler|contract)/.test(haystack)) {
        matches.push('data-platforms');
    }
    if (/(rust|polars|tokio|axum|async|runtime|no_std|embassy|embedded)/.test(haystack)) {
        matches.push('rust-systems');
    }
    if (/(streaming|risingwave|event-driven|jetstream|websocket|webhook|server-sent|\bsse\b|\bnats\b|grpc)/.test(haystack)) {
        matches.push('streaming');
    }
    if (/(scrap|harvest|ares|ceres|schema extraction|json schema|open data portal|web scraper)/.test(haystack)) {
        matches.push('scraping');
    }
    if (/(finops|cost|dbu|green ai|edge ai|machine learning|tinyml|llm|agent|physical ai|robotics|\bml\b)/.test(haystack)) {
        matches.push('ai-finops');
    }

    return matches.length ? matches : ['data-platforms'];
}

export function itemTags(item) {
    if (Array.isArray(item.tags) && item.tags.length) {
        return item.tags.slice(0, 4);
    }

    const source = normalizeText(`${item.title || item.label} ${item.summary || ''}`);
    const tags = [];
    if (source.includes('rust')) tags.push('Rust');
    if (source.includes('iceberg')) tags.push('Iceberg');
    if (source.includes('lakehouse')) tags.push('Lakehouse');
    if (source.includes('stream')) tags.push('Streaming');
    if (source.includes('scrap') || source.includes('harvest')) tags.push('Harvesting');
    if (source.includes('ai')) tags.push('AI');
    return tags.slice(0, 4);
}