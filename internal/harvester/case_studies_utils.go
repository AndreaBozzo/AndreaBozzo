package harvester

import (
	"html"
	"strings"
)

func stackMentions(stack []string) []map[string]string {
	mentions := make([]map[string]string, 0, len(stack))
	for _, name := range stack {
		mentions = append(mentions, map[string]string{
			"@type": "Thing",
			"name":  name,
		})
	}
	return mentions
}

func normalizedStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
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
	return slugs
}
