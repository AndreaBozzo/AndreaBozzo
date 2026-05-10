pub(crate) fn compact_tags(mut tags: Vec<String>, max: usize) -> Vec<String> {
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

pub(crate) fn contains_any(haystack: &str, needles: &[&str]) -> bool {
	needles.iter().any(|needle| haystack.contains(needle))
}

pub(crate) fn first_non_empty(left: &str, right: &str) -> String {
	if left.trim().is_empty() {
		right.to_string()
	} else {
		left.to_string()
	}
}

pub(crate) fn title_from_slug(slug: &str) -> String {
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

pub(crate) fn slugify(slug: &str, fallback: &str) -> String {
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

pub(crate) fn small_hash(s: &str) -> u32 {
	let mut h: u32 = 2166136261;
	for b in s.bytes() {
		h ^= b as u32;
		h = h.wrapping_mul(16777619);
	}
	h
}