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
)

type caseStudiesPayload struct {
	Items []caseStudy `json:"items"`
}

type caseStudy struct {
	Slug            string             `json:"slug"`
	Title           string             `json:"title"`
	Subtitle        string             `json:"subtitle"`
	Summary         string             `json:"summary"`
	MetaDescription string             `json:"metaDescription"`
	Status          string             `json:"status"`
	RepoURL         string             `json:"repoUrl"`
	RelatedPosts    []string           `json:"relatedPosts"`
	CoverImage      string             `json:"coverImage"`
	CoverAlt        string             `json:"coverAlt"`
	CoverEyebrow    string             `json:"coverEyebrow"`
	CoverTitle      string             `json:"coverTitle"`
	CoverText       string             `json:"coverText"`
	Stack           []string           `json:"stack"`
	Actions         []caseStudyAction  `json:"actions"`
	MediaSlots      []mediaSlot        `json:"mediaSlots"`
	Sections        []caseStudySection `json:"sections"`
}

type caseStudyAction struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Style string `json:"style"`
}

type mediaSlot struct {
	Label       string `json:"label"`
	Kind        string `json:"kind"`
	Placeholder string `json:"placeholder"`
}

type caseStudySection struct {
	Heading string `json:"heading"`
	Body    string `json:"body"`
}

func GenerateCaseStudyPages(repoRoot string) error {
	caseStudiesPath := filepath.Join(repoRoot, "assets", "data", "case-studies.json")
	workDir := filepath.Join(repoRoot, "work")

	raw, err := os.ReadFile(caseStudiesPath)
	if err != nil {
		return fmt.Errorf("read case studies: %w", err)
	}

	var payload caseStudiesPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return fmt.Errorf("decode case studies: %w", err)
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

	for _, study := range payload.Items {
		outputDir := filepath.Join(workDir, study.Slug)
		if err := os.MkdirAll(outputDir, 0o755); err != nil {
			return fmt.Errorf("create %s: %w", outputDir, err)
		}
		if err := os.WriteFile(filepath.Join(outputDir, "index.html"), renderCaseStudyPage(study), 0o644); err != nil {
			return fmt.Errorf("write case study page for %s: %w", study.Slug, err)
		}
	}

	return nil
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

func renderCaseStudyPage(study caseStudy) []byte {
	title := firstNonEmpty(study.Title, study.Slug, "Case Study")
	metaDescription := firstNonEmpty(study.MetaDescription, study.Summary, study.Subtitle, title+" case study.")
	cover := renderCaseStudyCover(study)
	actions := resolvedActions(study)

	var buf bytes.Buffer
	buf.WriteString("<!-- Generated from assets/data/case-studies.json by cmd/harvester. Do not edit directly. -->\n")
	buf.WriteString("<!DOCTYPE html>\n<html lang=\"en\" data-theme=\"light\">\n<head>\n")
	buf.WriteString("    <meta charset=\"UTF-8\">\n")
	buf.WriteString("    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\">\n")
	buf.WriteString("    <title>" + escapeHTML(title) + " | Andrea Bozzo</title>\n")
	buf.WriteString("    <meta name=\"description\" content=\"" + escapeHTML(metaDescription) + "\">\n")
	buf.WriteString("    <meta name=\"theme-color\" content=\"#f5efe2\">\n")
	buf.WriteString("    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n")
	buf.WriteString("    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n")
	buf.WriteString("    <link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap\" rel=\"stylesheet\">\n")
	buf.WriteString("    <link rel=\"stylesheet\" href=\"../../assets/styles.min.css\">\n")
	buf.WriteString("    <script>\n        (function() {\n            const savedTheme = localStorage.getItem('theme') || 'light';\n            document.documentElement.setAttribute('data-theme', savedTheme);\n        })();\n    </script>\n")
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
	buf.WriteString("        <button class=\"theme-toggle\" type=\"button\" onclick=\"toggleTheme()\" aria-label=\"Toggle color theme\">\n")
	buf.WriteString("            <span class=\"theme-toggle-icon\" id=\"theme-icon\">☀️</span>\n")
	buf.WriteString("        </button>\n")
	buf.WriteString("    </header>\n\n")
	buf.WriteString("    <main class=\"content-wrapper case-study-page\">\n")
	buf.WriteString("        <section class=\"case-hero\">\n")
	buf.WriteString("            <div class=\"case-hero-copy\">\n")
	buf.WriteString("                <p class=\"eyebrow\">Case Study</p>\n")
	buf.WriteString("                <h1 class=\"title\">" + escapeHTML(title) + "</h1>\n")
	buf.WriteString("                <p class=\"subtitle\">" + escapeHTML(firstNonEmpty(study.Subtitle, study.Summary)) + "</p>\n")
	buf.WriteString("                <div class=\"case-meta\">\n")
	if study.Status != "" {
		buf.WriteString("                    <span class=\"case-meta-status\">" + escapeHTML(study.Status) + "</span>\n")
	}
	for _, item := range study.Stack {
		buf.WriteString("                    <span>" + escapeHTML(item) + "</span>\n")
	}
	buf.WriteString("                </div>\n")
	buf.Write(cover)
	buf.WriteString("        </section>\n\n")
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
	if len(study.MediaSlots) > 0 {
		buf.WriteString("\n                <div class=\"media-slots\">\n")
		for _, slot := range study.MediaSlots {
			buf.WriteString("                    <article class=\"media-slot\">\n")
			buf.WriteString("                        <span>" + escapeHTML(firstNonEmpty(slot.Label, "Placeholder")) + "</span>\n")
			buf.WriteString("                        <p>" + escapeHTML(slot.Placeholder) + "</p>\n")
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

func renderCaseStudyCover(study caseStudy) []byte {
	coverImage := resolveCoverImagePath(study.CoverImage)
	if coverImage != "" {
		return []byte(
			"            <figure class=\"case-cover\">\n" +
				"                <img src=\"" + escapeHTML(coverImage) + "\" alt=\"" + escapeHTML(firstNonEmpty(study.CoverAlt, firstNonEmpty(study.Title, study.Slug, "Case study")+" cover art")) + "\">\n" +
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

func resolveCoverImagePath(coverImage string) string {
	switch {
	case coverImage == "":
		return ""
	case isExternalURL(coverImage):
		return coverImage
	case strings.HasPrefix(coverImage, "../../"):
		return coverImage
	case strings.HasPrefix(coverImage, "../blog/"):
		return "../" + coverImage
	case strings.HasPrefix(coverImage, "blog/"):
		return "../../" + coverImage
	default:
		return coverImage
	}
}

func isExternalURL(value string) bool {
	return strings.HasPrefix(strings.ToLower(value), "http://") || strings.HasPrefix(strings.ToLower(value), "https://")
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
