package harvester

import (
	"encoding/json"
	"strings"
	"time"
)

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
