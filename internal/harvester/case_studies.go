package harvester

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

type caseStudiesPayload struct {
	Items []caseStudy `json:"items"`
}

type caseStudy struct {
	Slug               string             `json:"slug"`
	Title              string             `json:"title"`
	DisplayTitle       string             `json:"displayTitle"`
	Subtitle           string             `json:"subtitle"`
	Summary            string             `json:"summary"`
	MetaDescription    string             `json:"metaDescription"`
	Status             string             `json:"status"`
	RepoURL            string             `json:"repoUrl"`
	RelatedPosts       []string           `json:"relatedPosts"`
	CoverImage         string             `json:"coverImage"`
	CoverAlt           string             `json:"coverAlt"`
	CoverImageScale    string             `json:"coverImageScale"`
	CoverImagePosition string             `json:"coverImagePosition"`
	CoverEyebrow       string             `json:"coverEyebrow"`
	CoverTitle         string             `json:"coverTitle"`
	CoverText          string             `json:"coverText"`
	Stack              []string           `json:"stack"`
	Actions            []caseStudyAction  `json:"actions"`
	CIWorkflowFocus    []string           `json:"ciWorkflowFocus,omitempty"`
	ProofMetrics       []caseStudyDatum   `json:"proofMetrics,omitempty"`
	OperationalSignals []caseStudyDatum   `json:"operationalSignals,omitempty"`
	MediaSlots         []mediaSlot        `json:"mediaSlots"`
	Sections           []caseStudySection `json:"sections"`
	SystemAnatomy      *systemAnatomy     `json:"systemAnatomy,omitempty"`
}

type caseStudyDatum struct {
	Label  string `json:"label"`
	Value  string `json:"value"`
	Detail string `json:"detail"`
	URL    string `json:"url,omitempty"`
}

// systemAnatomy is the scannable "what this system is" block rendered above
// the prose sections on each case study page. Each field is an array of short
// noun phrases (~5-60 chars). Empty arrays render an empty row; nil systemAnatomy
// suppresses the block entirely (backward-compatible with older entries).
type systemAnatomy struct {
	Inputs      []string `json:"inputs"`
	Core        []string `json:"core"`
	Outputs     []string `json:"outputs"`
	Constraints []string `json:"constraints"`
}

type caseStudyAction struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Style string `json:"style"`
}

type mediaSlot struct {
	Label       string `json:"label"`
	Kind        string `json:"kind"`
	Image       string `json:"image"`
	Alt         string `json:"alt"`
	Caption     string `json:"caption"`
	Placeholder string `json:"placeholder"`
}

type caseStudySection struct {
	Heading string `json:"heading"`
	Body    string `json:"body"`
}

type adjacentCaseStudy struct {
	Title string
	URL   string
}

type caseStudyPageContext struct {
	Previous *adjacentCaseStudy
	Next     *adjacentCaseStudy
}

const publicSiteBaseURL = "https://andreabozzo.github.io/AndreaBozzo"
const defaultSocialImagePath = "/assets/images/og/homepage.png"
const socialImageWidth = "1200"
const socialImageHeight = "630"

func GenerateCaseStudyPages(repoRoot string) error {
	caseStudiesPath := filepath.Join(repoRoot, "assets", "data", "case-studies.json")
	workDir := filepath.Join(repoRoot, "work")

	payload, err := loadCaseStudiesPayload(caseStudiesPath)
	if err != nil {
		return err
	}
	payload.Items, err = enrichCaseStudiesFromArtifacts(repoRoot, payload.Items)
	if err != nil {
		return err
	}

	validSlugs := make(map[string]struct{}, len(payload.Items))
	for _, study := range payload.Items {
		if strings.TrimSpace(study.Slug) == "" {
			return fmt.Errorf("every case study must define a slug")
		}
		validSlugs[study.Slug] = struct{}{}
	}

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return fmt.Errorf("create work directory: %w", err)
	}
	if err := removeStaleCaseStudyDirs(workDir, validSlugs); err != nil {
		return err
	}

	lastmod := caseStudiesLastmod(caseStudiesPath)
	for idx, study := range payload.Items {
		outputDir := filepath.Join(workDir, study.Slug)
		if err := os.MkdirAll(outputDir, 0o755); err != nil {
			return fmt.Errorf("create %s: %w", outputDir, err)
		}
		if err := os.WriteFile(filepath.Join(outputDir, "index.html"), renderCaseStudyPage(study, pageContextForStudy(payload.Items, idx), lastmod), 0o644); err != nil {
			return fmt.Errorf("write case study page for %s: %w", study.Slug, err)
		}
	}

	return nil
}

func enrichCaseStudiesFromArtifacts(repoRoot string, items []caseStudy) ([]caseStudy, error) {
	packageIndex, err := loadPackageRegistryIndex(repoRoot)
	if err != nil {
		return nil, err
	}
	ciIndex, err := loadCIRuntimeIndex(repoRoot)
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
	}

	return enriched, nil
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

func caseStudiesLastmod(caseStudiesPath string) time.Time {
	if info, err := os.Stat(caseStudiesPath); err == nil {
		return info.ModTime().UTC()
	}
	return time.Now().UTC()
}

func removeStaleCaseStudyDirs(workDir string, validSlugs map[string]struct{}) error {
	entries, err := os.ReadDir(workDir)
	if err != nil {
		return fmt.Errorf("read work directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, ok := validSlugs[entry.Name()]; ok {
			continue
		}
		if err := os.RemoveAll(filepath.Join(workDir, entry.Name())); err != nil {
			return fmt.Errorf("remove stale case study directory %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func renderCaseStudyPage(study caseStudy, pageContext caseStudyPageContext, lastmod time.Time) []byte {
	title := firstNonEmpty(study.Title, study.Slug, "Case Study")
	displayTitle := firstNonEmpty(study.DisplayTitle, title)
	metaDescription := firstNonEmpty(study.MetaDescription, study.Summary, study.Subtitle, title+" case study.")
	canonicalURL := caseStudyCanonicalURL(study.Slug)
	socialImageURL := caseStudySocialImageURL(study)
	structuredData := caseStudyStructuredData(study, displayTitle, metaDescription, canonicalURL, socialImageURL, lastmod)
	cover := renderCaseStudyCover(study)
	actions := resolvedActions(study)
	navigation := renderCaseStudyNavigation(pageContext)

	var buf bytes.Buffer
	buf.WriteString("<!-- Generated from assets/data/case-studies.json by cmd/harvester. Do not edit directly. -->\n")
	buf.WriteString("<!DOCTYPE html>\n<html lang=\"en\" data-theme=\"light\">\n<head>\n")
	buf.WriteString("    <meta charset=\"UTF-8\">\n")
	buf.WriteString("    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\">\n")
	buf.WriteString("    <title>" + escapeHTML(title) + " | Andrea Bozzo</title>\n")
	buf.WriteString("    <meta name=\"description\" content=\"" + escapeHTML(metaDescription) + "\">\n")
	buf.WriteString("    <meta name=\"author\" content=\"Andrea Bozzo\">\n")
	buf.WriteString("    <meta name=\"robots\" content=\"index, follow\">\n")
	buf.WriteString("    <link rel=\"canonical\" href=\"" + escapeHTML(canonicalURL) + "\">\n")
	buf.WriteString("    <link rel=\"alternate\" hreflang=\"en\" href=\"" + escapeHTML(canonicalURL) + "\">\n")
	buf.WriteString("    <link rel=\"alternate\" hreflang=\"x-default\" href=\"" + escapeHTML(canonicalURL) + "\">\n")
	buf.WriteString("    <meta property=\"og:locale\" content=\"en_US\">\n")
	buf.WriteString("    <meta property=\"og:locale:alternate\" content=\"it_IT\">\n")
	buf.WriteString("    <meta property=\"og:type\" content=\"article\">\n")
	buf.WriteString("    <meta property=\"og:title\" content=\"" + escapeHTML(displayTitle) + " | Andrea Bozzo\">\n")
	buf.WriteString("    <meta property=\"og:description\" content=\"" + escapeHTML(metaDescription) + "\">\n")
	buf.WriteString("    <meta property=\"og:url\" content=\"" + escapeHTML(canonicalURL) + "\">\n")
	buf.WriteString("    <meta property=\"og:site_name\" content=\"Andrea Bozzo\">\n")
	buf.WriteString("    <meta property=\"og:image\" content=\"" + escapeHTML(socialImageURL) + "\">\n")
	buf.WriteString("    <meta property=\"og:image:type\" content=\"image/png\">\n")
	buf.WriteString("    <meta property=\"og:image:width\" content=\"" + socialImageWidth + "\">\n")
	buf.WriteString("    <meta property=\"og:image:height\" content=\"" + socialImageHeight + "\">\n")
	buf.WriteString("    <meta property=\"og:image:alt\" content=\"" + escapeHTML(displayTitle+" social card") + "\">\n")
	buf.WriteString("    <meta name=\"twitter:card\" content=\"summary_large_image\">\n")
	buf.WriteString("    <meta name=\"twitter:title\" content=\"" + escapeHTML(displayTitle) + " | Andrea Bozzo\">\n")
	buf.WriteString("    <meta name=\"twitter:description\" content=\"" + escapeHTML(metaDescription) + "\">\n")
	buf.WriteString("    <meta name=\"twitter:image\" content=\"" + escapeHTML(socialImageURL) + "\">\n")
	buf.WriteString("    <meta name=\"twitter:image:alt\" content=\"" + escapeHTML(displayTitle+" social card") + "\">\n")
	buf.WriteString("    <meta name=\"theme-color\" content=\"#fafafa\">\n")
	buf.WriteString("    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n")
	buf.WriteString("    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n")
	buf.WriteString("    <link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700&display=swap\" rel=\"stylesheet\">\n")
	buf.WriteString("    <link rel=\"icon\" type=\"image/svg+xml\" href=\"../../favicon.svg\">\n")
	buf.WriteString("    <link rel=\"stylesheet\" href=\"../../assets/styles.min.css\">\n")
	buf.WriteString("    <script>\n        (function() {\n            const savedTheme = localStorage.getItem('theme') || 'light';\n            document.documentElement.setAttribute('data-theme', savedTheme);\n        })();\n    </script>\n")
	buf.WriteString("    <script type=\"application/ld+json\">" + structuredData + "</script>\n")
	buf.WriteString("</head>\n<body>\n")
	buf.WriteString("    <header class=\"site-header\">\n")
	buf.WriteString("        <a href=\"../../#home\" class=\"site-brand\">AB</a>\n")
	buf.WriteString("        <nav class=\"site-nav\" aria-label=\"Primary navigation\">\n")
	buf.WriteString("            <a href=\"../../#workbench\">Work</a>\n")
	buf.WriteString("            <a href=\"../../blog/\">Blog</a>\n")
	buf.WriteString("            <a href=\"../../#projects\">Open Source</a>\n")
	buf.WriteString("            <a href=\"../../#papers\">Papers</a>\n")
	buf.WriteString("            <a href=\"../../#contact\">Contact</a>\n")
	buf.WriteString("        </nav>\n")
	buf.WriteString("        <button class=\"theme-toggle\" type=\"button\" aria-label=\"Toggle color theme\">\n")
	buf.WriteString("            <span class=\"theme-toggle-icon\" id=\"theme-icon\">☀️</span>\n")
	buf.WriteString("        </button>\n")
	buf.WriteString("    </header>\n\n")
	buf.WriteString("    <main class=\"content-wrapper case-study-page\">\n")
	buf.WriteString("        <section class=\"case-hero\">\n")
	buf.WriteString("            <div class=\"case-hero-copy\">\n")
	buf.WriteString("                <p class=\"eyebrow\">Case Study</p>\n")
	buf.WriteString("                <h1 class=\"title\">" + escapeHTML(displayTitle) + "</h1>\n")
	buf.WriteString("                <p class=\"subtitle\">" + escapeHTML(firstNonEmpty(study.Subtitle, study.Summary)) + "</p>\n")
	buf.WriteString("                <div class=\"case-meta\">\n")
	if study.Status != "" {
		buf.WriteString("                    <span class=\"case-meta-status\">" + escapeHTML(study.Status) + "</span>\n")
	}
	for _, item := range study.Stack {
		buf.WriteString("                    <span>" + escapeHTML(item) + "</span>\n")
	}
	buf.WriteString("                </div>\n")
	buf.WriteString("            </div>\n")
	buf.Write(cover)
	buf.WriteString("        </section>\n\n")
	buf.Write(renderSystemAnatomy(study.SystemAnatomy))
	buf.Write(navigation)
	buf.WriteString("\n")
	buf.WriteString("        <section class=\"case-layout\">\n")
	buf.WriteString("            <article class=\"case-main\">\n")
	for _, section := range study.Sections {
		buf.WriteString("                <h2>" + escapeHTML(firstNonEmpty(section.Heading, "Section")) + "</h2>\n")
		buf.WriteString("                <p>" + escapeHTML(section.Body) + "</p>\n\n")
	}
	buf.WriteString("            </article>\n\n")
	buf.WriteString("            <aside class=\"case-aside\">\n")
	for _, action := range actions {
		style := action.Style
		if style != "secondary" {
			style = "primary"
		}
		target := ""
		if isExternalURL(action.URL) {
			target = ` target="_blank" rel="noopener noreferrer"`
		}
		buf.WriteString("                <a class=\"btn btn-" + style + "\" href=\"" + escapeHTML(action.URL) + "\"" + target + ">" + escapeHTML(firstNonEmpty(action.Label, "Open")) + "</a>\n")
	}
	buf.Write(renderCaseStudyDataGroup("Proof metrics", "Concrete public proof, attached to this project rather than pushed into the graph.", study.ProofMetrics))
	buf.Write(renderCaseStudyDataGroup("Operational signals", "Workflow and runtime signals that belong next to the system they describe.", study.OperationalSignals))
	if len(study.MediaSlots) > 0 {
		buf.WriteString("\n                <div class=\"media-slots\">\n")
		for _, slot := range study.MediaSlots {
			label := firstNonEmpty(slot.Label, "Media")
			caption := firstNonEmpty(slot.Caption, slot.Placeholder)
			buf.WriteString("                    <article class=\"media-slot\">\n")
			buf.WriteString("                        <span>" + escapeHTML(label) + "</span>\n")
			if slot.Image != "" {
				imagePath := resolveCaseStudyAssetPath(slot.Image)
				altText := firstNonEmpty(slot.Alt, label)
				buf.WriteString("                        <button class=\"media-slot-trigger\" type=\"button\" aria-haspopup=\"dialog\" aria-label=\"Open full size " + escapeHTML(label) + "\" data-media-src=\"" + escapeHTML(imagePath) + "\" data-media-alt=\"" + escapeHTML(altText) + "\" data-media-label=\"" + escapeHTML(label) + "\" data-media-caption=\"" + escapeHTML(caption) + "\">\n")
				buf.WriteString("                            <figure class=\"media-slot-figure\">\n")
				buf.WriteString("                                <img src=\"" + escapeHTML(imagePath) + "\" alt=\"" + escapeHTML(altText) + "\" loading=\"lazy\">\n")
				buf.WriteString("                            </figure>\n")
				buf.WriteString("                            <span class=\"media-slot-hint\">Open full size</span>\n")
				buf.WriteString("                        </button>\n")
			}
			if caption != "" {
				buf.WriteString("                        <p>" + escapeHTML(caption) + "</p>\n")
			}
			buf.WriteString("                    </article>\n")
		}
		buf.WriteString("                </div>\n")
	}
	buf.WriteString("            </aside>\n")
	buf.WriteString("        </section>\n")
	buf.WriteString("    </main>\n\n")
	buf.WriteString("    <script src=\"../../assets/main.min.js\" defer></script>\n")
	buf.WriteString("</body>\n</html>\n")

	return buf.Bytes()
}

func renderCaseStudyDataGroup(title, intro string, items []caseStudyDatum) []byte {
	filtered := make([]caseStudyDatum, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.Label) == "" && strings.TrimSpace(item.Value) == "" && strings.TrimSpace(item.Detail) == "" {
			continue
		}
		filtered = append(filtered, item)
	}
	if len(filtered) == 0 {
		return nil
	}

	var buf bytes.Buffer
	buf.WriteString("\n                <section class=\"case-data-group\" aria-label=\"" + escapeHTML(title) + "\">\n")
	buf.WriteString("                    <p class=\"case-data-kicker\">" + escapeHTML(title) + "</p>\n")
	if strings.TrimSpace(intro) != "" {
		buf.WriteString("                    <p class=\"case-data-intro\">" + escapeHTML(intro) + "</p>\n")
	}
	buf.WriteString("                    <div class=\"case-data-list\">\n")
	for _, item := range filtered {
		label := firstNonEmpty(item.Label, "Signal")
		value := firstNonEmpty(item.Value, "Tracked")
		detail := strings.TrimSpace(item.Detail)
		if strings.TrimSpace(item.URL) != "" {
			target := ""
			if isExternalURL(item.URL) {
				target = ` target="_blank" rel="noopener noreferrer"`
			}
			buf.WriteString("                        <a class=\"case-datum case-datum-link\" href=\"" + escapeHTML(item.URL) + "\"" + target + ">\n")
		} else {
			buf.WriteString("                        <article class=\"case-datum\">\n")
		}
		buf.WriteString("                            <span class=\"case-datum-label\">" + escapeHTML(label) + "</span>\n")
		buf.WriteString("                            <strong class=\"case-datum-value\">" + escapeHTML(value) + "</strong>\n")
		if detail != "" {
			buf.WriteString("                            <p class=\"case-datum-detail\">" + escapeHTML(detail) + "</p>\n")
		}
		if strings.TrimSpace(item.URL) != "" {
			buf.WriteString("                        </a>\n")
		} else {
			buf.WriteString("                        </article>\n")
		}
	}
	buf.WriteString("                    </div>\n")
	buf.WriteString("                </section>\n")
	return buf.Bytes()
}

// renderSystemAnatomy emits the labeled "what this system is" block. The four
// rows render as a stable grid even when individual lists are empty, so a
// case study with only inputs+core still reads coherently. Returns an empty
// slice when the case study omits systemAnatomy entirely.
func renderSystemAnatomy(anatomy *systemAnatomy) []byte {
	if anatomy == nil {
		return nil
	}
	rows := []struct {
		label string
		items []string
	}{
		{"Inputs", anatomy.Inputs},
		{"Core", anatomy.Core},
		{"Outputs", anatomy.Outputs},
		{"Constraints", anatomy.Constraints},
	}

	hasContent := false
	for _, row := range rows {
		if len(row.items) > 0 {
			hasContent = true
			break
		}
	}
	if !hasContent {
		return nil
	}

	var buf bytes.Buffer
	buf.WriteString("        <section class=\"system-anatomy\" aria-label=\"System anatomy\">\n")
	buf.WriteString("            <p class=\"eyebrow\">System anatomy</p>\n")
	buf.WriteString("            <dl class=\"system-anatomy-rows\">\n")
	for _, row := range rows {
		if len(row.items) == 0 {
			continue
		}
		buf.WriteString("                <div class=\"system-anatomy-row\">\n")
		buf.WriteString("                    <dt>" + escapeHTML(row.label) + "</dt>\n")
		buf.WriteString("                    <dd>\n")
		for _, item := range row.items {
			buf.WriteString("                        <span class=\"system-anatomy-chip\">" + escapeHTML(item) + "</span>\n")
		}
		buf.WriteString("                    </dd>\n")
		buf.WriteString("                </div>\n")
	}
	buf.WriteString("            </dl>\n")
	buf.WriteString("        </section>\n\n")
	return buf.Bytes()
}

func renderCaseStudyNavigation(pageContext caseStudyPageContext) []byte {
	var buf bytes.Buffer
	buf.WriteString("        <nav class=\"case-page-nav\" aria-label=\"Case study navigation\">\n")
	buf.WriteString("            <a class=\"btn btn-secondary\" href=\"../../#workbench\">Back to workbench</a>\n")

	if pageContext.Previous != nil {
		buf.WriteString("            <a class=\"btn btn-ghost\" href=\"" + escapeHTML(pageContext.Previous.URL) + "\">← " + escapeHTML(pageContext.Previous.Title) + "</a>\n")
	}
	if pageContext.Next != nil {
		buf.WriteString("            <a class=\"btn btn-ghost\" href=\"" + escapeHTML(pageContext.Next.URL) + "\">" + escapeHTML(pageContext.Next.Title) + " →</a>\n")
	}

	buf.WriteString("        </nav>\n")
	return buf.Bytes()
}

func pageContextForStudy(items []caseStudy, idx int) caseStudyPageContext {
	var pageContext caseStudyPageContext

	if idx > 0 {
		pageContext.Previous = &adjacentCaseStudy{
			Title: firstNonEmpty(items[idx-1].Title, items[idx-1].Slug, "Previous case study"),
			URL:   "../" + items[idx-1].Slug + "/",
		}
	}
	if idx+1 < len(items) {
		pageContext.Next = &adjacentCaseStudy{
			Title: firstNonEmpty(items[idx+1].Title, items[idx+1].Slug, "Next case study"),
			URL:   "../" + items[idx+1].Slug + "/",
		}
	}

	return pageContext
}

func renderCaseStudyCover(study caseStudy) []byte {
	coverImage := resolveCaseStudyAssetPath(study.CoverImage)
	if coverImage != "" {
		imageStyle := coverImageInlineStyle(study)
		return []byte(
			"            <figure class=\"case-cover\">\n" +
				"                <img src=\"" + escapeHTML(coverImage) + "\" alt=\"" + escapeHTML(firstNonEmpty(study.CoverAlt, firstNonEmpty(study.Title, study.Slug, "Case study")+" cover art")) + "\"" + imageStyle + ">\n" +
				"            </figure>\n",
		)
	}

	return []byte(
		"            <figure class=\"case-cover case-cover-placeholder\">\n" +
			"                <div>\n" +
			"                    <span class=\"case-cover-eyebrow\">" + escapeHTML(firstNonEmpty(study.CoverEyebrow, study.Status, "Case study")) + "</span>\n" +
			"                    <strong>" + escapeHTML(firstNonEmpty(study.CoverTitle, study.Title, study.Slug, "Case study")) + "</strong>\n" +
			"                    <p>" + escapeHTML(firstNonEmpty(study.CoverText, study.Summary, study.Subtitle)) + "</p>\n" +
			"                </div>\n" +
			"            </figure>\n",
	)
}

func coverImageInlineStyle(study caseStudy) string {
	styles := make([]string, 0, 2)
	if strings.TrimSpace(study.CoverImagePosition) != "" {
		styles = append(styles, "object-position: "+study.CoverImagePosition)
	}
	if strings.TrimSpace(study.CoverImageScale) != "" {
		styles = append(styles, "transform: scale("+study.CoverImageScale+")")
	}
	if len(styles) == 0 {
		return ""
	}

	return " style=\"" + escapeHTML(strings.Join(styles, "; ")) + "\""
}

func resolvedActions(study caseStudy) []caseStudyAction {
	if len(study.Actions) > 0 {
		actions := make([]caseStudyAction, len(study.Actions))
		copy(actions, study.Actions)
		for i := range actions {
			if actions[i].Style == "" {
				if i == 0 {
					actions[i].Style = "primary"
				} else {
					actions[i].Style = "secondary"
				}
			}
		}
		return actions
	}

	actions := make([]caseStudyAction, 0, 2)
	if study.RepoURL != "" {
		actions = append(actions, caseStudyAction{Label: "Repository", URL: study.RepoURL, Style: "primary"})
	}
	if len(study.RelatedPosts) > 0 {
		style := "primary"
		if len(actions) > 0 {
			style = "secondary"
		}
		actions = append(actions, caseStudyAction{Label: "Related article", URL: "../../blog/en/posts/" + study.RelatedPosts[0] + "/", Style: style})
	}
	return actions
}

func resolveCaseStudyAssetPath(assetPath string) string {
	switch {
	case assetPath == "":
		return ""
	case isExternalURL(assetPath):
		return assetPath
	case strings.HasPrefix(assetPath, "../../"):
		return assetPath
	case strings.HasPrefix(assetPath, "../blog/"):
		return "../" + assetPath
	case strings.HasPrefix(assetPath, "blog/"):
		return "../../" + assetPath
	default:
		return assetPath
	}
}

func isExternalURL(value string) bool {
	return strings.HasPrefix(strings.ToLower(value), "http://") || strings.HasPrefix(strings.ToLower(value), "https://")
}

func caseStudyCanonicalURL(slug string) string {
	return publicSiteBaseURL + "/work/" + strings.TrimSpace(slug) + "/"
}

func caseStudySocialImageURL(study caseStudy) string {
	trimmedSlug := strings.TrimSpace(study.Slug)
	if trimmedSlug == "" {
		return publicSiteBaseURL + defaultSocialImagePath
	}
	return publicSiteBaseURL + "/assets/images/og/" + trimmedSlug + ".png"
}

func caseStudyStructuredData(study caseStudy, displayTitle, metaDescription, canonicalURL, socialImageURL string, lastmod time.Time) string {
	payload := map[string]any{
		"@context":         "https://schema.org",
		"@type":            "CreativeWork",
		"additionalType":   "https://schema.org/CaseStudy",
		"headline":         displayTitle,
		"name":             displayTitle,
		"description":      metaDescription,
		"url":              canonicalURL,
		"image":            socialImageURL,
		"mainEntityOfPage": canonicalURL,
		"dateModified":     lastmod.Format(time.RFC3339),
		"inLanguage":       "en",
		"isPartOf": map[string]any{
			"@type": "WebSite",
			"@id":   publicSiteBaseURL + "/",
		},
		"author": map[string]any{
			"@type": "Person",
			"name":  "Andrea Bozzo",
			"url":   publicSiteBaseURL + "/",
		},
		"publisher": map[string]any{
			"@type": "Person",
			"name":  "Andrea Bozzo",
			"url":   publicSiteBaseURL + "/",
		},
	}

	stack := normalizedStrings(study.Stack)
	if len(stack) > 0 {
		payload["keywords"] = strings.Join(stack, ", ")
		payload["mentions"] = stackMentions(stack)
	}
	relatedLinks := relatedBlogPostPermalinks(study.RelatedPosts)
	if len(relatedLinks) > 0 {
		payload["relatedLink"] = relatedLinks
	}
	if study.RepoURL != "" {
		payload["sameAs"] = []string{study.RepoURL}
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func relatedBlogPostPermalinks(slugs []string) []string {
	links := make([]string, 0, len(slugs))
	for _, slug := range normalizedStrings(slugs) {
		if isExternalURL(slug) {
			links = append(links, slug)
			continue
		}
		links = append(links, publicSiteBaseURL+"/blog/en/posts/"+strings.Trim(slug, "/")+"/")
	}
	return links
}

func stackMentions(stack []string) []map[string]string {
	mentions := make([]map[string]string, 0, len(stack))
	for _, name := range stack {
		mentions = append(mentions, map[string]string{
			"@type": "Thing",
			"name":  name,
		})
	}
	return mentions
}

func normalizedStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func escapeHTML(value string) string {
	return html.EscapeString(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func caseStudySlugs(payload caseStudiesPayload) []string {
	slugs := make([]string, 0, len(payload.Items))
	for _, item := range payload.Items {
		if item.Slug != "" {
			slugs = append(slugs, item.Slug)
		}
	}
	sort.Strings(slugs)
	return slugs
}
