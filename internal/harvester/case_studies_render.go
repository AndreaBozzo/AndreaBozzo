package harvester

import (
	"bytes"
	"time"
)

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
