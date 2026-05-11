package harvester

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strings"
)

func GenerateRootSEOArtifacts(repoRoot string) error {
	caseStudiesPath := filepath.Join(repoRoot, "assets", "data", "case-studies.json")
	payload, err := loadCaseStudiesPayload(caseStudiesPath)
	if err != nil {
		return err
	}

	if err := os.WriteFile(filepath.Join(repoRoot, "robots.txt"), renderRootRobotsTxt(), 0o644); err != nil {
		return fmt.Errorf("write robots.txt: %w", err)
	}
	if err := os.WriteFile(filepath.Join(repoRoot, "sitemap.xml"), renderRootSitemap(payload.Items), 0o644); err != nil {
		return fmt.Errorf("write sitemap.xml: %w", err)
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
	return []byte("User-agent: *\nAllow: /\n\nSitemap: " + publicSiteBaseURL + "/sitemap.xml\nSitemap: " + publicSiteBaseURL + "/blog/sitemap.xml\n")
}

func renderRootSitemap(items []caseStudy) []byte {
	urls := []string{
		publicSiteBaseURL + "/",
		publicSiteBaseURL + "/blog/",
	}
	for _, study := range items {
		if strings.TrimSpace(study.Slug) == "" {
			continue
		}
		urls = append(urls, caseStudyCanonicalURL(study.Slug))
	}

	var buf bytes.Buffer
	buf.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	buf.WriteString("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
	for _, url := range urls {
		buf.WriteString("  <url><loc>" + html.EscapeString(url) + "</loc></url>\n")
	}
	buf.WriteString("</urlset>\n")
	return buf.Bytes()
}
