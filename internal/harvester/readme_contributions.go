package harvester

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var sleepFor = time.Sleep

var categoryOrder = []string{"Data Ecosystem", "Rust Tooling", "AI/ML", "Infrastructure", "Other"}

var categoryHeaders = map[string]string{
	"Data Ecosystem": "### 🔬 Data Ecosystem",
	"Rust Tooling":   "### 🦀 Rust Tooling",
	"AI/ML":          "### 🤖 AI/ML",
	"Infrastructure": "### 🛠️ Infrastructure",
	"Other":          "### 📦 Other",
}

var categoryTopics = map[string][]string{
	"Data Ecosystem": {"dataframe", "data", "analytics", "etl", "cdc", "streaming", "database", "sql", "postgresql", "postgres", "arrow", "parquet", "iceberg", "delta-lake", "lakehouse", "olap", "query-engine", "data-engineering", "data-pipeline", "polars", "duckdb", "kafka", "flink", "spark", "bigdata", "data-science", "timeseries"},
	"Rust Tooling":   {"rust", "rustlang", "cargo", "crate", "cli", "command-line", "developer-tools", "devtools", "parser", "compiler", "tokio", "async-rust", "rust-library"},
	"AI/ML":          {"ai", "ml", "machine-learning", "deep-learning", "llm", "gpt", "neural-network", "nlp", "computer-vision", "generative-ai", "artificial-intelligence", "robotics", "chatbot", "transformers", "langchain", "openai", "rag"},
	"Infrastructure": {"infrastructure", "devops", "kubernetes", "docker", "cloud", "monitoring", "security", "honeypot", "networking", "ci-cd", "terraform", "ansible", "aws", "azure", "gcp"},
}

var keywordPatterns = map[string][]*regexp.Regexp{
	"Data Ecosystem": mustCompilePatterns(`\bdata\b`, `query`, `\bsql\b`, `\betl\b`, `\bcdc\b`, `stream`, `postgres`, `iceberg`, `lakehouse`, `arrow`, `parquet`, `polars`, `duckdb`, `analytics`),
	"Rust Tooling":   mustCompilePatterns(`-rs$`, `\.rs\b`, `\brust\b`),
	"AI/ML":          mustCompilePatterns(`\bai\b`, `\bml\b`, `\bllm\b`, `\bgpt\b`, `robot`, `neural`, `machine.?learning`),
	"Infrastructure": mustCompilePatterns(`deploy`, `infra`, `docker`, `kube`, `security`, `honeypot`, `devops`),
}

type githubPRSearchResponse struct {
	TotalCount int                 `json:"total_count"`
	Items      []githubPullRequest `json:"items"`
}

type githubPullRequest struct {
	RepositoryURL string `json:"repository_url"`
}

type githubRepoInfo struct {
	FullName        string   `json:"full_name"`
	HTMLURL         string   `json:"html_url"`
	Description     string   `json:"description"`
	StargazersCount int      `json:"stargazers_count"`
	Topics          []string `json:"topics"`
	Language        string   `json:"language"`
}

type contributionRepo struct {
	FullName string
	URL      string
	Desc     string
	Stars    int
	Topics   []string
	Language string
	PRCount  int
}

type githubClient struct {
	httpClient *http.Client
	token      string
}

func UpdateContributionsREADME(ctx context.Context, repoRoot, username string) error {
	client := githubClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		token:      strings.TrimSpace(os.Getenv("GITHUB_TOKEN")),
	}

	prs, err := client.fetchAllMergedPRs(ctx, username)
	if err != nil {
		return err
	}

	repoMap, err := client.fetchContributionRepos(ctx, prs)
	if err != nil {
		return err
	}

	categorized := map[string][]contributionRepo{}
	for _, repo := range repoMap {
		category := categorizeContributionRepo(repo)
		categorized[category] = append(categorized[category], repo)
	}

	markdown := renderContributionMarkdown(categorized)
	if strings.TrimSpace(markdown) == "" {
		markdown = "Currently building my contribution portfolio! Check back soon.\n"
	}

	readmePath := filepath.Join(repoRoot, "README.md")
	readme, err := os.ReadFile(readmePath)
	if err != nil {
		return fmt.Errorf("read README.md: %w", err)
	}

	updated, err := replaceBetweenMarkers(string(readme), "<!-- EXTERNAL_CONTRIBUTIONS:START -->", "<!-- EXTERNAL_CONTRIBUTIONS:END -->", markdown)
	if err != nil {
		return err
	}

	if err := os.WriteFile(readmePath, []byte(updated), 0o644); err != nil {
		return fmt.Errorf("write README.md: %w", err)
	}

	return nil
}

func (client githubClient) fetchAllMergedPRs(ctx context.Context, username string) ([]githubPullRequest, error) {
	prs := make([]githubPullRequest, 0, 128)
	for page := 1; ; page++ {
		endpoint := fmt.Sprintf("https://api.github.com/search/issues?q=author:%s+type:pr+is:merged+-user:%s&per_page=100&page=%d", url.QueryEscape(username), url.QueryEscape(username), page)
		var response githubPRSearchResponse
		if err := client.getJSON(ctx, endpoint, &response); err != nil {
			return nil, fmt.Errorf("fetch merged PRs page %d: %w", page, err)
		}
		prs = append(prs, response.Items...)
		if len(response.Items) < 100 || len(prs) >= response.TotalCount {
			break
		}
		sleepFor(time.Second)
	}
	return prs, nil
}

func (client githubClient) fetchContributionRepos(ctx context.Context, prs []githubPullRequest) (map[string]contributionRepo, error) {
	repoURLs := uniqueRepoURLs(prs)
	if len(repoURLs) == 0 {
		return map[string]contributionRepo{}, nil
	}

	type result struct {
		info githubRepoInfo
		err  error
	}

	jobs := make(chan string)
	results := make(chan result, len(repoURLs))
	workerCount := 6
	if len(repoURLs) < workerCount {
		workerCount = len(repoURLs)
	}

	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for repoURL := range jobs {
				var info githubRepoInfo
				err := client.getJSON(ctx, repoURL, &info)
				results <- result{info: info, err: err}
			}
		}()
	}

	go func() {
		for _, repoURL := range repoURLs {
			jobs <- repoURL
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()

	repoInfoByURL := make(map[string]githubRepoInfo, len(repoURLs))
	for result := range results {
		if result.err != nil {
			return nil, fmt.Errorf("fetch repository details: %w", result.err)
		}
		repoInfoByURL[apiURLForRepo(result.info.FullName)] = result.info
	}

	repoData := make(map[string]contributionRepo)
	for _, pr := range prs {
		info, ok := repoInfoByURL[pr.RepositoryURL]
		if !ok {
			continue
		}
		repo := repoData[info.FullName]
		if repo.FullName == "" {
			repo = contributionRepo{
				FullName: info.FullName,
				URL:      info.HTMLURL,
				Desc:     info.Description,
				Stars:    info.StargazersCount,
				Topics:   info.Topics,
				Language: info.Language,
			}
		}
		repo.PRCount++
		repoData[info.FullName] = repo
	}

	return repoData, nil
}

func (client githubClient) getJSON(ctx context.Context, endpoint string, target any) error {
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return fmt.Errorf("build request: %w", err)
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("User-Agent", "andreabozzo-harvester")
		if client.token != "" {
			req.Header.Set("Authorization", "Bearer "+client.token)
		}

		resp, err := client.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("request %s: %w", endpoint, err)
		}

		if resp.StatusCode == http.StatusForbidden && isGitHubRateLimited(resp) {
			resetAt := time.Now().Add(30 * time.Second)
			if raw := resp.Header.Get("X-RateLimit-Reset"); raw != "" {
				if unixSeconds, convErr := strconv.ParseInt(raw, 10, 64); convErr == nil {
					resetAt = time.Unix(unixSeconds, 0)
				}
			}
			_ = resp.Body.Close()
			sleep := time.Until(resetAt)
			if sleep < 10*time.Second {
				sleep = 10 * time.Second
			}
			if sleep > 2*time.Minute {
				sleep = 2 * time.Minute
			}
			sleepFor(sleep)
			continue
		}

		body, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return fmt.Errorf("read response for %s: %w", endpoint, readErr)
		}
		if resp.StatusCode >= 300 {
			return fmt.Errorf("github API %s returned %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
		}
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("decode response for %s: %w", endpoint, err)
		}
		return nil
	}
	return fmt.Errorf("github API %s exceeded retry budget", endpoint)
}

func isGitHubRateLimited(resp *http.Response) bool {
	return resp.Header.Get("X-RateLimit-Remaining") == "0"
}

func categorizeContributionRepo(repo contributionRepo) string {
	scores := map[string]int{
		"Data Ecosystem": 0,
		"Rust Tooling":   0,
		"AI/ML":          0,
		"Infrastructure": 0,
	}

	for _, topic := range repo.Topics {
		lower := strings.ToLower(topic)
		for category, keywords := range categoryTopics {
			for _, keyword := range keywords {
				if lower == keyword {
					scores[category] += 3
					break
				}
			}
		}
	}

	text := strings.ToLower(repo.FullName + " " + repo.Desc)
	for category, patterns := range keywordPatterns {
		for _, pattern := range patterns {
			if pattern.MatchString(text) {
				scores[category]++
			}
		}
	}

	if repo.Language == "Rust" {
		scores["Rust Tooling"]++
	}

	bestCategory := "Other"
	bestScore := 0
	for _, category := range categoryOrder[:len(categoryOrder)-1] {
		if scores[category] > bestScore {
			bestCategory = category
			bestScore = scores[category]
		}
	}
	return bestCategory
}

func renderContributionMarkdown(categorized map[string][]contributionRepo) string {
	totalRepos := 0
	totalPRs := 0
	totalStars := 0
	for _, category := range categoryOrder {
		for _, repo := range categorized[category] {
			totalRepos++
			totalPRs += repo.PRCount
			totalStars += repo.Stars
		}
	}

	var buf bytes.Buffer
	buf.WriteString("<p align=\"center\">\n")
	buf.WriteString(fmt.Sprintf("  <img src=\"https://img.shields.io/badge/Projects-%d-blue?style=flat-square\" alt=\"Projects\"/>\n", totalRepos))
	buf.WriteString(fmt.Sprintf("  <img src=\"https://img.shields.io/badge/PRs_Merged-%d-success?style=flat-square\" alt=\"PRs Merged\"/>\n", totalPRs))
	buf.WriteString(fmt.Sprintf("  <img src=\"https://img.shields.io/badge/Combined_Stars-%s-yellow?style=flat-square\" alt=\"Stars\"/>\n", formatStars(totalStars)))
	buf.WriteString("</p>\n\n")

	for _, category := range categoryOrder {
		repos := append([]contributionRepo(nil), categorized[category]...)
		if len(repos) == 0 {
			continue
		}
		sort.Slice(repos, func(i, j int) bool { return repos[i].Stars > repos[j].Stars })
		buf.WriteString(categoryHeaders[category] + "\n\n")
		buf.WriteString("<p>\n")
		for idx, repo := range repos {
			if idx > 0 {
				buf.WriteString("  ")
			}
			name := repo.FullName[strings.LastIndex(repo.FullName, "/")+1:]
			label := url.PathEscape(strings.NewReplacer("-", "--", "_", "__").Replace(name))
			message := url.PathEscape(fmt.Sprintf("⭐ %s | %d PR", formatStars(repo.Stars), repo.PRCount))
			buf.WriteString(fmt.Sprintf("<a href=\"%s\"><img src=\"https://img.shields.io/badge/%s-%s-informational?style=flat-square\" alt=\"%s\"/></a>", repo.URL, label, message, name))
			if idx < len(repos)-1 {
				buf.WriteString("\n")
			}
		}
		buf.WriteString("\n</p>\n\n")
	}

	return strings.TrimRight(buf.String(), "\n")
}

func replaceBetweenMarkers(content, startMarker, endMarker, replacement string) (string, error) {
	startIdx := strings.Index(content, startMarker)
	endIdx := strings.Index(content, endMarker)
	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return "", fmt.Errorf("markers %q and %q not found", startMarker, endMarker)
	}
	startIdx += len(startMarker)
	return content[:startIdx] + "\n" + replacement + content[endIdx:], nil
}

func formatStars(count int) string {
	if count >= 1000 {
		return fmt.Sprintf("%.1fk", float64(count)/1000)
	}
	return strconv.Itoa(count)
}

func uniqueRepoURLs(prs []githubPullRequest) []string {
	seen := make(map[string]struct{}, len(prs))
	urls := make([]string, 0, len(prs))
	for _, pr := range prs {
		if _, ok := seen[pr.RepositoryURL]; ok {
			continue
		}
		seen[pr.RepositoryURL] = struct{}{}
		urls = append(urls, pr.RepositoryURL)
	}
	sort.Strings(urls)
	return urls
}

func apiURLForRepo(fullName string) string {
	return "https://api.github.com/repos/" + fullName
}

func mustCompilePatterns(patterns ...string) []*regexp.Regexp {
	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, pattern := range patterns {
		compiled = append(compiled, regexp.MustCompile(pattern))
	}
	return compiled
}
