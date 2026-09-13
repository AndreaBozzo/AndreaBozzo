package harvester

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCategorizeContributionRepo(t *testing.T) {
	repo := contributionRepo{
		FullName: "apache/datafusion",
		Desc:     "Rust-native SQL query engine for analytics",
		Topics:   []string{"rust", "query-engine", "sql"},
		Language: "Rust",
	}

	if got := categorizeContributionRepo(repo); got != "Data Ecosystem" {
		t.Fatalf("expected Data Ecosystem, got %s", got)
	}
}

func TestReplaceBetweenMarkers(t *testing.T) {
	content := "before <!-- X:START -->\nold\n<!-- X:END --> after"
	updated, err := replaceBetweenMarkers(content, "<!-- X:START -->", "<!-- X:END -->", "new")
	if err != nil {
		t.Fatalf("replaceBetweenMarkers returned error: %v", err)
	}
	if !strings.Contains(updated, "\nnew<!-- X:END -->") {
		t.Fatalf("replacement not applied: %q", updated)
	}
}

func TestRenderContributionMarkdownUsesCompactDisclosure(t *testing.T) {
	categorized := map[string][]contributionRepo{
		"Data Ecosystem": {
			{
				FullName: "apache/datafusion",
				URL:      "https://github.com/apache/datafusion",
				Stars:    1250,
				PRCount:  3,
			},
		},
	}

	markdown := renderContributionMarkdown(categorized)
	if !strings.Contains(markdown, "<summary><strong>3 merged PRs across 1 upstream project</strong> · 1.2k combined stars</summary>") {
		t.Fatalf("expected compact contribution summary, got %q", markdown)
	}
	if !strings.HasPrefix(markdown, "<details>\n") || !strings.HasSuffix(markdown, "</details>") {
		t.Fatalf("expected contribution index to be wrapped in details, got %q", markdown)
	}
}

func TestGithubClientGetJSONDoesNotRetryGenericForbidden(t *testing.T) {
	originalSleep := sleepFor
	defer func() { sleepFor = originalSleep }()

	slept := false
	sleepFor = func(time.Duration) {
		slept = true
	}

	client := githubClient{
		httpClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusForbidden,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`{"message":"forbidden"}`)),
			}, nil
		})},
	}

	err := client.getJSON(context.Background(), "https://api.github.com/test", &struct{}{})
	if err == nil {
		t.Fatal("expected forbidden response to return an error")
	}
	if slept {
		t.Fatal("expected generic forbidden response not to trigger rate-limit sleep")
	}
	if !strings.Contains(err.Error(), "returned 403") {
		t.Fatalf("expected 403 error, got %v", err)
	}
}

func TestIsGitHubRateLimited(t *testing.T) {
	header := make(http.Header)
	header.Set("X-RateLimit-Remaining", "0")
	resp := &http.Response{Header: header}
	if !isGitHubRateLimited(resp) {
		t.Fatal("expected response to be treated as rate limited")
	}

	header = make(http.Header)
	header.Set("X-RateLimit-Remaining", "7")
	resp = &http.Response{Header: header}
	if isGitHubRateLimited(resp) {
		t.Fatal("expected response with remaining budget not to be rate limited")
	}

	resp = &http.Response{Header: http.Header{}}
	if isGitHubRateLimited(resp) {
		t.Fatal("expected response without rate-limit header not to be rate limited")
	}
}
