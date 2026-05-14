package harvester

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

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
