package harvester

import (
	"strings"
	"testing"
)

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

func TestResolveCoverImagePath(t *testing.T) {
	got := resolveCoverImagePath("../blog/images/diagram.png")
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
	}, caseStudyPageContext{}))

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
	}))

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
