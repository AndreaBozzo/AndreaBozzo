package harvester

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// localizationCheckResult captures the alternates declared by a single page.
type localizationCheckResult struct {
	Path       string            // relative path under siteRoot, e.g. "work/dataprof/index.html"
	Canonical  string            // <link rel="canonical">
	Alternates map[string]string // hreflang -> href (excluding x-default)
	XDefault   string            // x-default href, "" if absent
}

// ValidateLocalization walks the given site root (typically "_site") and
// verifies that every page's hreflang alternates are reciprocal and point to
// pages that actually exist. Fails the build when a page advertises a
// non-existent or non-reciprocal alternate. The release gate in
// LOCALIZATION.md treats fake alternates as a content-contract violation.
//
// Pages that emit no hreflang alternates (English-only with the standard
// self-en + x-default-en pair) are exempt from the reciprocity check; a page
// pointing only at itself is reciprocal by construction.
func ValidateLocalization(siteRoot string) error {
	results, err := collectLocalizationResults(siteRoot)
	if err != nil {
		return err
	}
	byCanonical := make(map[string]localizationCheckResult, len(results))
	for _, r := range results {
		if r.Canonical == "" {
			continue
		}
		if existing, ok := byCanonical[r.Canonical]; ok {
			return fmt.Errorf("localization check failed:\n  - %s and %s share canonical %s", existing.Path, r.Path, r.Canonical)
		}
		byCanonical[r.Canonical] = r
	}

	var problems []string
	for _, r := range results {
		if r.Canonical == "" && (len(r.Alternates) > 0 || r.XDefault != "") {
			problems = append(problems, fmt.Sprintf("%s: declares hreflang alternates but has no canonical URL", r.Path))
			continue
		}
		for lang, href := range r.Alternates {
			// Self-reference is fine.
			if href == r.Canonical {
				continue
			}
			target, ok := byCanonical[href]
			if !ok {
				problems = append(problems, fmt.Sprintf("%s: advertises hreflang=%q -> %s, but no page with that canonical was generated", r.Path, lang, href))
				continue
			}
			// Reciprocity: target must list us under some alt. We do not require
			// the same lang code on the reverse side, just that it points back.
			found := false
			for _, back := range target.Alternates {
				if back == r.Canonical {
					found = true
					break
				}
			}
			if !found {
				problems = append(problems, fmt.Sprintf("%s -> %s (hreflang=%q) is not reciprocal: %s does not advertise %s", r.Path, href, lang, target.Path, r.Canonical))
			}
		}
		if r.XDefault != "" {
			if _, ok := byCanonical[r.XDefault]; !ok {
				problems = append(problems, fmt.Sprintf("%s: x-default -> %s does not resolve to a generated page", r.Path, r.XDefault))
			}
		}
	}

	if len(problems) > 0 {
		sort.Strings(problems)
		return fmt.Errorf("localization check failed:\n  - %s", strings.Join(problems, "\n  - "))
	}
	return nil
}

func collectLocalizationResults(siteRoot string) ([]localizationCheckResult, error) {
	info, err := os.Stat(siteRoot)
	if err != nil {
		return nil, fmt.Errorf("stat site root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("site root %s is not a directory", siteRoot)
	}

	var results []localizationCheckResult
	err = filepath.WalkDir(siteRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			// Skip Hugo's own /blog/ artifacts: they emit their own translation
			// links and follow a different convention. The release gate covers
			// site-owned pages (root + case studies).
			base := d.Name()
			if base == "blog" && filepath.Dir(path) == siteRoot {
				return fs.SkipDir
			}
			return nil
		}
		if d.Name() != "index.html" {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		head := extractHTMLHead(raw)
		rel, _ := filepath.Rel(siteRoot, path)
		result := localizationCheckResult{
			Path:       filepath.ToSlash(rel),
			Canonical:  extractCanonical(head),
			Alternates: extractHreflangAlternates(head),
		}
		if x, ok := result.Alternates["x-default"]; ok {
			result.XDefault = x
			delete(result.Alternates, "x-default")
		}
		results = append(results, result)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}

var (
	linkTagRe = regexp.MustCompile(`(?is)<link\b[^>]*>`)
	attrRe    = regexp.MustCompile(`(?is)\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	headRe    = regexp.MustCompile(`(?s)<head[^>]*>(.*?)</head>`)
)

func extractHTMLHead(raw []byte) string {
	m := headRe.FindSubmatch(raw)
	if m == nil {
		return string(raw)
	}
	return string(m[1])
}

func extractCanonical(head string) string {
	for _, tag := range linkTagRe.FindAllString(head, -1) {
		attrs := parseHTMLTagAttrs(tag)
		if hasRel(attrs["rel"], "canonical") {
			return attrs["href"]
		}
	}
	return ""
}

func extractHreflangAlternates(head string) map[string]string {
	out := make(map[string]string)
	for _, tag := range linkTagRe.FindAllString(head, -1) {
		attrs := parseHTMLTagAttrs(tag)
		if !hasRel(attrs["rel"], "alternate") {
			continue
		}
		lang := strings.TrimSpace(attrs["hreflang"])
		href := strings.TrimSpace(attrs["href"])
		if lang == "" || href == "" {
			continue
		}
		out[lang] = href
	}
	return out
}

func parseHTMLTagAttrs(tag string) map[string]string {
	matches := attrRe.FindAllStringSubmatch(tag, -1)
	attrs := make(map[string]string, len(matches))
	for _, m := range matches {
		key := strings.ToLower(m[1])
		value := strings.TrimSpace(m[2])
		value = strings.Trim(value, `"'`)
		attrs[key] = value
	}
	return attrs
}

func hasRel(relValue, token string) bool {
	for _, part := range strings.Fields(strings.ToLower(relValue)) {
		if part == token {
			return true
		}
	}
	return false
}
