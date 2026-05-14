package harvester

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
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

func TestBlogSourceFetchBuildsWritingIndex(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "case-studies.json"), `{
  "items": [
    {"slug": "dataprof", "relatedPosts": ["arrowfordataprof-blog"]}
  ]
}`)
	writeTestFile(t, filepath.Join(repoRoot, "blog", "content", "posts", "arrowfordataprof-blog.en.md"), `---
title: "Designing Around Arrow"
date: 2026-02-05
draft: false
tags: ["Rust", "Apache Arrow"]
categories: ["Data Engineering"]
description: "A post about Arrow."
summary: "A short Arrow design story."
---

## Hello

This post has enough Markdown to count a few words and [one link](https://example.com).
`)

	payload, err := BlogSource{RepoRoot: repoRoot}.Fetch(context.Background())
	if err != nil {
		t.Fatalf("Fetch returned error: %v", err)
	}

	index, ok := payload.(schema.WritingIndexV1)
	if !ok {
		t.Fatalf("unexpected payload type %T", payload)
	}
	if index.SchemaVersion != schema.VersionV1 {
		t.Fatalf("unexpected schema version %q", index.SchemaVersion)
	}
	if len(index.Items) != 1 {
		t.Fatalf("expected one writing item, got %d", len(index.Items))
	}

	item := index.Items[0]
	if item.ID != "arrowfordataprof-blog:en" {
		t.Fatalf("unexpected id %q", item.ID)
	}
	if item.URL != "./blog/en/posts/arrowfordataprof-blog/" {
		t.Fatalf("unexpected url %q", item.URL)
	}
	if item.PublishedAt != "2026-02-05T00:00:00Z" {
		t.Fatalf("unexpected publishedAt %q", item.PublishedAt)
	}
	if strings.Join(item.Tags, ",") != "Rust,Apache Arrow" {
		t.Fatalf("unexpected tags %#v", item.Tags)
	}
	if strings.Join(item.RelatedCaseStudies, ",") != "dataprof" {
		t.Fatalf("unexpected related case studies %#v", item.RelatedCaseStudies)
	}
	if item.WordCount == 0 || item.ReadingMinutes != 1 {
		t.Fatalf("unexpected reading metrics: words=%d minutes=%d", item.WordCount, item.ReadingMinutes)
	}
}

func TestBlogSourceSkipsDraftPosts(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "case-studies.json"), `{"items":[]}`)
	writeTestFile(t, filepath.Join(repoRoot, "blog", "content", "posts", "draft-post.it.md"), `---
title: "Draft"
date: 2026-02-05
draft: true
---

Draft body.
`)

	payload, err := BlogSource{RepoRoot: repoRoot}.Fetch(context.Background())
	if err != nil {
		t.Fatalf("Fetch returned error: %v", err)
	}
	index := payload.(schema.WritingIndexV1)
	if len(index.Items) != 0 {
		t.Fatalf("expected draft to be skipped, got %d items", len(index.Items))
	}
}

func TestPackageRegistrySourceFetchesPyPIAndCrates(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "package-sources.json"), `{
  "$schemaVersion": "v1",
  "packages": [
    {"ecosystem": "pypi", "name": "dataprof", "relatedCaseStudies": ["dataprof"]},
    {"ecosystem": "crates.io", "name": "ares-core", "repositoryUrl": "https://github.com/AndreaBozzo/Ares", "relatedCaseStudies": ["ares-ceres"]}
  ]
}`)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Header.Get("User-Agent") == "" {
			t.Fatal("expected registry user agent")
		}
		w.Header().Set("Content-Type", "application/json")
		switch req.URL.Path {
		case "/pypi/dataprof/json":
			_, _ = io.WriteString(w, `{
  "info": {
    "name": "dataprof",
    "version": "0.7.1",
    "summary": "Fast data profiling",
    "project_url": "https://pypi.org/project/dataprof/",
    "requires_python": ">=3.8",
    "project_urls": {"Source": "https://github.com/AndreaBozzo/dataprof"}
  },
  "urls": [
    {"upload_time_iso_8601": "2026-04-10T09:56:35.268261Z"}
  ]
}`)
		case "/api/v1/crates/ares-core":
			_, _ = io.WriteString(w, `{
  "crate": {
    "name": "ares-core",
    "newest_version": "0.3.0",
    "description": "Core types for Ares",
    "downloads": 229,
    "recent_downloads": 12,
    "updated_at": "2026-03-01T09:00:00Z"
  },
  "versions": [
    {"num": "0.3.0", "created_at": "2026-03-01T08:00:00Z", "updated_at": "2026-03-01T09:00:00Z", "license": "MIT"}
  ]
}`)
		default:
			http.NotFound(w, req)
		}
	}))
	defer server.Close()

	payload, err := PackageRegistrySource{
		RepoRoot:      repoRoot,
		HTTPClient:    server.Client(),
		PyPIBaseURL:   server.URL,
		CratesBaseURL: server.URL,
	}.Fetch(context.Background())
	if err != nil {
		t.Fatalf("Fetch returned error: %v", err)
	}

	index, ok := payload.(schema.PackageRegistryIndexV1)
	if !ok {
		t.Fatalf("unexpected payload type %T", payload)
	}
	if len(index.Items) != 2 {
		t.Fatalf("expected two package items, got %d", len(index.Items))
	}

	cratesItem := index.Items[0]
	if cratesItem.ID != "crates.io:ares-core" {
		t.Fatalf("unexpected first item id %q", cratesItem.ID)
	}
	if cratesItem.RepositoryURL != "https://github.com/AndreaBozzo/Ares" {
		t.Fatalf("expected configured repository override, got %q", cratesItem.RepositoryURL)
	}
	if cratesItem.DownloadsTotal == nil || *cratesItem.DownloadsTotal != 229 {
		t.Fatalf("unexpected crates downloads %#v", cratesItem.DownloadsTotal)
	}
	if cratesItem.PublishedAt != "2026-03-01T08:00:00Z" {
		t.Fatalf("unexpected crates publishedAt %q", cratesItem.PublishedAt)
	}

	pypiItem := index.Items[1]
	if pypiItem.ID != "pypi:dataprof" {
		t.Fatalf("unexpected second item id %q", pypiItem.ID)
	}
	if pypiItem.RepositoryURL != "https://github.com/AndreaBozzo/dataprof" {
		t.Fatalf("unexpected pypi repository %q", pypiItem.RepositoryURL)
	}
	if pypiItem.PublishedAt != "2026-04-10T09:56:35Z" {
		t.Fatalf("unexpected pypi publishedAt %q", pypiItem.PublishedAt)
	}
}

func TestPackageRegistrySourceFiltersEcosystem(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "package-sources.json"), `{
  "$schemaVersion": "v1",
  "packages": [
    {"ecosystem": "pypi", "name": "dataprof"},
    {"ecosystem": "crates.io", "name": "dataprof"}
  ]
}`)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if req.URL.Path != "/pypi/dataprof/json" {
			t.Fatalf("unexpected request path %s", req.URL.Path)
		}
		_, _ = io.WriteString(w, `{"info":{"name":"dataprof","version":"0.7.1","summary":"Fast data profiling","project_url":"https://pypi.org/project/dataprof/"},"urls":[]}`)
	}))
	defer server.Close()

	payload, err := PackageRegistrySource{
		RepoRoot:    repoRoot,
		Ecosystems:  map[string]bool{"pypi": true},
		HTTPClient:  server.Client(),
		PyPIBaseURL: server.URL,
	}.Fetch(context.Background())
	if err != nil {
		t.Fatalf("Fetch returned error: %v", err)
	}
	index := payload.(schema.PackageRegistryIndexV1)
	if len(index.Items) != 1 || index.Items[0].Ecosystem != "pypi" {
		t.Fatalf("unexpected filtered items %#v", index.Items)
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
	if strings.Contains(body, `data-language-toggle`) || strings.Contains(body, `site-lang-btn`) {
		t.Fatalf("case-study header should not expose a site language switch before the page is localized")
	}
	if strings.Contains(body, `og:locale:alternate`) {
		t.Fatalf("case-study pages should not advertise a locale alternate without a translated page")
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

func TestRenderCaseStudyPageIncludesProofMetricsAndOperationalSignals(t *testing.T) {
	body := string(renderCaseStudyPage(caseStudy{
		Slug:     "demo",
		Title:    "Demo",
		Subtitle: "Example",
		Sections: []caseStudySection{{Heading: "Why", Body: "Because"}},
		ProofMetrics: []caseStudyDatum{{
			Label:  "Packages",
			Value:  "PyPI + crate",
			Detail: "Public release surfaces attached to the project.",
		}},
		OperationalSignals: []caseStudyDatum{{
			Label:  "CI health",
			Value:  "Green builds",
			Detail: "Workflow state should stay near the case study, not in the graph.",
			URL:    "https://example.com/actions",
		}},
	}, caseStudyPageContext{}, time.Unix(0, 0).UTC()))

	if !strings.Contains(body, "Proof metrics") || !strings.Contains(body, "Operational signals") {
		t.Fatalf("expected data group headings to render")
	}
	if !strings.Contains(body, "PyPI + crate") || !strings.Contains(body, "Green builds") {
		t.Fatalf("expected data group values to render")
	}
	if !strings.Contains(body, "https://example.com/actions") {
		t.Fatalf("expected operational signal link to render")
	}
}

func TestGenerateCaseStudyPagesEnrichesFromPackageAndCIRuntimeArtifacts(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "case-studies.json"), `{
	"items": [
		{
			"slug": "dataprof",
			"title": "dataprof",
			"subtitle": "Example",
			"repoUrl": "https://github.com/AndreaBozzo/dataprof",
			"sections": [{"heading": "Why", "body": "Because"}]
		}
	]
}`)
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "packages.json"), `{
	"$schemaVersion": "v1",
	"generatedAt": "2026-05-12T10:00:00Z",
	"source": "assets/data/package-sources.json",
	"items": [
		{
			"id": "pypi:dataprof",
			"ecosystem": "pypi",
			"name": "dataprof",
			"displayName": "dataprof",
			"summary": "Fast data profiling",
			"version": "0.7.1",
			"url": "https://pypi.org/project/dataprof/",
			"repositoryUrl": "https://github.com/AndreaBozzo/dataprof",
			"relatedCaseStudies": ["dataprof"]
		}
	]
}`)
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "ci-runtimes.json"), `{
	"$schemaVersion": "v1",
	"generatedAt": "2026-05-12T10:00:00Z",
	"source": "github-actions",
	"items": [
		{
			"caseStudySlug": "dataprof",
			"repoFullName": "AndreaBozzo/dataprof",
			"repoUrl": "https://github.com/AndreaBozzo/dataprof",
			"workflowName": "test",
			"workflowUrl": "https://github.com/AndreaBozzo/dataprof/actions/workflows/test.yml",
			"runsSampled": 12,
			"medianDurationSeconds": 245,
			"p95DurationSeconds": 481,
			"successRate": 0.92,
			"latestConclusion": "success",
			"latestStatus": "completed",
			"latestRunAt": "2026-05-12T09:40:00Z"
		}
	]
}`)

	if err := GenerateCaseStudyPages(repoRoot); err != nil {
		t.Fatalf("GenerateCaseStudyPages returned error: %v", err)
	}

	body, err := os.ReadFile(filepath.Join(repoRoot, "work", "dataprof", "index.html"))
	if err != nil {
		t.Fatalf("read generated case study page: %v", err)
	}
	rendered := string(body)
	if !strings.Contains(rendered, "Published packages") || !strings.Contains(rendered, "1 package on PyPI") {
		t.Fatalf("expected generated package proof metric, got %q", rendered)
	}
	if !strings.Contains(rendered, "test") || !strings.Contains(rendered, "92% success") {
		t.Fatalf("expected generated CI operational signal")
	}
}

func TestBuildCIOperationalSignalsPrefersConfiguredWorkflowFocus(t *testing.T) {
	study := caseStudy{
		Slug:            "dataprof",
		RepoURL:         "https://github.com/AndreaBozzo/dataprof",
		CIWorkflowFocus: []string{"CI", "Benchmarks", "Deploy Benchmark Reports"},
	}
	signals := buildCIOperationalSignals(study, []schema.CIRuntimeItemV1{
		{
			CaseStudySlug:         "dataprof",
			RepoURL:               study.RepoURL,
			WorkflowName:          "Pull Request Labeler",
			WorkflowPath:          ".github/workflows/labeler.yml",
			WorkflowURL:           "https://example.com/labeler",
			RunsSampled:           8,
			MedianDurationSeconds: 12,
			P95DurationSeconds:    20,
			SuccessRate:           1,
			LatestConclusion:      "success",
			LatestRunAt:           "2026-05-12T12:00:00Z",
		},
		{
			CaseStudySlug:         "dataprof",
			RepoURL:               study.RepoURL,
			WorkflowName:          "Deploy Benchmark Reports",
			WorkflowPath:          ".github/workflows/benchmarks-deploy.yml",
			WorkflowURL:           "https://example.com/deploy-benchmarks",
			RunsSampled:           4,
			MedianDurationSeconds: 95,
			P95DurationSeconds:    150,
			SuccessRate:           1,
			LatestConclusion:      "success",
			LatestRunAt:           "2026-05-11T12:00:00Z",
		},
		{
			CaseStudySlug:         "dataprof",
			RepoURL:               study.RepoURL,
			WorkflowName:          "Benchmarks",
			WorkflowPath:          ".github/workflows/benchmarks.yml",
			WorkflowURL:           "https://example.com/benchmarks",
			RunsSampled:           6,
			MedianDurationSeconds: 240,
			P95DurationSeconds:    420,
			SuccessRate:           1,
			LatestConclusion:      "success",
			LatestRunAt:           "2026-05-10T12:00:00Z",
		},
		{
			CaseStudySlug:         "dataprof",
			RepoURL:               study.RepoURL,
			WorkflowName:          "CI",
			WorkflowPath:          ".github/workflows/ci.yml",
			WorkflowURL:           "https://example.com/ci",
			RunsSampled:           12,
			MedianDurationSeconds: 180,
			P95DurationSeconds:    320,
			SuccessRate:           0.92,
			LatestConclusion:      "success",
			LatestRunAt:           "2026-05-09T12:00:00Z",
		},
	})

	if len(signals) != 3 {
		t.Fatalf("expected 3 focused CI signals, got %d", len(signals))
	}
	if signals[0].Label != "CI" || signals[1].Label != "Benchmarks" || signals[2].Label != "Deploy Benchmark Reports" {
		t.Fatalf("unexpected focused workflow order: %#v", signals)
	}
	for _, signal := range signals {
		if signal.Label == "Pull Request Labeler" {
			t.Fatalf("expected noisy automation workflow to be excluded from focused signals")
		}
	}
}

func TestCIRuntimeSourceFetchesWorkflowMetrics(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "case-studies.json"), `{
  "items": [
    {
      "slug": "dataprof",
      "title": "dataprof",
      "subtitle": "Example",
      "repoUrl": "https://github.com/AndreaBozzo/dataprof",
      "sections": [{"heading": "Why", "body": "Because"}]
    }
  ]
}`)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/AndreaBozzo/dataprof/actions/runs" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
  "workflow_runs": [
    {
      "name": "test",
      "path": ".github/workflows/test.yml",
      "html_url": "https://github.com/AndreaBozzo/dataprof/actions/runs/1",
      "status": "completed",
      "conclusion": "success",
      "run_started_at": "2026-05-12T09:00:00Z",
      "updated_at": "2026-05-12T09:04:05Z"
    },
    {
      "name": "test",
      "path": ".github/workflows/test.yml",
      "html_url": "https://github.com/AndreaBozzo/dataprof/actions/runs/2",
      "status": "completed",
      "conclusion": "failure",
      "run_started_at": "2026-05-11T09:00:00Z",
      "updated_at": "2026-05-11T09:08:01Z"
    }
  ]
}`))
	}))
	defer server.Close()

	source := CIRuntimeSource{RepoRoot: repoRoot, HTTPClient: server.Client(), APIBaseURL: server.URL}
	payload, err := source.Fetch(context.Background())
	if err != nil {
		t.Fatalf("Fetch returned error: %v", err)
	}
	index, ok := payload.(schema.CIRuntimeIndexV1)
	if !ok {
		t.Fatalf("expected CIRuntimeIndexV1 payload, got %T", payload)
	}
	if len(index.Items) != 1 {
		t.Fatalf("expected one workflow metric, got %d", len(index.Items))
	}
	item := index.Items[0]
	if item.WorkflowName != "test" || item.RunsSampled != 2 {
		t.Fatalf("unexpected workflow summary: %+v", item)
	}
	if item.MedianDurationSeconds != 245 || item.P95DurationSeconds != 481 {
		t.Fatalf("unexpected durations: %+v", item)
	}
	if item.SuccessRate != 0.5 {
		t.Fatalf("unexpected success rate: %+v", item)
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

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create parent dir for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func TestRenderCaseStudyEnglishEmitsNoItalianAlternateWithoutTranslation(t *testing.T) {
	body := string(renderCaseStudyPageForLocale(caseStudy{
		Slug:     "demo",
		Title:    "Demo",
		Subtitle: "Example",
		Sections: []caseStudySection{{Heading: "Why", Body: "Because"}},
	}, caseStudyPageContext{}, time.Unix(0, 0).UTC(), caseStudyRenderOptions{Locale: "en"}))

	if !strings.Contains(body, `<html lang="en"`) {
		t.Fatalf("expected English html lang attribute")
	}
	if strings.Contains(body, `hreflang="it"`) {
		t.Fatalf("English page must not advertise an Italian alternate when no translation exists")
	}
	if !strings.Contains(body, `hreflang="x-default"`) {
		t.Fatalf("expected x-default hreflang fallback")
	}
	if !strings.Contains(body, `data-blog-link`) {
		t.Fatalf("expected Blog nav anchor to be flagged with data-blog-link so the writing-language toggle can retarget it")
	}
	if !strings.Contains(body, `"inLanguage":"en"`) {
		t.Fatalf("expected structured data inLanguage to be en")
	}
}

func TestRenderCaseStudyItalianEmitsReciprocalHreflang(t *testing.T) {
	study := caseStudy{
		Slug:     "demo",
		Title:    "Demo",
		Subtitle: "Example",
		Sections: []caseStudySection{{Heading: "Why", Body: "Because"}},
		Translations: map[string]caseStudyTranslation{
			"it": {
				Title:           "Demo IT",
				MetaDescription: "Descrizione italiana",
				Sections:        []caseStudySection{{Heading: "Perché", Body: "Perché sì"}},
			},
		},
	}
	body := string(renderCaseStudyPageForLocale(study, caseStudyPageContext{}, time.Unix(0, 0).UTC(), caseStudyRenderOptions{
		Locale:           "it",
		AlternateLocales: []string{"en", "it"},
	}))

	if !strings.Contains(body, `<html lang="it"`) {
		t.Fatalf("expected Italian html lang attribute, body had: %s", body[:200])
	}
	if !strings.Contains(body, `https://andreabozzo.github.io/AndreaBozzo/it/work/demo/`) {
		t.Fatalf("expected Italian canonical URL")
	}
	if !strings.Contains(body, `hreflang="en"`) || !strings.Contains(body, `hreflang="it"`) {
		t.Fatalf("expected reciprocal hreflang for both locales")
	}
	if !strings.Contains(body, `<link rel="alternate" hreflang="x-default" href="https://andreabozzo.github.io/AndreaBozzo/work/demo/"`) {
		t.Fatalf("expected x-default to point at the English URL")
	}
	if !strings.Contains(body, `og:locale:alternate" content="en_US"`) {
		t.Fatalf("expected og:locale:alternate for the English counterpart")
	}
	if !strings.Contains(body, "Demo IT") {
		t.Fatalf("expected Italian title in page body")
	}
	if !strings.Contains(body, "Perché sì") {
		t.Fatalf("expected Italian section body")
	}
	if !strings.Contains(body, `../../../assets/styles.min.css`) {
		t.Fatalf("expected Italian page to use three-level rootRel for assets")
	}
	if !strings.Contains(body, `"inLanguage":"it"`) {
		t.Fatalf("expected structured data inLanguage to be it")
	}
}

func TestGenerateCaseStudyPagesEmitsItalianOnlyWhenIndexable(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, filepath.Join(repoRoot, "assets", "data", "case-studies.json"), `{
  "items": [
    {
      "slug": "dataprof",
      "title": "dataprof",
      "subtitle": "Example",
      "sections": [{"heading": "Why", "body": "Because"}],
      "translations": {
        "it": {
          "title": "dataprof IT",
          "metaDescription": "Profilazione Arrow-nativa in Italia",
          "sections": [{"heading": "Perché", "body": "Perché sì"}]
        }
      }
    },
    {
      "slug": "mosaico",
      "title": "mosaico",
      "subtitle": "No translation",
      "sections": [{"heading": "Why", "body": "Because"}]
    },
    {
      "slug": "partial",
      "title": "partial",
      "subtitle": "Partial translation",
      "sections": [{"heading": "Why", "body": "Because"}],
      "translations": {
        "it": {
          "title": "parziale"
        }
      }
    }
  ]
}`)

	if err := GenerateCaseStudyPages(repoRoot); err != nil {
		t.Fatalf("GenerateCaseStudyPages returned error: %v", err)
	}

	mustExist := func(p string) {
		t.Helper()
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected %s to exist: %v", p, err)
		}
	}
	mustNotExist := func(p string) {
		t.Helper()
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Fatalf("expected %s to NOT exist (err=%v)", p, err)
		}
	}

	mustExist(filepath.Join(repoRoot, "work", "dataprof", "index.html"))
	mustExist(filepath.Join(repoRoot, "work", "mosaico", "index.html"))
	mustExist(filepath.Join(repoRoot, "work", "partial", "index.html"))
	mustExist(filepath.Join(repoRoot, "it", "work", "dataprof", "index.html"))
	mustNotExist(filepath.Join(repoRoot, "it", "work", "mosaico"))
	mustNotExist(filepath.Join(repoRoot, "it", "work", "partial"))

	enBody, err := os.ReadFile(filepath.Join(repoRoot, "work", "dataprof", "index.html"))
	if err != nil {
		t.Fatalf("read English dataprof page: %v", err)
	}
	if !strings.Contains(string(enBody), `hreflang="it"`) {
		t.Fatalf("English dataprof page should advertise Italian alternate")
	}
	mosaicoEN, err := os.ReadFile(filepath.Join(repoRoot, "work", "mosaico", "index.html"))
	if err != nil {
		t.Fatalf("read English mosaico page: %v", err)
	}
	if strings.Contains(string(mosaicoEN), `hreflang="it"`) {
		t.Fatalf("English mosaico page should NOT advertise Italian alternate without a translation")
	}
}

func TestApplyLocaleOverridesFallsBackOnEmptyFields(t *testing.T) {
	study := caseStudy{
		Slug:    "demo",
		Title:   "Demo EN",
		Summary: "English summary",
		Stack:   []string{"Rust"},
		Translations: map[string]caseStudyTranslation{
			"it": {
				Title: "Demo IT",
			},
		},
	}
	view := applyLocaleOverrides(study, "it")
	if view.Title != "Demo IT" {
		t.Fatalf("expected Italian title override, got %q", view.Title)
	}
	if view.Summary != "English summary" {
		t.Fatalf("expected English summary to fall through, got %q", view.Summary)
	}
	if len(view.Stack) != 1 || view.Stack[0] != "Rust" {
		t.Fatalf("expected English stack to fall through, got %v", view.Stack)
	}
}

func TestValidateLocalizationAcceptsReciprocalAlternates(t *testing.T) {
	siteRoot := t.TempDir()
	enURL := "https://example.com/work/demo/"
	itURL := "https://example.com/it/work/demo/"
	enPage := localizationFixture(enURL, enURL, map[string]string{"en": enURL, "it": itURL, "x-default": enURL})
	itPage := localizationFixture(itURL, itURL, map[string]string{"en": enURL, "it": itURL, "x-default": enURL})
	writeTestFile(t, filepath.Join(siteRoot, "work", "demo", "index.html"), enPage)
	writeTestFile(t, filepath.Join(siteRoot, "it", "work", "demo", "index.html"), itPage)

	if err := ValidateLocalization(siteRoot); err != nil {
		t.Fatalf("expected no validation errors, got: %v", err)
	}
}

func TestValidateLocalizationRejectsMissingCounterpart(t *testing.T) {
	siteRoot := t.TempDir()
	enURL := "https://example.com/work/demo/"
	itURL := "https://example.com/it/work/demo/"
	// English page claims an Italian counterpart that was never generated.
	enPage := localizationFixture(enURL, enURL, map[string]string{"en": enURL, "it": itURL, "x-default": enURL})
	writeTestFile(t, filepath.Join(siteRoot, "work", "demo", "index.html"), enPage)

	err := ValidateLocalization(siteRoot)
	if err == nil {
		t.Fatal("expected validation to fail when alternate is missing")
	}
	if !strings.Contains(err.Error(), itURL) {
		t.Fatalf("expected error to mention missing target %s, got %v", itURL, err)
	}
}

func TestValidateLocalizationRejectsNonReciprocal(t *testing.T) {
	siteRoot := t.TempDir()
	enURL := "https://example.com/work/demo/"
	itURL := "https://example.com/it/work/demo/"
	enPage := localizationFixture(enURL, enURL, map[string]string{"en": enURL, "it": itURL, "x-default": enURL})
	// Italian page does NOT link back to English.
	itPage := localizationFixture(itURL, itURL, map[string]string{"it": itURL, "x-default": enURL})
	writeTestFile(t, filepath.Join(siteRoot, "work", "demo", "index.html"), enPage)
	writeTestFile(t, filepath.Join(siteRoot, "it", "work", "demo", "index.html"), itPage)

	err := ValidateLocalization(siteRoot)
	if err == nil {
		t.Fatal("expected validation to fail on non-reciprocal alternate")
	}
	if !strings.Contains(err.Error(), "not reciprocal") {
		t.Fatalf("expected 'not reciprocal' in error, got %v", err)
	}
}

func TestValidateLocalizationIgnoresEnglishOnlyPages(t *testing.T) {
	siteRoot := t.TempDir()
	enURL := "https://example.com/work/solo/"
	// Self-en + x-default-en only; no Italian alternate. This is the standard
	// English-only case-study shape and must pass validation.
	enPage := localizationFixture(enURL, enURL, map[string]string{"en": enURL, "x-default": enURL})
	writeTestFile(t, filepath.Join(siteRoot, "work", "solo", "index.html"), enPage)

	if err := ValidateLocalization(siteRoot); err != nil {
		t.Fatalf("expected English-only page to validate, got %v", err)
	}
}

func localizationFixture(canonical, _ string, alternates map[string]string) string {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head>")
	b.WriteString(`<link rel="canonical" href="` + canonical + `">`)
	for lang, href := range alternates {
		b.WriteString(`<link rel="alternate" hreflang="` + lang + `" href="` + href + `">`)
	}
	b.WriteString("</head><body></body></html>")
	return b.String()
}

func TestResolveCaseStudyAssetPathForRespectsItalianDepth(t *testing.T) {
	got := resolveCaseStudyAssetPathFor("../../assets/images/foo.png", "../../../")
	want := "../../../assets/images/foo.png"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	got = resolveCaseStudyAssetPathFor("../blog/images/foo.png", "../../../")
	want = "../../../blog/images/foo.png"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
