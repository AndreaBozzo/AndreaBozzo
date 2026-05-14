package harvester

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SEO architecture
//
// The site has two content domains — the root pages (homepage + case studies)
// and the Hugo-built blog. To keep crawlers from missing either, we use a
// sitemap-index pattern:
//
//   /sitemap.xml          (sitemap index, generated here)
//     └─ /pages-sitemap.xml      (urlset for homepage + case studies, here)
//     └─ /blog/sitemap.xml       (sitemap index produced by Hugo, fans out to it/en)
//
// robots.txt advertises only the root sitemap.xml; crawlers follow the index.

func GenerateRootSEOArtifacts(repoRoot string) error {
	caseStudiesPath := filepath.Join(repoRoot, "assets", "data", "case-studies.json")
	payload, err := loadCaseStudiesPayload(caseStudiesPath)
	if err != nil {
		return err
	}

	// Use the case-studies.json mtime as the homepage/case-studies lastmod,
	// falling back to "now" if the stat fails. This makes the sitemap reflect
	// real content changes instead of being constant across rebuilds.
	lastmod := caseStudiesLastmod(caseStudiesPath)

	if err := os.WriteFile(filepath.Join(repoRoot, "robots.txt"), renderRootRobotsTxt(), 0o644); err != nil {
		return fmt.Errorf("write robots.txt: %w", err)
	}
	if err := os.WriteFile(filepath.Join(repoRoot, "sitemap.xml"), renderSitemapIndex(lastmod), 0o644); err != nil {
		return fmt.Errorf("write sitemap.xml: %w", err)
	}
	if err := os.WriteFile(filepath.Join(repoRoot, "pages-sitemap.xml"), renderPagesSitemap(payload.Items, lastmod, repoRoot), 0o644); err != nil {
		return fmt.Errorf("write pages-sitemap.xml: %w", err)
	}

	return nil
}

func loadCaseStudiesPayload(caseStudiesPath string) (caseStudiesPayload, error) {
	raw, err := os.ReadFile(caseStudiesPath)
	if err != nil {
		return caseStudiesPayload{}, fmt.Errorf("read case studies: %w", err)
	}

	var payload caseStudiesPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return caseStudiesPayload{}, fmt.Errorf("decode case studies: %w", err)
	}

	return payload, nil
}

func renderRootRobotsTxt() []byte {
	return []byte("User-agent: *\nAllow: /\n\nSitemap: " + publicSiteBaseURL + "/sitemap.xml\n")
}

// renderSitemapIndex emits the top-level <sitemapindex> that fans out to the
// pages sitemap (root-owned) and the Hugo blog sitemap (Hugo-owned).
func renderSitemapIndex(lastmod time.Time) []byte {
	stamp := lastmod.Format(time.RFC3339)
	entries := []struct {
		loc string
	}{
		{publicSiteBaseURL + "/pages-sitemap.xml"},
		{publicSiteBaseURL + "/blog/sitemap.xml"},
	}

	var buf bytes.Buffer
	buf.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	buf.WriteString("<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
	for _, entry := range entries {
		buf.WriteString("  <sitemap>\n")
		buf.WriteString("    <loc>" + html.EscapeString(entry.loc) + "</loc>\n")
		buf.WriteString("    <lastmod>" + stamp + "</lastmod>\n")
		buf.WriteString("  </sitemap>\n")
	}
	buf.WriteString("</sitemapindex>\n")
	return buf.Bytes()
}

// hasItalianRootHomepage reports whether a hand-authored it/index.html exists
// at the repo root. Used by the sitemap to advertise /it/ only when the page
// is actually shipped.
func hasItalianRootHomepage(repoRoot string) bool {
	_, err := os.Stat(filepath.Join(repoRoot, "it", "index.html"))
	return err == nil
}

// renderPagesSitemap emits the urlset covering the homepage and every case
// study, each tagged with lastmod so crawlers know when to recrawl.
func renderPagesSitemap(items []caseStudy, lastmod time.Time, repoRoot string) []byte {
	stamp := lastmod.Format(time.RFC3339)

	type entry struct {
		loc        string
		changefreq string
		priority   string
	}
	entries := []entry{
		{publicSiteBaseURL + "/", "weekly", "1.0"},
	}
	// Localized homepage roots. Only listed when an it/index.html exists; the
	// sitemap should never advertise a page that has not been authored.
	if hasItalianRootHomepage(repoRoot) {
		entries = append(entries, entry{
			loc:        publicSiteBaseURL + "/it/",
			changefreq: "weekly",
			priority:   "0.9",
		})
	}
	for _, study := range items {
		if strings.TrimSpace(study.Slug) == "" {
			continue
		}
		entries = append(entries, entry{
			loc:        localeCaseStudyCanonicalURL("en", study.Slug),
			changefreq: "monthly",
			priority:   "0.8",
		})
		for _, locale := range supportedLocales {
			if !localeIsAlternate(locale) {
				continue
			}
			if !hasIndexableTranslation(study, locale) {
				continue
			}
			entries = append(entries, entry{
				loc:        localeCaseStudyCanonicalURL(locale, study.Slug),
				changefreq: "monthly",
				priority:   "0.7",
			})
		}
	}

	var buf bytes.Buffer
	buf.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	buf.WriteString("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
	for _, e := range entries {
		buf.WriteString("  <url>\n")
		buf.WriteString("    <loc>" + html.EscapeString(e.loc) + "</loc>\n")
		buf.WriteString("    <lastmod>" + stamp + "</lastmod>\n")
		buf.WriteString("    <changefreq>" + e.changefreq + "</changefreq>\n")
		buf.WriteString("    <priority>" + e.priority + "</priority>\n")
		buf.WriteString("  </url>\n")
	}
	buf.WriteString("</urlset>\n")
	return buf.Bytes()
}
