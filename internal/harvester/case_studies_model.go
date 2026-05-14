package harvester

import (
	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
	"strings"
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
