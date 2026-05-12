package harvester

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

const defaultGitHubAPIBaseURL = "https://api.github.com"

type CIRuntimeSource struct {
	RepoRoot   string
	HTTPClient *http.Client
	APIBaseURL string
	Token      string
}

type workflowRunsResponse struct {
	WorkflowRuns []githubWorkflowRun `json:"workflow_runs"`
}

type githubWorkflowRun struct {
	Name         string `json:"name"`
	Path         string `json:"path"`
	HTMLURL      string `json:"html_url"`
	Status       string `json:"status"`
	Conclusion   string `json:"conclusion"`
	RunStartedAt string `json:"run_started_at"`
	UpdatedAt    string `json:"updated_at"`
}

type ciTarget struct {
	Slug         string
	RepoFullName string
	RepoURL      string
}

type workflowAccumulator struct {
	name             string
	path             string
	url              string
	latestStatus     string
	latestConclusion string
	latestRunAt      time.Time
	completedRuns    int
	successfulRuns   int
	durations        []int
}

func (source CIRuntimeSource) Name() string {
	return "ci"
}

func (source CIRuntimeSource) OutputPath(repoRoot string) string {
	return ciRuntimeOutputPath(repoRoot)
}

func (source CIRuntimeSource) Fetch(ctx context.Context) (any, error) {
	targets, err := source.loadTargets()
	if err != nil {
		return nil, err
	}
	items := make([]schema.CIRuntimeItemV1, 0)
	var firstErr error
	for _, target := range targets {
		workflowItems, err := source.fetchRepoWorkflowMetrics(ctx, target)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		items = append(items, workflowItems...)
	}
	if firstErr != nil && len(items) == 0 && len(targets) > 0 {
		return nil, firstErr
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CaseStudySlug == items[j].CaseStudySlug {
			return items[i].WorkflowName < items[j].WorkflowName
		}
		return items[i].CaseStudySlug < items[j].CaseStudySlug
	})
	return schema.CIRuntimeIndexV1{
		SchemaVersion: schema.VersionV1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        "case-study repoUrl GitHub Actions runs",
		Items:         items,
	}, nil
}

func GenerateCIRuntimeIndex(ctx context.Context, repoRoot string) error {
	return RunSource(ctx, repoRoot, CIRuntimeSource{RepoRoot: repoRoot})
}

func (source CIRuntimeSource) loadTargets() ([]ciTarget, error) {
	payload, err := loadCaseStudiesPayload(filepath.Join(source.RepoRoot, "assets", "data", "case-studies.json"))
	if err != nil {
		return nil, err
	}
	targets := make([]ciTarget, 0, len(payload.Items))
	seen := make(map[string]struct{}, len(payload.Items))
	for _, study := range payload.Items {
		fullName := githubRepoFullName(study.RepoURL)
		if fullName == "" {
			continue
		}
		key := study.Slug + "|" + fullName
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		targets = append(targets, ciTarget{Slug: study.Slug, RepoFullName: fullName, RepoURL: study.RepoURL})
	}
	sort.Slice(targets, func(i, j int) bool {
		if targets[i].Slug == targets[j].Slug {
			return targets[i].RepoFullName < targets[j].RepoFullName
		}
		return targets[i].Slug < targets[j].Slug
	})
	return targets, nil
}

func (source CIRuntimeSource) fetchRepoWorkflowMetrics(ctx context.Context, target ciTarget) ([]schema.CIRuntimeItemV1, error) {
	baseURL := strings.TrimRight(firstNonEmpty(source.APIBaseURL, defaultGitHubAPIBaseURL), "/")
	endpoint := fmt.Sprintf("%s/repos/%s/actions/runs?per_page=20", baseURL, target.RepoFullName)
	client := githubClient{
		httpClient: source.HTTPClient,
		token:      strings.TrimSpace(firstNonEmpty(source.Token, os.Getenv("GITHUB_TOKEN"))),
	}
	if client.httpClient == nil {
		client.httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	var response workflowRunsResponse
	if err := client.getJSON(ctx, endpoint, &response); err != nil {
		return nil, fmt.Errorf("fetch workflow runs for %s: %w", target.RepoFullName, err)
	}
	aggregates := make(map[string]*workflowAccumulator)
	for _, run := range response.WorkflowRuns {
		key := firstNonEmpty(strings.TrimSpace(run.Name), strings.TrimSpace(run.Path), "workflow")
		acc := aggregates[key]
		if acc == nil {
			acc = &workflowAccumulator{name: key}
			aggregates[key] = acc
		}
		if acc.path == "" {
			acc.path = run.Path
		}
		if acc.url == "" {
			acc.url = run.HTMLURL
		}
		runUpdatedAt := parseTimeOrZero(run.UpdatedAt)
		if runUpdatedAt.After(acc.latestRunAt) {
			acc.latestRunAt = runUpdatedAt
			acc.latestStatus = run.Status
			acc.latestConclusion = run.Conclusion
		}
		if !strings.EqualFold(run.Status, "completed") {
			continue
		}
		acc.completedRuns++
		if strings.EqualFold(run.Conclusion, "success") {
			acc.successfulRuns++
		}
		startedAt := parseTimeOrZero(run.RunStartedAt)
		if startedAt.IsZero() || runUpdatedAt.IsZero() || !runUpdatedAt.After(startedAt) {
			continue
		}
		acc.durations = append(acc.durations, int(runUpdatedAt.Sub(startedAt).Seconds()))
	}
	items := make([]schema.CIRuntimeItemV1, 0, len(aggregates))
	for _, key := range sortedWorkflowKeys(aggregates) {
		acc := aggregates[key]
		if len(acc.durations) == 0 {
			continue
		}
		sort.Ints(acc.durations)
		successRate := 0.0
		if acc.completedRuns > 0 {
			successRate = float64(acc.successfulRuns) / float64(acc.completedRuns)
		}
		items = append(items, schema.CIRuntimeItemV1{
			CaseStudySlug:         target.Slug,
			RepoFullName:          target.RepoFullName,
			RepoURL:               target.RepoURL,
			WorkflowName:          acc.name,
			WorkflowPath:          acc.path,
			WorkflowURL:           acc.url,
			RunsSampled:           len(acc.durations),
			MedianDurationSeconds: percentileInt(acc.durations, 0.5),
			P95DurationSeconds:    percentileInt(acc.durations, 0.95),
			SuccessRate:           successRate,
			LatestStatus:          acc.latestStatus,
			LatestConclusion:      acc.latestConclusion,
			LatestRunAt:           formatTimeOrEmpty(acc.latestRunAt),
		})
	}
	return items, nil
}

func githubRepoFullName(repoURL string) string {
	trimmed := strings.TrimSpace(repoURL)
	trimmed = strings.TrimPrefix(trimmed, "https://github.com/")
	trimmed = strings.TrimPrefix(trimmed, "http://github.com/")
	trimmed = strings.Trim(trimmed, "/")
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 {
		return ""
	}
	return parts[0] + "/" + parts[1]
}

func sortedWorkflowKeys(values map[string]*workflowAccumulator) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func percentileInt(values []int, percentile float64) int {
	if len(values) == 0 {
		return 0
	}
	if len(values) == 1 {
		return values[0]
	}
	index := int(math.Ceil(float64(len(values))*percentile)) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(values) {
		index = len(values) - 1
	}
	return values[index]
}

func formatTimeOrEmpty(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
