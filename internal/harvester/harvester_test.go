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

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestExtractContributionMetrics(t *testing.T) {
	stars, prs := extractContributionMetrics("polars-⭐ 38.4k | 3 PR-informational?style=flat-square")
	if stars != "38.4k" || prs != "3" {
		t.Fatalf("unexpected metrics: stars=%q prs=%q", stars, prs)
	}
}

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

func TestResolveCaseStudyAssetPath(t *testing.T) {
	got := resolveCaseStudyAssetPath("../blog/images/diagram.png")
	if got != "../../blog/images/diagram.png" {
		t.Fatalf("unexpected cover path: %s", got)
	}
}

func TestRenderCaseStudyPageIncludesPapersNav(t *testing.T) {
	body := string(renderCaseStudyPage(caseStudy{
		Slug:       "demo",
		Title:      "Demo",
		Subtitle:   "Example",
		Status:     "Active",
		CoverImage: "../blog/images/demo.png",
		Stack:      []string{"Go", "CLI"},
		Sections:   []caseStudySection{{Heading: "Why", Body: "Because"}},
	}, caseStudyPageContext{}, time.Unix(0, 0).UTC()))

	if !strings.Contains(body, "../../#papers") {
		t.Fatalf("expected papers navigation link")
	}
	if !strings.Contains(body, "../../blog/images/demo.png") {
		t.Fatalf("expected normalized cover path")
	}
	if !strings.Contains(body, "</div>\n            <figure") {
		t.Fatalf("expected case hero copy to close before the cover figure")
	}
}

func TestRenderCaseStudyPageIncludesLocalNavigationButtons(t *testing.T) {
	body := string(renderCaseStudyPage(caseStudy{
		Slug:     "demo",
		Title:    "Demo",
		Subtitle: "Example",
		Sections: []caseStudySection{{Heading: "Why", Body: "Because"}},
	}, caseStudyPageContext{
		Previous: &adjacentCaseStudy{Title: "Previous", URL: "../previous/"},
		Next:     &adjacentCaseStudy{Title: "Next", URL: "../next/"},
	}, time.Unix(0, 0).UTC()))

	if !strings.Contains(body, "Back to workbench") {
		t.Fatalf("expected a back-to-workbench button")
	}
	if !strings.Contains(body, "../previous/") || !strings.Contains(body, "../next/") {
		t.Fatalf("expected previous and next case-study links")
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
