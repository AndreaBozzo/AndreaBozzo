package harvester

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

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

func caseStudiesLastmod(caseStudiesPath string) time.Time {
	if epoch := strings.TrimSpace(os.Getenv("SOURCE_DATE_EPOCH")); epoch != "" {
		if seconds, err := strconv.ParseInt(epoch, 10, 64); err == nil {
			return time.Unix(seconds, 0).UTC()
		}
	}

	if stamp, ok := gitLastModified(caseStudiesPath); ok {
		return stamp
	}

	if info, err := os.Stat(caseStudiesPath); err == nil {
		return info.ModTime().UTC()
	}
	return time.Now().UTC()
}

func gitLastModified(path string) (time.Time, bool) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return time.Time{}, false
	}
	dir := filepath.Dir(absPath)
	rootRaw, err := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return time.Time{}, false
	}
	repoRoot := strings.TrimSpace(string(rootRaw))
	relPath, err := filepath.Rel(repoRoot, absPath)
	if err != nil {
		return time.Time{}, false
	}
	out, err := exec.Command("git", "-C", repoRoot, "log", "-1", "--format=%ct", "--", filepath.ToSlash(relPath)).Output()
	if err != nil {
		return time.Time{}, false
	}
	seconds, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
	if err != nil || seconds <= 0 {
		return time.Time{}, false
	}
	return time.Unix(seconds, 0).UTC(), true
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
