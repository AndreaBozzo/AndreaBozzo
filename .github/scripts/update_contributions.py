#!/usr/bin/env python3
"""
Fetch and categorize external open source contributions for README.md.

This script:
1. Fetches all merged PRs from external repositories
2. Auto-categorizes repos using GitHub topics and keyword matching
3. Generates markdown tables grouped by category
4. Updates README.md between marker comments
"""

import os
import re
import time

import requests

USERNAME = "AndreaBozzo"
TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}

# Category order and icons
CATEGORIES = ["Data Ecosystem", "Rust Tooling", "AI/ML", "Infrastructure", "Other"]

CATEGORY_HEADERS = {
    "Data Ecosystem": "### 🔬 Data Ecosystem",
    "Rust Tooling": "### 🦀 Rust Tooling",
    "AI/ML": "### 🤖 AI/ML",
    "Infrastructure": "### 🛠️ Infrastructure",
    "Other": "### 📦 Other",
}

# Topics for categorization (weight: 3 per match)
CATEGORY_TOPICS = {
    "Data Ecosystem": {
        "dataframe", "data", "analytics", "etl", "cdc", "streaming",
        "database", "sql", "postgresql", "postgres", "arrow", "parquet",
        "iceberg", "delta-lake", "lakehouse", "olap", "query-engine",
        "data-engineering", "data-pipeline", "polars", "duckdb", "kafka",
        "flink", "spark", "bigdata", "data-science", "timeseries",
    },
    "Rust Tooling": {
        "rust", "rustlang", "cargo", "crate", "cli", "command-line",
        "developer-tools", "devtools", "parser", "compiler", "tokio",
        "async-rust", "rust-library",
    },
    "AI/ML": {
        "ai", "ml", "machine-learning", "deep-learning", "llm", "gpt",
        "neural-network", "nlp", "computer-vision", "generative-ai",
        "artificial-intelligence", "robotics", "chatbot", "transformers",
        "langchain", "openai", "rag",
    },
    "Infrastructure": {
        "infrastructure", "devops", "kubernetes", "docker", "cloud",
        "monitoring", "security", "honeypot", "networking", "ci-cd",
        "terraform", "ansible", "aws", "azure", "gcp",
    },
}

# Keyword patterns for name/description matching (weight: 1 per match)
KEYWORD_PATTERNS = {
    "Data Ecosystem": [
        r"\bdata\b", r"query", r"\bsql\b", r"\betl\b", r"\bcdc\b",
        r"stream", r"postgres", r"iceberg", r"lakehouse", r"arrow",
        r"parquet", r"polars", r"duckdb", r"analytics",
    ],
    "Rust Tooling": [r"-rs$", r"\.rs\b", r"\brust\b"],
    "AI/ML": [
        r"\bai\b", r"\bml\b", r"\bllm\b", r"\bgpt\b", r"robot",
        r"neural", r"machine.?learning",
    ],
    "Infrastructure": [
        r"deploy", r"infra", r"docker", r"kube", r"security",
        r"honeypot", r"devops",
    ],
}


def safe_request(url, max_retries=3):
    """Make API request with rate limit handling."""
    for attempt in range(max_retries):
        response = requests.get(url, headers=HEADERS, timeout=30)

        if response.status_code == 403:
            reset_time = int(
                response.headers.get("X-RateLimit-Reset", time.time() + 60)
            )
            wait_time = max(reset_time - time.time(), 10)
            print(f"Rate limited. Waiting {min(wait_time, 120):.0f}s...")
            time.sleep(min(wait_time, 120))
            continue

        response.raise_for_status()
        return response.json()

    raise RuntimeError(f"Failed after {max_retries} retries: {url}")


def fetch_all_prs():
    """Fetch all merged PRs with pagination."""
    all_prs = []
    page = 1

    while True:
        url = (
            f"https://api.github.com/search/issues?"
            f"q=author:{USERNAME}+type:pr+is:merged+-user:{USERNAME}"
            f"&per_page=100&page={page}"
        )
        data = safe_request(url)
        items = data.get("items", [])
        all_prs.extend(items)

        total = data.get("total_count", 0)
        if len(items) < 100 or len(all_prs) >= total:
            break

        page += 1
        time.sleep(1)  # Be nice to API

    return all_prs


def categorize_repo(repo_info):
    """Determine category for a repository using multi-signal scoring."""
    scores = {cat: 0 for cat in CATEGORIES if cat != "Other"}

    # Signal 1: Topics (weight: 3)
    for topic in repo_info.get("topics", []):
        topic_lower = topic.lower()
        for cat, keywords in CATEGORY_TOPICS.items():
            if topic_lower in keywords:
                scores[cat] += 3

    # Signal 2: Name/Description keywords (weight: 1)
    text = f"{repo_info['full_name']} {repo_info.get('description', '')}".lower()
    for cat, patterns in KEYWORD_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                scores[cat] += 1

    # Signal 3: Language bonus (weight: 1)
    if repo_info.get("language") == "Rust":
        scores["Rust Tooling"] += 1

    best_cat = max(scores, key=scores.get)
    return best_cat if scores[best_cat] > 0 else "Other"


def format_stars(count):
    """Format star count with K suffix for thousands."""
    if count >= 1000:
        return f"{count / 1000:.1f}k"
    return str(count)


def truncate_desc(desc, max_len=65):
    """Truncate and sanitize description for table display."""
    if not desc:
        return "No description"
    desc = desc.replace("|", "-").replace("\n", " ").strip()
    if len(desc) <= max_len:
        return desc
    truncated = desc[: max_len - 3]
    # Try to break at word boundary
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return truncated + "..."


def generate_markdown(categorized_repos):
    """Generate final markdown output."""
    markdown_parts = []

    for category in CATEGORIES:
        repos = categorized_repos.get(category, [])
        if not repos:
            continue

        # Sort by stars descending
        repos.sort(key=lambda x: x["stars"], reverse=True)

        # Category header
        markdown_parts.append(CATEGORY_HEADERS[category])
        markdown_parts.append("")
        markdown_parts.append("| Project | Stars | PRs | Description |")
        markdown_parts.append("|---------|-------|-----|-------------|")

        for repo in repos:
            name = repo["full_name"]
            url = repo["url"]
            stars = format_stars(repo["stars"])
            prs = repo["pr_count"]
            desc = truncate_desc(repo["description"])

            markdown_parts.append(f"| [{name}]({url}) | {stars} | {prs} | {desc} |")

        markdown_parts.append("")

    return "\n".join(markdown_parts)


def main():
    """Main entry point."""
    try:
        print("Fetching merged PRs...")
        prs = fetch_all_prs()
        print(f"Found {len(prs)} merged PRs")

        # Extract unique repo URLs
        repo_urls = set(pr["repository_url"] for pr in prs)
        print(f"From {len(repo_urls)} unique repositories")

        # Fetch repo details (cached by URL)
        repo_cache = {}
        for repo_url in repo_urls:
            repo_info = safe_request(repo_url)
            repo_cache[repo_url] = repo_info
            time.sleep(0.3)  # Rate limit courtesy

        # Build repo data with PR counts
        repo_data = {}
        for pr in prs:
            repo_url = pr["repository_url"]
            repo_info = repo_cache[repo_url]
            full_name = repo_info["full_name"]

            if full_name not in repo_data:
                repo_data[full_name] = {
                    "full_name": full_name,
                    "url": repo_info["html_url"],
                    "description": repo_info.get("description", ""),
                    "stars": repo_info["stargazers_count"],
                    "topics": repo_info.get("topics", []),
                    "language": repo_info.get("language"),
                    "pr_count": 0,
                }
            repo_data[full_name]["pr_count"] += 1

        # Categorize repos
        categorized = {cat: [] for cat in CATEGORIES}
        for repo in repo_data.values():
            category = categorize_repo(repo)
            categorized[category].append(repo)

        # Print category summary
        for cat in CATEGORIES:
            count = len(categorized[cat])
            if count > 0:
                print(f"  {cat}: {count} repos")

        # Generate markdown
        markdown = generate_markdown(categorized)

        if not markdown.strip():
            markdown = "Currently building my contribution portfolio! Check back soon.\n"

        # Update README
        with open("README.md", "r", encoding="utf-8") as f:
            content = f.read()

        start_marker = "<!-- EXTERNAL_CONTRIBUTIONS:START -->"
        end_marker = "<!-- EXTERNAL_CONTRIBUTIONS:END -->"

        start_idx = content.find(start_marker) + len(start_marker)
        end_idx = content.find(end_marker)

        if start_idx > len(start_marker) and end_idx > -1:
            new_content = content[:start_idx] + "\n" + markdown + content[end_idx:]

            with open("README.md", "w", encoding="utf-8") as f:
                f.write(new_content)

            print("✅ README updated successfully!")
        else:
            print("❌ Could not find markers in README")

    except Exception as e:
        print(f"❌ Error: {e}")
        # Don't fail the workflow, just log the error


if __name__ == "__main__":
    main()
