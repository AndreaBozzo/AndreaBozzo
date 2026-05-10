package githubstats

import (
	"fmt"
	"html"
	"strings"
)

func BadgeForMetric(summary Summary, metric string) (Badge, error) {
	switch strings.ToLower(strings.TrimSpace(metric)) {
	case "", "stars":
		return Badge{Label: "GitHub stars", Message: compactCount(summary.TotalStars), Color: "f59e0b"}, nil
	case "repos":
		return Badge{Label: "Public repos", Message: compactCount(summary.PublicRepos), Color: "2563eb"}, nil
	case "followers":
		return Badge{Label: "Followers", Message: compactCount(summary.Followers), Color: "059669"}, nil
	case "top-repo":
		message := summary.TopRepoName
		if message == "" {
			message = "n/a"
		}
		return Badge{Label: "Top repo", Message: message, Color: "7c3aed"}, nil
	default:
		return Badge{}, fmt.Errorf("unsupported metric %q", metric)
	}
}

func RenderSVG(badge Badge) string {
	label := html.EscapeString(badge.Label)
	message := html.EscapeString(badge.Message)
	color := sanitizeColor(badge.Color)

	labelWidth := 8*len(label) + 22
	messageWidth := 8*len(message) + 22
	totalWidth := labelWidth + messageWidth

	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="20" role="img" aria-label="%s: %s"><linearGradient id="a" x2="0" y2="100%%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="%d" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="%d" height="20" fill="#374151"/><rect x="%d" width="%d" height="20" fill="#%s"/><rect width="%d" height="20" fill="url(#a)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="%d" y="15" fill="#010101" fill-opacity=".3">%s</text><text x="%d" y="14">%s</text><text x="%d" y="15" fill="#010101" fill-opacity=".3">%s</text><text x="%d" y="14">%s</text></g></svg>`, totalWidth, label, message, totalWidth, labelWidth, labelWidth, messageWidth, color, totalWidth, labelWidth/2, label, labelWidth/2, label, labelWidth+messageWidth/2, message, labelWidth+messageWidth/2, message)
}

func compactCount(value int) string {
	if value >= 1000 {
		return fmt.Sprintf("%.1fk", float64(value)/1000)
	}
	return fmt.Sprintf("%d", value)
}

func sanitizeColor(value string) string {
	trimmed := strings.TrimPrefix(strings.TrimSpace(value), "#")
	if len(trimmed) != 6 {
		return "2563eb"
	}
	for _, ch := range trimmed {
		if !strings.ContainsRune("0123456789abcdefABCDEF", ch) {
			return "2563eb"
		}
	}
	return trimmed
}
