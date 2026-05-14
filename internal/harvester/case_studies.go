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
	Slug               string                          `json:"slug"`
	Title              string                          `json:"title"`
	DisplayTitle       string                          `json:"displayTitle"`
	Subtitle           string                          `json:"subtitle"`
	Summary            string                          `json:"summary"`
	MetaDescription    string                          `json:"metaDescription"`
	Status             string                          `json:"status"`
	RepoURL            string                          `json:"repoUrl"`
	RelatedPosts       []string                        `json:"relatedPosts"`
	CoverImage         string                          `json:"coverImage"`
	CoverAlt           string                          `json:"coverAlt"`
	CoverImageScale    string                          `json:"coverImageScale"`
	CoverImagePosition string                          `json:"coverImagePosition"`
	CoverEyebrow       string                          `json:"coverEyebrow"`
	CoverTitle         string                          `json:"coverTitle"`
	CoverText          string                          `json:"coverText"`
	Stack              []string                        `json:"stack"`
	Actions            []caseStudyAction               `json:"actions"`
	CIWorkflowFocus    []string                        `json:"ciWorkflowFocus,omitempty"`
	ProofMetrics       []caseStudyDatum                `json:"proofMetrics,omitempty"`
	OperationalSignals []caseStudyDatum                `json:"operationalSignals,omitempty"`
	MediaSlots         []mediaSlot                     `json:"mediaSlots"`
	Sections           []caseStudySection              `json:"sections"`
	SystemAnatomy      *systemAnatomy                  `json:"systemAnatomy,omitempty"`
	Datasets           []schema.DatasetItemV1          `json:"-"`
	Translations       map[string]caseStudyTranslation `json:"translations,omitempty"`
}

// caseStudyTranslation carries locale-specific overrides for a case study.
// Any field left empty falls back to the English source on the parent caseStudy
// (lenient mode). The renderer skips emitting a localized page entirely when
// SEO-critical fields (Title or DisplayTitle, MetaDescription or Summary or
// Subtitle, and at least one Section body) cannot be satisfied.
type caseStudyTranslation struct {
	Title              string             `json:"title,omitempty"`
	DisplayTitle       string             `json:"displayTitle,omitempty"`
	Subtitle           string             `json:"subtitle,omitempty"`
	Summary            string             `json:"summary,omitempty"`
	MetaDescription    string             `json:"metaDescription,omitempty"`
	Status             string             `json:"status,omitempty"`
	CoverAlt           string             `json:"coverAlt,omitempty"`
	CoverEyebrow       string             `json:"coverEyebrow,omitempty"`
	CoverTitle         string             `json:"coverTitle,omitempty"`
	CoverText          string             `json:"coverText,omitempty"`
	Stack              []string           `json:"stack,omitempty"`
	Actions            []caseStudyAction  `json:"actions,omitempty"`
	ProofMetrics       []caseStudyDatum   `json:"proofMetrics,omitempty"`
	OperationalSignals []caseStudyDatum   `json:"operationalSignals,omitempty"`
	MediaSlots         []mediaSlot        `json:"mediaSlots,omitempty"`
	Sections           []caseStudySection `json:"sections,omitempty"`
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

// translationFor returns the translation block for the given locale (if any).
// English is always treated as the source, never a translation.
func (s caseStudy) translationFor(locale string) (caseStudyTranslation, bool) {
	if !localeIsAlternate(locale) {
		return caseStudyTranslation{}, false
	}
	t, ok := s.Translations[locale]
	return t, ok
}

// applyLocaleOverrides returns a copy of the study with locale-specific
// overrides applied. Missing fields fall back to the English source (lenient).
// For "en" or any locale without a translation block, the study is returned
// unchanged.
func applyLocaleOverrides(study caseStudy, locale string) caseStudy {
	tr, ok := study.translationFor(locale)
	if !ok {
		return study
	}
	view := study
	if v := strings.TrimSpace(tr.Title); v != "" {
		view.Title = v
	}
	if v := strings.TrimSpace(tr.DisplayTitle); v != "" {
		view.DisplayTitle = v
	}
	if v := strings.TrimSpace(tr.Subtitle); v != "" {
		view.Subtitle = v
	}
	if v := strings.TrimSpace(tr.Summary); v != "" {
		view.Summary = v
	}
	if v := strings.TrimSpace(tr.MetaDescription); v != "" {
		view.MetaDescription = v
	}
	if v := strings.TrimSpace(tr.Status); v != "" {
		view.Status = v
	}
	if v := strings.TrimSpace(tr.CoverAlt); v != "" {
		view.CoverAlt = v
	}
	if v := strings.TrimSpace(tr.CoverEyebrow); v != "" {
		view.CoverEyebrow = v
	}
	if v := strings.TrimSpace(tr.CoverTitle); v != "" {
		view.CoverTitle = v
	}
	if v := strings.TrimSpace(tr.CoverText); v != "" {
		view.CoverText = v
	}
	if len(tr.Stack) > 0 {
		view.Stack = append([]string(nil), tr.Stack...)
	}
	if len(tr.Actions) > 0 {
		view.Actions = mergeTranslatedActions(view.Actions, tr.Actions)
	}
	if len(tr.ProofMetrics) > 0 {
		view.ProofMetrics = mergeTranslatedData(view.ProofMetrics, tr.ProofMetrics)
	}
	if len(tr.OperationalSignals) > 0 {
		view.OperationalSignals = mergeTranslatedData(view.OperationalSignals, tr.OperationalSignals)
	}
	if len(tr.MediaSlots) > 0 {
		view.MediaSlots = mergeTranslatedMediaSlots(view.MediaSlots, tr.MediaSlots)
	}
	if len(tr.Sections) > 0 {
		view.Sections = append([]caseStudySection(nil), tr.Sections...)
	}
	if tr.SystemAnatomy != nil {
		anatomy := *tr.SystemAnatomy
		view.SystemAnatomy = &anatomy
	}
	return view
}

// mergeTranslatedActions overlays translated labels onto the source actions
// while preserving URLs and styles from the source. Index alignment is used;
// extra translated entries beyond the source length are appended.
func mergeTranslatedActions(src, tr []caseStudyAction) []caseStudyAction {
	out := make([]caseStudyAction, 0, max(len(src), len(tr)))
	for i, s := range src {
		merged := s
		if i < len(tr) {
			if v := strings.TrimSpace(tr[i].Label); v != "" {
				merged.Label = v
			}
			if v := strings.TrimSpace(tr[i].URL); v != "" {
				merged.URL = v
			}
			if v := strings.TrimSpace(tr[i].Style); v != "" {
				merged.Style = v
			}
		}
		out = append(out, merged)
	}
	for i := len(src); i < len(tr); i++ {
		out = append(out, tr[i])
	}
	return out
}

func mergeTranslatedData(src, tr []caseStudyDatum) []caseStudyDatum {
	out := make([]caseStudyDatum, 0, max(len(src), len(tr)))
	for i, s := range src {
		merged := s
		if i < len(tr) {
			if v := strings.TrimSpace(tr[i].Label); v != "" {
				merged.Label = v
			}
			if v := strings.TrimSpace(tr[i].Value); v != "" {
				merged.Value = v
			}
			if v := strings.TrimSpace(tr[i].Detail); v != "" {
				merged.Detail = v
			}
		}
		out = append(out, merged)
	}
	for i := len(src); i < len(tr); i++ {
		out = append(out, tr[i])
	}
	return out
}

func mergeTranslatedMediaSlots(src, tr []mediaSlot) []mediaSlot {
	out := make([]mediaSlot, 0, max(len(src), len(tr)))
	for i, s := range src {
		merged := s
		if i < len(tr) {
			if v := strings.TrimSpace(tr[i].Label); v != "" {
				merged.Label = v
			}
			if v := strings.TrimSpace(tr[i].Alt); v != "" {
				merged.Alt = v
			}
			if v := strings.TrimSpace(tr[i].Caption); v != "" {
				merged.Caption = v
			}
			if v := strings.TrimSpace(tr[i].Placeholder); v != "" {
				merged.Placeholder = v
			}
		}
		out = append(out, merged)
	}
	for i := len(src); i < len(tr); i++ {
		out = append(out, tr[i])
	}
	return out
}

// hasIndexableTranslation reports whether a study has enough localized content
// at the given locale to merit emitting a public page. The release gate in
// LOCALIZATION.md requires at minimum a localized title, meta description,
// and visible body copy. Lenient field-level fallback is fine elsewhere; this
// guard prevents publishing a page that would index English text under a
// non-English URL.
func hasIndexableTranslation(study caseStudy, locale string) bool {
	if !localeIsAlternate(locale) {
		return true
	}
	tr, ok := study.translationFor(locale)
	if !ok {
		return false
	}
	hasTitle := strings.TrimSpace(tr.Title) != "" || strings.TrimSpace(tr.DisplayTitle) != ""
	hasMeta := strings.TrimSpace(tr.MetaDescription) != "" ||
		strings.TrimSpace(tr.Summary) != "" ||
		strings.TrimSpace(tr.Subtitle) != ""
	hasBody := false
	for _, sec := range tr.Sections {
		if strings.TrimSpace(sec.Body) != "" {
			hasBody = true
			break
		}
	}
	return hasTitle && hasMeta && hasBody
}

// localesForStudy returns the locales for which this study should emit pages,
// in canonical order with English first.
func localesForStudy(study caseStudy) []string {
	locales := []string{"en"}
	for _, locale := range supportedLocales {
		if !localeIsAlternate(locale) {
			continue
		}
		if hasIndexableTranslation(study, locale) {
			locales = append(locales, locale)
		}
	}
	return locales
}

const publicSiteBaseURL = "https://andreabozzo.github.io/AndreaBozzo"
const defaultSocialImagePath = "/assets/images/og/homepage.png"
const socialImageWidth = "1200"
const socialImageHeight = "630"

// supportedLocales are the locales the case-study generator can emit.
// English ("en") is always emitted. Other locales are emitted only when a
// per-item translations block is present AND the translation is indexable
// (see hasIndexableTranslation). The slice order also defines the iteration
// order so the alternate-language enumeration is stable.
var supportedLocales = []string{"en", "it"}

func localeIsAlternate(locale string) bool { return locale != "en" }

// localeRoot returns the relative path prefix used to reach the site root
// from a generated case-study page at the given locale. English pages live at
// work/<slug>/index.html (two levels deep); Italian pages live at
// it/work/<slug>/index.html (three levels deep).
func localeRoot(locale string) string {
	if localeIsAlternate(locale) {
		return "../../../"
	}
	return "../../"
}

// localeCaseStudyOutputDir returns the on-disk directory for the rendered page.
func localeCaseStudyOutputDir(workRoot string, locale, slug string) string {
	if localeIsAlternate(locale) {
		return filepath.Join(filepath.Dir(workRoot), locale, "work", slug)
	}
	return filepath.Join(workRoot, slug)
}

// localeCaseStudyCanonicalURL returns the public URL for the case study at
// the given locale.
func localeCaseStudyCanonicalURL(locale, slug string) string {
	if localeIsAlternate(locale) {
		return publicSiteBaseURL + "/" + locale + "/work/" + strings.TrimSpace(slug) + "/"
	}
	return publicSiteBaseURL + "/work/" + strings.TrimSpace(slug) + "/"
}

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

	// Per-locale slug indexes drive prev/next neighbors and hreflang reciprocity.
	slugsByLocale := make(map[string]map[string]struct{}, len(supportedLocales))
	for _, locale := range supportedLocales {
		slugsByLocale[locale] = make(map[string]struct{})
	}
	for _, study := range payload.Items {
		for _, locale := range localesForStudy(study) {
			slugsByLocale[locale][study.Slug] = struct{}{}
		}
	}

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return fmt.Errorf("create work directory: %w", err)
	}
	// Clean up English directory: any slug missing from English (effectively all
	// items) is stale. /it/work also gets cleaned: any slug that no longer has a
	// usable Italian translation is removed so the alternate stays in sync.
	if err := removeStaleCaseStudyDirs(workDir, validSlugs); err != nil {
		return err
	}
	for _, locale := range supportedLocales {
		if !localeIsAlternate(locale) {
			continue
		}
		altDir := filepath.Join(repoRoot, locale, "work")
		if len(slugsByLocale[locale]) == 0 {
			// No indexable translations for this locale: prune the directory
			// so it doesn't ship as an empty surface in _site.
			if err := os.RemoveAll(altDir); err != nil {
				return fmt.Errorf("remove empty %s: %w", altDir, err)
			}
			localeRoot := filepath.Join(repoRoot, locale)
			if entries, err := os.ReadDir(localeRoot); err == nil && len(entries) == 0 {
				_ = os.Remove(localeRoot)
			}
			continue
		}
		if err := os.MkdirAll(altDir, 0o755); err != nil {
			return fmt.Errorf("create %s: %w", altDir, err)
		}
		if err := removeStaleCaseStudyDirs(altDir, slugsByLocale[locale]); err != nil {
			return err
		}
	}

	lastmod := caseStudiesLastmod(caseStudiesPath)
	for _, study := range payload.Items {
		studyLocales := localesForStudy(study)
		// Build alternate-locale list (locales other than English) for hreflang.
		alternates := append([]string(nil), studyLocales...)
		for _, locale := range studyLocales {
			items := localeFilteredStudies(payload.Items, locale)
			idx := indexOfStudy(items, study.Slug)
			if idx < 0 {
				continue
			}
			outputDir := localeCaseStudyOutputDir(workDir, locale, study.Slug)
			if err := os.MkdirAll(outputDir, 0o755); err != nil {
				return fmt.Errorf("create %s: %w", outputDir, err)
			}
			opts := caseStudyRenderOptions{
				Locale:           locale,
				AlternateLocales: alternates,
			}
			body := renderCaseStudyPageForLocale(study, pageContextForStudy(items, idx), lastmod, opts)
			if err := os.WriteFile(filepath.Join(outputDir, "index.html"), body, 0o644); err != nil {
				return fmt.Errorf("write case study page for %s (%s): %w", study.Slug, locale, err)
			}
		}
	}

	return nil
}

// localeFilteredStudies returns the studies that produce a page at the given
// locale, preserving payload order. English returns the full list; alternate
// locales filter to studies whose translation is indexable.
func localeFilteredStudies(items []caseStudy, locale string) []caseStudy {
	if !localeIsAlternate(locale) {
		return items
	}
	out := make([]caseStudy, 0, len(items))
	for _, study := range items {
		if hasIndexableTranslation(study, locale) {
			out = append(out, applyLocaleOverrides(study, locale))
		}
	}
	return out
}

func indexOfStudy(items []caseStudy, slug string) int {
	for i, s := range items {
		if s.Slug == slug {
			return i
		}
	}
	return -1
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

// caseStudyRenderOptions carries per-page rendering context that is locale- or
// alternate-link dependent.
type caseStudyRenderOptions struct {
	Locale           string
	AlternateLocales []string
}

func renderCaseStudyPage(study caseStudy, pageContext caseStudyPageContext, lastmod time.Time) []byte {
	return renderCaseStudyPageForLocale(study, pageContext, lastmod, caseStudyRenderOptions{Locale: "en"})
}

func renderCaseStudyPageForLocale(study caseStudy, pageContext caseStudyPageContext, lastmod time.Time, opts caseStudyRenderOptions) []byte {
	locale := opts.Locale
	if locale == "" {
		locale = "en"
	}
	rootRel := localeRoot(locale)
	localized := applyLocaleOverrides(study, locale)
	title := firstNonEmpty(localized.Title, localized.Slug, defaultCaseStudyTitle(locale))
	displayTitle := firstNonEmpty(localized.DisplayTitle, title)
	metaFallback := title + " " + defaultCaseStudyMetaSuffix(locale)
	metaDescription := firstNonEmpty(localized.MetaDescription, localized.Summary, localized.Subtitle, metaFallback)
	canonicalURL := localeCaseStudyCanonicalURL(locale, localized.Slug)
	socialImageURL := caseStudySocialImageURL(localized)
	structuredData := caseStudyStructuredData(localized, locale, displayTitle, metaDescription, canonicalURL, socialImageURL, lastmod)
	cover := renderCaseStudyCover(localized, rootRel)
	actions := resolvedActions(localized, locale, rootRel)
	navigation := renderCaseStudyNavigation(pageContext, rootRel, locale)
	htmlLang := locale
	ogLocale := ogLocaleFor(locale)

	var buf bytes.Buffer
	buf.WriteString("<!-- Generated from assets/data/case-studies.json by cmd/harvester. Do not edit directly. -->\n")
	buf.WriteString("<!DOCTYPE html>\n<html lang=\"" + htmlLang + "\" data-theme=\"light\">\n<head>\n")
	buf.WriteString("    <meta charset=\"UTF-8\">\n")
	buf.WriteString("    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\">\n")
	buf.WriteString("    <title>" + escapeHTML(title) + " | Andrea Bozzo</title>\n")
	buf.WriteString("    <meta name=\"description\" content=\"" + escapeHTML(metaDescription) + "\">\n")
	buf.WriteString("    <meta name=\"author\" content=\"Andrea Bozzo\">\n")
	buf.WriteString("    <meta name=\"robots\" content=\"index, follow\">\n")
	buf.WriteString("    <link rel=\"canonical\" href=\"" + escapeHTML(canonicalURL) + "\">\n")
	buf.WriteString(renderHreflangLinks(localized.Slug, locale, opts.AlternateLocales))
	buf.WriteString("    <meta property=\"og:locale\" content=\"" + ogLocale + "\">\n")
	for _, alt := range opts.AlternateLocales {
		if alt == locale {
			continue
		}
		buf.WriteString("    <meta property=\"og:locale:alternate\" content=\"" + ogLocaleFor(alt) + "\">\n")
	}
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
	buf.WriteString("    <meta name=\"theme-color\" content=\"#f7faf6\">\n")
	buf.WriteString("    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n")
	buf.WriteString("    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n")
	buf.WriteString("    <link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700&display=swap\" rel=\"stylesheet\">\n")
	buf.WriteString("    <link rel=\"prefetch\" href=\"" + rootRel + "blog/\">\n")
	buf.WriteString("    <link rel=\"prefetch\" href=\"" + rootRel + "blog/en/\">\n")
	buf.WriteString("    <link rel=\"icon\" type=\"image/svg+xml\" href=\"" + rootRel + "favicon.svg\">\n")
	buf.WriteString("    <link rel=\"stylesheet\" href=\"" + rootRel + "assets/styles.min.css\">\n")
	buf.WriteString("    <script>\n        (function() {\n            const savedTheme = localStorage.getItem('theme') || 'light';\n            document.documentElement.setAttribute('data-theme', savedTheme);\n        })();\n    </script>\n")
	buf.WriteString("    <script type=\"application/ld+json\">" + structuredData + "</script>\n")
	buf.WriteString("</head>\n<body>\n")
	buf.WriteString("    <header class=\"site-header\">\n")
	buf.WriteString("        <a href=\"" + rootRel + "#home\" class=\"site-brand\">AB</a>\n")
	buf.WriteString("        <nav class=\"site-nav\" aria-label=\"" + navLabel(locale, "primary") + "\">\n")
	buf.WriteString("            <a href=\"" + rootRel + "#workbench\">" + navLabel(locale, "work") + "</a>\n")
	buf.WriteString("            <a href=\"" + rootRel + localeBlogIndexPath(locale) + "\" data-blog-link>" + navLabel(locale, "blog") + "</a>\n")
	buf.WriteString("            <a href=\"" + rootRel + "#projects\">" + navLabel(locale, "open_source") + "</a>\n")
	buf.WriteString("            <a href=\"" + rootRel + "#papers\">" + navLabel(locale, "papers") + "</a>\n")
	buf.WriteString("            <a href=\"" + rootRel + "#contact\">" + navLabel(locale, "contact") + "</a>\n")
	buf.WriteString("        </nav>\n")
	buf.Write(renderCaseStudyLocaleSwitch(localized.Slug, locale, opts.AlternateLocales))
	buf.WriteString("        <button class=\"theme-toggle\" type=\"button\" aria-label=\"" + navLabel(locale, "toggle_theme") + "\">\n")
	buf.WriteString("            <span class=\"theme-toggle-icon\" id=\"theme-icon\">☀️</span>\n")
	buf.WriteString("        </button>\n")
	buf.WriteString("    </header>\n\n")
	buf.WriteString("    <main class=\"content-wrapper case-study-page\">\n")
	buf.WriteString("        <section class=\"case-hero\">\n")
	buf.WriteString("            <div class=\"case-hero-copy\">\n")
	buf.WriteString("                <p class=\"eyebrow\">" + navLabel(locale, "case_study_eyebrow") + "</p>\n")
	buf.WriteString("                <h1 class=\"title\">" + escapeHTML(displayTitle) + "</h1>\n")
	buf.WriteString("                <p class=\"subtitle\">" + escapeHTML(firstNonEmpty(localized.Subtitle, localized.Summary)) + "</p>\n")
	buf.WriteString("                <div class=\"case-meta\">\n")
	if localized.Status != "" {
		buf.WriteString("                    <span class=\"case-meta-status\">" + escapeHTML(localized.Status) + "</span>\n")
	}
	for _, item := range localized.Stack {
		buf.WriteString("                    <span>" + escapeHTML(item) + "</span>\n")
	}
	buf.WriteString("                </div>\n")
	buf.WriteString("            </div>\n")
	buf.Write(cover)
	buf.WriteString("        </section>\n\n")
	buf.Write(renderSystemAnatomy(localized.SystemAnatomy, locale))
	buf.Write(renderCaseStudyDatasets(localized.Datasets, locale))
	buf.Write(navigation)
	buf.WriteString("\n")
	buf.WriteString("        <section class=\"case-layout\">\n")
	buf.WriteString("            <div class=\"case-content\">\n")
	buf.WriteString("                <article class=\"case-main\">\n")
	for _, section := range localized.Sections {
		buf.WriteString("                    <h2>" + escapeHTML(firstNonEmpty(section.Heading, navLabel(locale, "section_fallback"))) + "</h2>\n")
		buf.WriteString("                    <p>" + escapeHTML(section.Body) + "</p>\n\n")
	}
	buf.WriteString("                </article>\n")
	buf.Write(renderCaseStudyMediaGallery(localized.MediaSlots, locale))
	buf.WriteString("            </div>\n")
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
		buf.WriteString("                <a class=\"btn btn-" + style + "\" href=\"" + escapeHTML(action.URL) + "\"" + target + ">" + escapeHTML(firstNonEmpty(action.Label, navLabel(locale, "open_default"))) + "</a>\n")
	}
	buf.Write(renderCaseStudyDataGroup(navLabel(locale, "proof_metrics_title"), navLabel(locale, "proof_metrics_intro"), localized.ProofMetrics))
	buf.Write(renderCaseStudyDataGroup(navLabel(locale, "operational_signals_title"), navLabel(locale, "operational_signals_intro"), localized.OperationalSignals))
	buf.WriteString("            </aside>\n")
	buf.WriteString("        </section>\n")
	buf.WriteString("    </main>\n\n")
	buf.WriteString("    <script src=\"" + rootRel + "assets/main.min.js\" defer></script>\n")
	buf.WriteString("</body>\n</html>\n")

	return buf.Bytes()
}

// renderCaseStudyLocaleSwitch emits the site-wide locale switch widget for a
// case-study page. The widget is rendered only when there is at least one
// reciprocal locale to switch to (i.e. the page advertises an alternate). This
// enforces the LOCALIZATION.md release gate: never expose a switch when the
// destination would not actually exist.
//
// Hrefs are relative paths from the page's own location:
//   - EN page at work/<slug>/   reaches EN root via "../../"   and IT page via "../../it/work/<slug>/"
//   - IT page at it/work/<slug>/ reaches IT root via "../../"   and EN page via "../../../work/<slug>/"
func renderCaseStudyLocaleSwitch(slug, locale string, alternates []string) []byte {
	if len(alternates) <= 1 {
		return nil
	}
	// Stable ordering: English first, then other locales in supportedLocales order.
	ordered := make([]string, 0, len(alternates))
	for _, candidate := range supportedLocales {
		for _, alt := range alternates {
			if alt == candidate {
				ordered = append(ordered, candidate)
				break
			}
		}
	}
	var buf bytes.Buffer
	buf.WriteString("        <div class=\"site-locale-switch\" data-site-locale-switch>\n")
	for _, alt := range ordered {
		var href, aria string
		switch {
		case alt == locale && alt == "en":
			href = "../../"
		case alt == locale && alt == "it":
			href = "../../"
		case alt == "en" && locale == "it":
			href = "../../../work/" + slug + "/"
		case alt == "it" && locale == "en":
			href = "../../it/work/" + slug + "/"
		default:
			// Self-link for unknown locales: degrade gracefully to current page.
			href = ""
		}
		classes := "site-lang-btn"
		extras := ""
		if alt == locale {
			classes += " is-active"
			extras = ` aria-current="page"`
			aria = "Site language: " + strings.ToUpper(alt)
			if alt == "it" {
				aria = "Lingua del sito: italiano"
			}
		} else {
			if alt == "en" {
				aria = "Switch site language to English"
			} else if alt == "it" {
				aria = "Cambia lingua del sito in italiano"
			} else {
				aria = "Switch site language"
			}
		}
		buf.WriteString("            <a href=\"" + href + "\" class=\"" + classes + "\" data-site-lang=\"" + alt + "\" hreflang=\"" + alt + "\"" + extras + " aria-label=\"" + escapeHTML(aria) + "\">" + strings.ToUpper(alt) + "</a>\n")
	}
	buf.WriteString("        </div>\n")
	return buf.Bytes()
}

// renderHreflangLinks emits the reciprocal hreflang/x-default links for a
// case-study page. Only locales that have a generated counterpart are emitted.
// English is always self-canonical; x-default always points at English.
func renderHreflangLinks(slug, locale string, alternates []string) string {
	var b strings.Builder
	enURL := localeCaseStudyCanonicalURL("en", slug)
	enPresent := false
	for _, alt := range alternates {
		if alt == "en" {
			enPresent = true
			break
		}
	}
	if !enPresent {
		alternates = append([]string{"en"}, alternates...)
	}
	for _, alt := range alternates {
		altURL := localeCaseStudyCanonicalURL(alt, slug)
		b.WriteString("    <link rel=\"alternate\" hreflang=\"" + alt + "\" href=\"" + escapeHTML(altURL) + "\">\n")
	}
	b.WriteString("    <link rel=\"alternate\" hreflang=\"x-default\" href=\"" + escapeHTML(enURL) + "\">\n")
	_ = locale
	return b.String()
}

// ogLocaleFor maps a BCP-47 language tag to the og:locale form Facebook expects.
func ogLocaleFor(locale string) string {
	switch locale {
	case "it":
		return "it_IT"
	case "en":
		return "en_US"
	default:
		return locale
	}
}

func localeBlogIndexPath(locale string) string {
	if locale == "it" {
		return "blog/"
	}
	return "blog/en/"
}

func localeBlogPostPath(locale, slug string) string {
	if locale == "it" {
		return "blog/posts/" + slug + "/"
	}
	return "blog/en/posts/" + slug + "/"
}

// navLabel returns a localized string for a small fixed set of UI/SEO labels
// rendered by the case-study template. Falls back to English if the locale is
// not configured.
func navLabel(locale, key string) string {
	en := map[string]string{
		"primary":                    "Primary navigation",
		"work":                       "Work",
		"blog":                       "Blog",
		"open_source":                "Open Source",
		"papers":                     "Papers",
		"contact":                    "Contact",
		"toggle_theme":               "Toggle color theme",
		"case_study_eyebrow":         "Case Study",
		"section_fallback":           "Section",
		"open_default":               "Open",
		"proof_metrics_title":        "Proof metrics",
		"proof_metrics_intro":        "Concrete public proof, attached to this project rather than pushed into the graph.",
		"operational_signals_title":  "Operational signals",
		"operational_signals_intro":  "Workflow and runtime signals that belong next to the system they describe.",
		"action_repository":          "Repository",
		"action_related_article":     "Related article",
		"back_to_workbench":          "Back to workbench",
		"diagrams_label":             "Diagrams",
		"open_full_size":             "Open full size",
		"system_anatomy_label":       "System anatomy",
		"system_anatomy_inputs":      "Inputs",
		"system_anatomy_core":        "Core",
		"system_anatomy_outputs":     "Outputs",
		"system_anatomy_constraints": "Constraints",
		"case_study_navigation":      "Case study navigation",
		"dataset_eyebrow":            "Public dataset",
		"dataset_snapshot":           "Snapshot",
		"dataset_updated":            "Updated",
		"dataset_hosted_on":          "Hosted on",
		"dataset_top_portals":        "Top contributing portals",
		"dataset_more_portals":       "more portals",
		"dataset_additional":         "additional datasets",
		"dataset_open_on":            "Open on",
		"dataset_indexed":            "Datasets indexed",
		"dataset_unique":             "Unique after dedup",
		"dataset_portals":            "Open-data portals",
		"dataset_countries":          "Countries + international",
		"dataset_duplicates_suffix":  "cross-portal duplicates flagged",
	}
	it := map[string]string{
		"primary":                    "Navigazione principale",
		"work":                       "Lavori",
		"blog":                       "Blog",
		"open_source":                "Open Source",
		"papers":                     "Articoli",
		"contact":                    "Contatti",
		"toggle_theme":               "Cambia tema colore",
		"case_study_eyebrow":         "Case Study",
		"section_fallback":           "Sezione",
		"open_default":               "Apri",
		"proof_metrics_title":        "Metriche di prova",
		"proof_metrics_intro":        "Prove pubbliche e concrete, legate al progetto invece che spinte nel grafo.",
		"operational_signals_title":  "Segnali operativi",
		"operational_signals_intro":  "Segnali di workflow e runtime che restano accanto al sistema che descrivono.",
		"action_repository":          "Repository",
		"action_related_article":     "Articolo collegato",
		"back_to_workbench":          "Torna al workbench",
		"diagrams_label":             "Diagrammi",
		"open_full_size":             "Apri a tutta dimensione",
		"system_anatomy_label":       "Anatomia del sistema",
		"system_anatomy_inputs":      "Input",
		"system_anatomy_core":        "Core",
		"system_anatomy_outputs":     "Output",
		"system_anatomy_constraints": "Vincoli",
		"case_study_navigation":      "Navigazione case study",
		"dataset_eyebrow":            "Dataset pubblico",
		"dataset_snapshot":           "Snapshot",
		"dataset_updated":            "Aggiornato",
		"dataset_hosted_on":          "Su",
		"dataset_top_portals":        "Portali principali",
		"dataset_more_portals":       "altri portali",
		"dataset_additional":         "dataset aggiuntivi",
		"dataset_open_on":            "Apri su",
		"dataset_indexed":            "Dataset indicizzati",
		"dataset_unique":             "Unici dopo dedup",
		"dataset_portals":            "Portali open data",
		"dataset_countries":          "Paesi + internazionali",
		"dataset_duplicates_suffix":  "duplicati cross-portale rilevati",
	}
	if locale == "it" {
		if v, ok := it[key]; ok {
			return v
		}
	}
	return en[key]
}

func defaultCaseStudyTitle(locale string) string {
	if locale == "it" {
		return "Case Study"
	}
	return "Case Study"
}

func defaultCaseStudyMetaSuffix(locale string) string {
	if locale == "it" {
		return "case study."
	}
	return "case study."
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

func renderCaseStudyMediaGallery(slots []mediaSlot, locale string) []byte {
	if len(slots) == 0 {
		return nil
	}
	rootRel := localeRoot(locale)
	openFullSize := navLabel(locale, "open_full_size")
	mediaFallback := "Media"
	if locale == "it" {
		mediaFallback = "Media"
	}

	var buf bytes.Buffer
	buf.WriteString("\n        <section class=\"case-gallery\" aria-label=\"" + navLabel(locale, "diagrams_label") + "\">\n")
	buf.WriteString("            <div class=\"media-slots\">\n")
	for _, slot := range slots {
		label := firstNonEmpty(slot.Label, mediaFallback)
		caption := firstNonEmpty(slot.Caption, slot.Placeholder)
		buf.WriteString("                <article class=\"media-slot\">\n")
		buf.WriteString("                    <span>" + escapeHTML(label) + "</span>\n")
		if slot.Image != "" {
			imagePath := resolveCaseStudyAssetPathFor(slot.Image, rootRel)
			altText := firstNonEmpty(slot.Alt, label)
			buf.WriteString("                    <button class=\"media-slot-trigger\" type=\"button\" aria-haspopup=\"dialog\" aria-label=\"" + openFullSize + " " + escapeHTML(label) + "\" data-media-src=\"" + escapeHTML(imagePath) + "\" data-media-alt=\"" + escapeHTML(altText) + "\" data-media-label=\"" + escapeHTML(label) + "\" data-media-caption=\"" + escapeHTML(caption) + "\">\n")
			buf.WriteString("                        <figure class=\"media-slot-figure\">\n")
			buf.WriteString("                            <img src=\"" + escapeHTML(imagePath) + "\" alt=\"" + escapeHTML(altText) + "\" loading=\"lazy\">\n")
			buf.WriteString("                        </figure>\n")
			buf.WriteString("                        <span class=\"media-slot-hint\">" + openFullSize + "</span>\n")
			buf.WriteString("                    </button>\n")
		}
		if caption != "" {
			buf.WriteString("                    <p>" + escapeHTML(caption) + "</p>\n")
		}
		buf.WriteString("                </article>\n")
	}
	buf.WriteString("            </div>\n")
	buf.WriteString("        </section>\n\n")
	return buf.Bytes()
}

func renderCaseStudyDatasets(items []schema.DatasetItemV1, locale string) []byte {
	if len(items) == 0 {
		return nil
	}

	var buf bytes.Buffer
	for _, item := range items {
		buf.Write(renderCaseStudyDataset(item, locale))
	}
	return buf.Bytes()
}

func renderCaseStudyDataset(item schema.DatasetItemV1, locale string) []byte {
	var buf bytes.Buffer
	datasetSuffix := "dataset"
	if locale == "it" {
		datasetSuffix = "dataset"
	}
	buf.WriteString("        <section class=\"case-dataset\" aria-label=\"" + escapeHTML(item.DisplayName+" "+datasetSuffix) + "\">\n")
	buf.WriteString("            <header class=\"case-dataset-header\">\n")
	buf.WriteString("                <p class=\"eyebrow\">" + navLabel(locale, "dataset_eyebrow") + "</p>\n")
	buf.WriteString("                <h2 class=\"case-dataset-title\">" + escapeHTML(item.DisplayName) + "</h2>\n")
	buf.WriteString("                <p class=\"case-dataset-meta\">\n")
	if strings.TrimSpace(item.License) != "" {
		buf.WriteString("                    <span class=\"case-dataset-badge\">" + escapeHTML(item.License) + "</span>\n")
	}
	if strings.TrimSpace(item.SnapshotDate) != "" {
		buf.WriteString("                    <span class=\"case-dataset-meta-item\">" + navLabel(locale, "dataset_snapshot") + " " + escapeHTML(item.SnapshotDate) + "</span>\n")
	} else if strings.TrimSpace(item.LastModified) != "" {
		buf.WriteString("                    <span class=\"case-dataset-meta-item\">" + navLabel(locale, "dataset_updated") + " " + escapeHTML(formatDateOnly(item.LastModified)) + "</span>\n")
	}
	if strings.TrimSpace(item.Provider) != "" {
		buf.WriteString("                    <span class=\"case-dataset-meta-item\">" + navLabel(locale, "dataset_hosted_on") + " " + escapeHTML(humanProviderName(item.Provider)) + "</span>\n")
	}
	buf.WriteString("                </p>\n")
	buf.WriteString("            </header>\n")

	tiles := datasetStatTiles(item, locale)
	if len(tiles) > 0 {
		buf.WriteString("            <ul class=\"case-dataset-stats\">\n")
		for _, tile := range tiles {
			buf.WriteString("                <li class=\"case-dataset-stat\">\n")
			buf.WriteString("                    <span class=\"case-dataset-stat-value\">" + escapeHTML(tile.Value) + "</span>\n")
			buf.WriteString("                    <span class=\"case-dataset-stat-label\">" + escapeHTML(tile.Label) + "</span>\n")
			if tile.Detail != "" {
				buf.WriteString("                    <span class=\"case-dataset-stat-detail\">" + escapeHTML(tile.Detail) + "</span>\n")
			}
			buf.WriteString("                </li>\n")
		}
		buf.WriteString("            </ul>\n")
	}

	if len(item.Sources) > 0 {
		topSources, otherCount, otherTotal := topDatasetSources(item.Sources, 6)
		maxCount := topSources[0].Count
		buf.WriteString("            <div class=\"case-dataset-sources\">\n")
		buf.WriteString("                <p class=\"case-dataset-sources-kicker\">" + navLabel(locale, "dataset_top_portals") + "</p>\n")
		buf.WriteString("                <ol class=\"case-dataset-bars\">\n")
		for _, src := range topSources {
			percent := 0
			if maxCount > 0 {
				percent = int(float64(src.Count) / float64(maxCount) * 100.0)
			}
			if percent < 4 {
				percent = 4
			}
			buf.WriteString("                    <li class=\"case-dataset-bar\">\n")
			buf.WriteString("                        <span class=\"case-dataset-bar-name\">" + escapeHTML(humanPortalName(src.Name)) + "</span>\n")
			buf.WriteString("                        <span class=\"case-dataset-bar-track\"><span class=\"case-dataset-bar-fill\" style=\"width: " + fmt.Sprintf("%d", percent) + "%;\"></span></span>\n")
			buf.WriteString("                        <span class=\"case-dataset-bar-count\">" + escapeHTML(formatCompactInt(src.Count)) + "</span>\n")
			buf.WriteString("                    </li>\n")
		}
		buf.WriteString("                </ol>\n")
		if otherCount > 0 {
			buf.WriteString("                <p class=\"case-dataset-sources-tail\">+ " + fmt.Sprintf("%d", otherCount) + " " + navLabel(locale, "dataset_more_portals") + " · " + escapeHTML(formatCompactInt(otherTotal)) + " " + navLabel(locale, "dataset_additional") + "</p>\n")
		}
		buf.WriteString("            </div>\n")
	}

	if strings.TrimSpace(item.URL) != "" {
		buf.WriteString("            <p class=\"case-dataset-actions\">\n")
		buf.WriteString("                <a class=\"btn btn-primary\" href=\"" + escapeHTML(item.URL) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + navLabel(locale, "dataset_open_on") + " " + escapeHTML(humanProviderName(item.Provider)) + "</a>\n")
		buf.WriteString("            </p>\n")
	}

	buf.WriteString("        </section>\n\n")
	return buf.Bytes()
}

type datasetStatTile struct {
	Value  string
	Label  string
	Detail string
}

func datasetStatTiles(item schema.DatasetItemV1, locale string) []datasetStatTile {
	tiles := make([]datasetStatTile, 0, 4)
	if item.TotalRecords != nil {
		detail := ""
		if item.DuplicateRecords != nil && *item.DuplicateRecords > 0 {
			detail = formatCompactInt(*item.DuplicateRecords) + " " + navLabel(locale, "dataset_duplicates_suffix")
		}
		tiles = append(tiles, datasetStatTile{
			Value:  formatCompactInt(*item.TotalRecords),
			Label:  navLabel(locale, "dataset_indexed"),
			Detail: detail,
		})
	}
	if item.UniqueRecords != nil {
		tiles = append(tiles, datasetStatTile{
			Value: formatCompactInt(*item.UniqueRecords),
			Label: navLabel(locale, "dataset_unique"),
		})
	}
	if item.SourceCount != nil {
		tiles = append(tiles, datasetStatTile{
			Value: fmt.Sprintf("%d", *item.SourceCount),
			Label: navLabel(locale, "dataset_portals"),
		})
	}
	if item.CountryCount != nil {
		tiles = append(tiles, datasetStatTile{
			Value: fmt.Sprintf("%d", *item.CountryCount),
			Label: navLabel(locale, "dataset_countries"),
		})
	}
	return tiles
}

func topDatasetSources(sources []schema.DatasetSourceV1, limit int) ([]schema.DatasetSourceV1, int, int) {
	if limit <= 0 || len(sources) <= limit {
		return sources, 0, 0
	}
	top := sources[:limit]
	tail := sources[limit:]
	tailTotal := 0
	for _, src := range tail {
		tailTotal += src.Count
	}
	return top, len(tail), tailTotal
}

func humanPortalName(name string) string {
	value := strings.TrimSpace(name)
	if value == "" {
		return "portal"
	}
	switch strings.ToLower(value) {
	case "us-federal":
		return "data.gov (US federal)"
	case "australia":
		return "data.gov.au"
	case "france":
		return "data.gouv.fr"
	case "dati-gov-it":
		return "dati.gov.it"
	case "canada":
		return "open.canada.ca"
	case "ukraine":
		return "data.gov.ua"
	case "hdx":
		return "Humanitarian Data Exchange"
	case "nrw":
		return "Open.NRW (Germany)"
	case "ireland":
		return "data.gov.ie"
	case "switzerland":
		return "opendata.swiss"
	}
	return value
}

func humanProviderName(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "huggingface":
		return "Hugging Face"
	default:
		return firstNonEmpty(strings.TrimSpace(provider), "provider")
	}
}

func formatDateOnly(value string) string {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return value
	}
	return parsed.UTC().Format("2006-01-02")
}

// renderSystemAnatomy emits the "what this system is" block as a pipeline-flow
// diagram: Inputs → Core → Outputs as 3 horizontal stages, with Constraints as
// a footer rail. Empty stages are skipped; the chevron between stages is purely
// presentational (CSS ::after) so the omission is invisible. Returns nil when
// the case study omits systemAnatomy entirely.
func renderSystemAnatomy(anatomy *systemAnatomy, locale string) []byte {
	if anatomy == nil {
		return nil
	}
	stages := []struct {
		key   string
		label string
		items []string
	}{
		{"inputs", navLabel(locale, "system_anatomy_inputs"), anatomy.Inputs},
		{"core", navLabel(locale, "system_anatomy_core"), anatomy.Core},
		{"outputs", navLabel(locale, "system_anatomy_outputs"), anatomy.Outputs},
	}

	hasStage := false
	for _, stage := range stages {
		if len(stage.items) > 0 {
			hasStage = true
			break
		}
	}
	if !hasStage && len(anatomy.Constraints) == 0 {
		return nil
	}

	var buf bytes.Buffer
	buf.WriteString("        <section class=\"system-anatomy\" aria-label=\"" + navLabel(locale, "system_anatomy_label") + "\">\n")
	buf.WriteString("            <p class=\"eyebrow\">" + navLabel(locale, "system_anatomy_label") + "</p>\n")
	if hasStage {
		buf.WriteString("            <ol class=\"system-flow\">\n")
		for _, stage := range stages {
			if len(stage.items) == 0 {
				continue
			}
			buf.WriteString("                <li class=\"system-flow-stage\" data-stage=\"" + stage.key + "\">\n")
			buf.WriteString("                    <p class=\"system-flow-stage-label\">" + escapeHTML(stage.label) + "</p>\n")
			buf.WriteString("                    <ul class=\"system-flow-stage-items\">\n")
			for _, item := range stage.items {
				buf.WriteString("                        <li>" + escapeHTML(item) + "</li>\n")
			}
			buf.WriteString("                    </ul>\n")
			buf.WriteString("                </li>\n")
		}
		buf.WriteString("            </ol>\n")
	}
	if len(anatomy.Constraints) > 0 {
		buf.WriteString("            <div class=\"system-flow-rail\">\n")
		buf.WriteString("                <span class=\"system-flow-rail-label\">" + navLabel(locale, "system_anatomy_constraints") + "</span>\n")
		buf.WriteString("                <ul class=\"system-flow-rail-chips\">\n")
		for _, item := range anatomy.Constraints {
			buf.WriteString("                    <li>" + escapeHTML(item) + "</li>\n")
		}
		buf.WriteString("                </ul>\n")
		buf.WriteString("            </div>\n")
	}
	buf.WriteString("        </section>\n\n")
	return buf.Bytes()
}

func renderCaseStudyNavigation(pageContext caseStudyPageContext, rootRel, locale string) []byte {
	var buf bytes.Buffer
	buf.WriteString("        <nav class=\"case-page-nav\" aria-label=\"" + navLabel(locale, "case_study_navigation") + "\">\n")
	buf.WriteString("            <a class=\"btn btn-secondary\" href=\"" + rootRel + "#workbench\">" + navLabel(locale, "back_to_workbench") + "</a>\n")

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

func renderCaseStudyCover(study caseStudy, rootRel string) []byte {
	coverImage := resolveCaseStudyAssetPathFor(study.CoverImage, rootRel)
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

func resolvedActions(study caseStudy, locale, rootRel string) []caseStudyAction {
	if len(study.Actions) > 0 {
		actions := make([]caseStudyAction, len(study.Actions))
		copy(actions, study.Actions)
		for i := range actions {
			actions[i].URL = resolveCaseStudyAssetPathFor(actions[i].URL, rootRel)
			actions[i].URL = localizeInternalURLForLocale(actions[i].URL, locale)
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
		actions = append(actions, caseStudyAction{Label: navLabel(locale, "action_repository"), URL: study.RepoURL, Style: "primary"})
	}
	if len(study.RelatedPosts) > 0 {
		style := "primary"
		if len(actions) > 0 {
			style = "secondary"
		}
		actions = append(actions, caseStudyAction{Label: navLabel(locale, "action_related_article"), URL: rootRel + localeBlogPostPath(locale, study.RelatedPosts[0]), Style: style})
	}
	return actions
}

// resolveCaseStudyAssetPath resolves an asset reference for the English page
// (two levels deep). It is kept for backward compatibility with tests; new
// callers should use resolveCaseStudyAssetPathFor with the page's rootRel.
func resolveCaseStudyAssetPath(assetPath string) string {
	return resolveCaseStudyAssetPathFor(assetPath, "../../")
}

// resolveCaseStudyAssetPathFor normalizes an asset reference for a page at the
// given rootRel prefix (e.g. "../../" for English pages, "../../../" for
// Italian pages). Inputs may use one of three legacy forms:
//   - "../../..."   : authored already two-levels-up from work/<slug>/
//   - "../blog/..." : authored relative to work/ (one level up)
//   - "blog/..."    : authored from the case-study directory
//
// External URLs and already-resolved paths pass through unchanged when the
// English depth is preserved, but are rewritten to the page's rootRel
// otherwise so /it/work/<slug>/ pages resolve to the same site assets.
func resolveCaseStudyAssetPathFor(assetPath, rootRel string) string {
	if assetPath == "" {
		return ""
	}
	if isExternalURL(assetPath) {
		return assetPath
	}
	const enRoot = "../../"
	// Normalize the input to a root-relative form first.
	rootRelative := ""
	switch {
	case strings.HasPrefix(assetPath, enRoot):
		rootRelative = strings.TrimPrefix(assetPath, enRoot)
	case strings.HasPrefix(assetPath, "../blog/"):
		rootRelative = strings.TrimPrefix(assetPath, "../")
	case strings.HasPrefix(assetPath, "blog/"):
		rootRelative = assetPath
	default:
		// Unknown form: pass through unchanged.
		return assetPath
	}
	return rootRel + rootRelative
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

func caseStudyStructuredData(study caseStudy, locale, displayTitle, metaDescription, canonicalURL, socialImageURL string, lastmod time.Time) string {
	if strings.TrimSpace(locale) == "" {
		locale = "en"
	}
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
		"inLanguage":       locale,
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
	relatedLinks := relatedBlogPostPermalinks(study.RelatedPosts, locale)
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

func relatedBlogPostPermalinks(slugs []string, locale string) []string {
	links := make([]string, 0, len(slugs))
	for _, slug := range normalizedStrings(slugs) {
		if isExternalURL(slug) {
			links = append(links, localizeInternalURLForLocale(slug, locale))
			continue
		}
		links = append(links, publicSiteBaseURL+"/"+localeBlogPostPath(locale, strings.Trim(slug, "/")))
	}
	return links
}

func localizeInternalURLForLocale(value, locale string) string {
	if locale != "it" {
		return value
	}
	publicEnglishBlogPrefix := publicSiteBaseURL + "/blog/en/posts/"
	if strings.HasPrefix(value, publicEnglishBlogPrefix) {
		return publicSiteBaseURL + "/blog/posts/" + strings.TrimPrefix(value, publicEnglishBlogPrefix)
	}
	if isExternalURL(value) {
		return value
	}
	return strings.Replace(value, "blog/en/posts/", "blog/posts/", 1)
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
