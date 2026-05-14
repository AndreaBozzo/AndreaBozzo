package harvester

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

func enrichCaseStudiesFromArtifacts(repoRoot string, items []caseStudy) ([]caseStudy, error) {
	packageIndex, err := loadPackageRegistryIndex(repoRoot)
	if err != nil {
		return nil, err
	}
	ciIndex, err := loadCIRuntimeIndex(repoRoot)
	if err != nil {
		return nil, err
	}
	datasetIndex, err := loadDatasetIndex(repoRoot)
	if err != nil {
		return nil, err
	}

	enriched := make([]caseStudy, len(items))
	copy(enriched, items)
	for idx := range enriched {
		enriched[idx].ProofMetrics = mergeGeneratedCaseStudyData(
			enriched[idx].ProofMetrics,
			buildPackageProofMetrics(enriched[idx], packageIndex.Items),
		)
		enriched[idx].OperationalSignals = mergeGeneratedCaseStudyData(
			enriched[idx].OperationalSignals,
			buildCIOperationalSignals(enriched[idx], ciIndex.Items),
		)
		enriched[idx].Datasets = datasetsForCaseStudy(enriched[idx], datasetIndex.Items)
	}

	return enriched, nil
}

func loadDatasetIndex(repoRoot string) (schema.DatasetIndexV1, error) {
	raw, err := os.ReadFile(datasetOutputPath(repoRoot))
	if err != nil {
		if os.IsNotExist(err) {
			return schema.DatasetIndexV1{}, nil
		}
		return schema.DatasetIndexV1{}, fmt.Errorf("read dataset index: %w", err)
	}

	var index schema.DatasetIndexV1
	if err := json.Unmarshal(raw, &index); err != nil {
		return schema.DatasetIndexV1{}, fmt.Errorf("decode dataset index: %w", err)
	}
	return index, nil
}

func datasetsForCaseStudy(study caseStudy, items []schema.DatasetItemV1) []schema.DatasetItemV1 {
	matched := make([]schema.DatasetItemV1, 0)
	for _, item := range items {
		if containsFold(item.RelatedCaseStudies, study.Slug) {
			matched = append(matched, item)
		}
	}
	return matched
}

func loadPackageRegistryIndex(repoRoot string) (schema.PackageRegistryIndexV1, error) {
	raw, err := os.ReadFile(packageRegistryOutputPath(repoRoot))
	if err != nil {
		if os.IsNotExist(err) {
			return schema.PackageRegistryIndexV1{}, nil
		}
		return schema.PackageRegistryIndexV1{}, fmt.Errorf("read package registry index: %w", err)
	}

	var index schema.PackageRegistryIndexV1
	if err := json.Unmarshal(raw, &index); err != nil {
		return schema.PackageRegistryIndexV1{}, fmt.Errorf("decode package registry index: %w", err)
	}
	return index, nil
}

func loadCIRuntimeIndex(repoRoot string) (schema.CIRuntimeIndexV1, error) {
	raw, err := os.ReadFile(ciRuntimeOutputPath(repoRoot))
	if err != nil {
		if os.IsNotExist(err) {
			return schema.CIRuntimeIndexV1{}, nil
		}
		return schema.CIRuntimeIndexV1{}, fmt.Errorf("read CI runtime index: %w", err)
	}

	var index schema.CIRuntimeIndexV1
	if err := json.Unmarshal(raw, &index); err != nil {
		return schema.CIRuntimeIndexV1{}, fmt.Errorf("decode CI runtime index: %w", err)
	}
	return index, nil
}

func mergeGeneratedCaseStudyData(manual, generated []caseStudyDatum) []caseStudyDatum {
	merged := make([]caseStudyDatum, 0, len(manual)+len(generated))
	seen := make(map[string]struct{}, len(manual)+len(generated))
	for _, item := range manual {
		key := strings.ToLower(strings.TrimSpace(item.Label) + "|" + strings.TrimSpace(item.Value))
		if key != "|" {
			seen[key] = struct{}{}
		}
		merged = append(merged, item)
	}
	for _, item := range generated {
		key := strings.ToLower(strings.TrimSpace(item.Label) + "|" + strings.TrimSpace(item.Value))
		if _, ok := seen[key]; ok {
			continue
		}
		if key != "|" {
			seen[key] = struct{}{}
		}
		merged = append(merged, item)
	}
	return merged
}

func buildPackageProofMetrics(study caseStudy, items []schema.PackageItemV1) []caseStudyDatum {
	related := packagesForCaseStudy(study, items)
	if len(related) == 0 {
		return nil
	}

	ecosystems := make([]string, 0, len(related))
	ecosystemSeen := make(map[string]struct{}, len(related))
	packageLabels := make([]string, 0, len(related))
	var totalDownloads int
	var totalRecentDownloads int
	var downloadCount int
	for _, item := range related {
		ecosystemLabel := packageEcosystemLabel(item.Ecosystem)
		if _, ok := ecosystemSeen[ecosystemLabel]; !ok {
			ecosystemSeen[ecosystemLabel] = struct{}{}
			ecosystems = append(ecosystems, ecosystemLabel)
		}
		packageLabels = append(packageLabels, firstNonEmpty(item.DisplayName, item.Name)+" v"+item.Version)
		if item.DownloadsTotal != nil {
			totalDownloads += *item.DownloadsTotal
			downloadCount++
		}
		if item.RecentDownloads != nil {
			totalRecentDownloads += *item.RecentDownloads
		}
	}
	sort.Strings(ecosystems)
	sort.Strings(packageLabels)

	value := fmt.Sprintf("%d package", len(related))
	if len(related) != 1 {
		value += "s"
	}
	if len(ecosystems) > 0 {
		value += " on " + humanJoin(ecosystems)
	}

	metrics := []caseStudyDatum{{
		Label:  "Published packages",
		Value:  value,
		Detail: strings.Join(packageLabels, " · "),
		URL:    singlePackageURL(related),
	}}
	if downloadCount > 0 {
		detail := fmt.Sprintf("%s lifetime downloads", formatCompactInt(totalDownloads))
		if totalRecentDownloads > 0 {
			detail += fmt.Sprintf(" · %s recent", formatCompactInt(totalRecentDownloads))
		}
		metrics = append(metrics, caseStudyDatum{
			Label:  "Registry traction",
			Value:  formatCompactInt(totalDownloads) + " downloads",
			Detail: detail,
		})
	}
	return metrics
}

func packagesForCaseStudy(study caseStudy, items []schema.PackageItemV1) []schema.PackageItemV1 {
	matched := make([]schema.PackageItemV1, 0)
	for _, item := range items {
		if containsFold(item.RelatedCaseStudies, study.Slug) {
			matched = append(matched, item)
			continue
		}
		if study.RepoURL != "" && strings.EqualFold(strings.TrimSpace(item.RepositoryURL), strings.TrimSpace(study.RepoURL)) {
			matched = append(matched, item)
		}
	}
	sort.Slice(matched, func(i, j int) bool {
		if matched[i].Ecosystem == matched[j].Ecosystem {
			return matched[i].Name < matched[j].Name
		}
		return matched[i].Ecosystem < matched[j].Ecosystem
	})
	return matched
}

func buildCIOperationalSignals(study caseStudy, items []schema.CIRuntimeItemV1) []caseStudyDatum {
	related := make([]schema.CIRuntimeItemV1, 0)
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item.CaseStudySlug), strings.TrimSpace(study.Slug)) {
			related = append(related, item)
			continue
		}
		if study.RepoURL != "" && strings.EqualFold(strings.TrimSpace(item.RepoURL), strings.TrimSpace(study.RepoURL)) {
			related = append(related, item)
		}
	}
	if len(related) == 0 {
		return nil
	}
	related = selectRelevantCIWorkflows(study, related)
	sort.Slice(related, func(i, j int) bool {
		leftRank, leftFocused := workflowFocusRank(related[i], study.CIWorkflowFocus)
		rightRank, rightFocused := workflowFocusRank(related[j], study.CIWorkflowFocus)
		if leftFocused || rightFocused {
			if leftFocused != rightFocused {
				return leftFocused
			}
			if leftRank != rightRank {
				return leftRank < rightRank
			}
		}
		leftScore := workflowRelevanceScore(related[i])
		rightScore := workflowRelevanceScore(related[j])
		if leftScore != rightScore {
			return leftScore > rightScore
		}
		leftTime := parseTimeOrZero(related[i].LatestRunAt)
		rightTime := parseTimeOrZero(related[j].LatestRunAt)
		if leftTime.Equal(rightTime) {
			return related[i].WorkflowName < related[j].WorkflowName
		}
		return leftTime.After(rightTime)
	})
	if len(related) > 3 {
		related = related[:3]
	}

	signals := make([]caseStudyDatum, 0, len(related))
	for _, item := range related {
		value := fmt.Sprintf("med %s · p95 %s", formatDurationSeconds(item.MedianDurationSeconds), formatDurationSeconds(item.P95DurationSeconds))
		detailParts := make([]string, 0, 3)
		if item.LatestConclusion != "" {
			detailParts = append(detailParts, "latest "+item.LatestConclusion)
		} else if item.LatestStatus != "" {
			detailParts = append(detailParts, "latest "+item.LatestStatus)
		}
		if item.SuccessRate > 0 {
			detailParts = append(detailParts, fmt.Sprintf("%.0f%% success", item.SuccessRate*100))
		}
		if item.RunsSampled > 0 {
			detailParts = append(detailParts, fmt.Sprintf("%d runs sampled", item.RunsSampled))
		}
		signals = append(signals, caseStudyDatum{
			Label:  firstNonEmpty(item.WorkflowName, "CI workflow"),
			Value:  value,
			Detail: strings.Join(detailParts, " · "),
			URL:    item.WorkflowURL,
		})
	}
	return signals
}

func selectRelevantCIWorkflows(study caseStudy, items []schema.CIRuntimeItemV1) []schema.CIRuntimeItemV1 {
	if len(study.CIWorkflowFocus) == 0 {
		return items
	}
	focused := make([]schema.CIRuntimeItemV1, 0, len(items))
	for _, item := range items {
		if _, ok := workflowFocusRank(item, study.CIWorkflowFocus); ok {
			focused = append(focused, item)
		}
	}
	if len(focused) > 0 {
		return focused
	}
	return items
}

func workflowFocusRank(item schema.CIRuntimeItemV1, focus []string) (int, bool) {
	haystacks := []string{item.WorkflowName, item.WorkflowPath}
	for idx, needle := range focus {
		trimmedNeedle := strings.TrimSpace(needle)
		if trimmedNeedle == "" {
			continue
		}
		for _, haystack := range haystacks {
			if strings.EqualFold(strings.TrimSpace(haystack), trimmedNeedle) {
				return idx, true
			}
		}
	}
	for idx, needle := range focus {
		trimmedNeedle := strings.TrimSpace(needle)
		if trimmedNeedle == "" {
			continue
		}
		for _, haystack := range haystacks {
			if strings.Contains(strings.ToLower(haystack), strings.ToLower(trimmedNeedle)) {
				return idx, true
			}
		}
	}
	return len(focus), false
}

func workflowRelevanceScore(item schema.CIRuntimeItemV1) int {
	name := strings.ToLower(strings.TrimSpace(item.WorkflowName))
	path := strings.ToLower(strings.TrimSpace(item.WorkflowPath))
	joined := name + " " + path
	score := 0
	for _, positive := range []string{"ci", "test", "build", "deploy", "release", "publish", "benchmark", "coverage"} {
		if strings.Contains(joined, positive) {
			score += 20
		}
	}
	for _, negative := range []string{"dependabot", "labeler", "codeql", "code-scanning", "copilot"} {
		if strings.Contains(joined, negative) {
			score -= 40
		}
	}
	if item.RunsSampled >= 5 {
		score += 10
	}
	if item.SuccessRate >= 0.9 {
		score += 5
	}
	return score
}

func packageEcosystemLabel(ecosystem string) string {
	switch strings.ToLower(strings.TrimSpace(ecosystem)) {
	case "pypi":
		return "PyPI"
	case "crates.io":
		return "crates.io"
	default:
		return firstNonEmpty(strings.TrimSpace(ecosystem), "registry")
	}
}

func singlePackageURL(items []schema.PackageItemV1) string {
	if len(items) == 1 {
		return items[0].URL
	}
	return ""
}

func humanJoin(items []string) string {
	if len(items) == 0 {
		return ""
	}
	if len(items) == 1 {
		return items[0]
	}
	if len(items) == 2 {
		return items[0] + " + " + items[1]
	}
	return strings.Join(items[:len(items)-1], ", ") + ", and " + items[len(items)-1]
}

func formatCompactInt(value int) string {
	if value >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(value)/1_000_000)
	}
	if value >= 1_000 {
		return fmt.Sprintf("%.1fk", float64(value)/1_000)
	}
	return fmt.Sprintf("%d", value)
}

func formatDurationSeconds(seconds int) string {
	if seconds <= 0 {
		return "n/a"
	}
	duration := time.Duration(seconds) * time.Second
	hours := int(duration / time.Hour)
	minutes := int((duration % time.Hour) / time.Minute)
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, int((duration%time.Minute)/time.Second))
	}
	return fmt.Sprintf("%ds", seconds)
}

func parseTimeOrZero(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}
	}
	return parsed
}

func containsFold(values []string, candidate string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}
