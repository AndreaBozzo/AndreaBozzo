package harvester

import (
	"bytes"
	"path/filepath"
	"strings"
)

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
