package harvester

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var contributionBadgePattern = regexp.MustCompile(`<a href="([^"]+)"><img src="([^"]+)"[^>]*alt="([^"]+)"/?></a>`)

// Matches the message segment of a decoded shields.io badge:
//
//	label-message-color
//
// where `-` inside label/message is escaped as `--`. We capture the stars and
// PR count from the message after the project name (the label).
//
// Example decoded source: "polars-⭐ 38.5k | 3 PR-informational?style=..."
var contributionMetricsPattern = regexp.MustCompile(`⭐\s*([^\s|]+)\s*\|\s*(\d+)\s*PR`)

type contributionDescriptionsFile struct {
	Descriptions map[string]string `json:"descriptions"`
}

func loadContributionDescriptions(repoRoot string) (map[string]string, error) {
	path := filepath.Join(repoRoot, "assets", "data", "contribution-descriptions.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read contribution descriptions: %w", err)
	}
	var payload contributionDescriptionsFile
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode contribution descriptions: %w", err)
	}
	if payload.Descriptions == nil {
		return map[string]string{}, nil
	}
	return payload.Descriptions, nil
}

type contributionJSONItem struct {
	Name  string `json:"name"`
	URL   string `json:"url"`
	Stars string `json:"stars"`
	PRs   string `json:"prs"`
	Desc  string `json:"desc"`
}

type contributionsJSONPayload struct {
	GeneratedAt string                 `json:"generatedAt"`
	Source      string                 `json:"source"`
	Items       []contributionJSONItem `json:"items"`
}

func GenerateContributionsJSON(repoRoot string) error {
	readmePath := filepath.Join(repoRoot, "README.md")
	outputPath := filepath.Join(repoRoot, "assets", "data", "contributions.json")

	readme, err := os.ReadFile(readmePath)
	if err != nil {
		return fmt.Errorf("read README.md: %w", err)
	}

	descriptions, err := loadContributionDescriptions(repoRoot)
	if err != nil {
		return err
	}

	block, err := extractBetweenMarkers(string(readme), "<!-- EXTERNAL_CONTRIBUTIONS:START -->", "<!-- EXTERNAL_CONTRIBUTIONS:END -->")
	if err != nil {
		return err
	}

	matches := contributionBadgePattern.FindAllStringSubmatch(block, -1)
	if len(matches) == 0 {
		return fmt.Errorf("no contribution badges could be parsed from README.md")
	}

	items := make([]contributionJSONItem, 0, len(matches))
	for _, match := range matches {
		badgeSource, err := decodeBadgeSource(match[2])
		if err != nil {
			return err
		}
		stars, prs := extractContributionMetrics(badgeSource)
		items = append(items, contributionJSONItem{
			Name:  match[3],
			URL:   match[1],
			Stars: stars,
			PRs:   prs,
			Desc:  contributionDescription(descriptions, match[1], match[3]),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return parseCompactNumber(items[i].Stars) > parseCompactNumber(items[j].Stars)
	})
	if len(items) > 4 {
		items = items[:4]
	}

	payload := contributionsJSONPayload{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Source:      "README.md#EXTERNAL_CONTRIBUTIONS",
		Items:       items,
	}

	return writeJSONFile(outputPath, payload)
}

func decodeBadgeSource(src string) (string, error) {
	lastSegment := src[strings.LastIndex(src, "/")+1:]
	decoded, err := url.PathUnescape(lastSegment)
	if err != nil {
		return "", fmt.Errorf("decode badge source %q: %w", src, err)
	}
	return decoded, nil
}

func contributionDescription(descriptions map[string]string, repoURL, name string) string {
	if key := repositoryKey(repoURL); key != "" {
		if desc, ok := descriptions[key]; ok {
			return desc
		}
	}
	return fmt.Sprintf("%s is one of the upstream projects where I have shipped fixes, cleanup, or implementation work.", name)
}

func repositoryKey(repoURL string) string {
	parsed, err := url.Parse(repoURL)
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 2 {
		return ""
	}
	return strings.ToLower(parts[0] + "/" + parts[1])
}

func extractContributionMetrics(badgeSource string) (string, string) {
	match := contributionMetricsPattern.FindStringSubmatch(badgeSource)
	if len(match) < 3 {
		return "0", "0"
	}
	return strings.TrimSpace(match[1]), strings.TrimSpace(match[2])
}

func parseCompactNumber(value string) float64 {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return 0
	}
	if strings.HasSuffix(normalized, "k") {
		base, err := strconv.ParseFloat(strings.TrimSuffix(normalized, "k"), 64)
		if err != nil {
			return 0
		}
		return base * 1000
	}
	parsed, err := strconv.ParseFloat(normalized, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func extractBetweenMarkers(content, startMarker, endMarker string) (string, error) {
	startIdx := strings.Index(content, startMarker)
	endIdx := strings.Index(content, endMarker)
	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return "", fmt.Errorf("markers %q and %q not found", startMarker, endMarker)
	}
	return content[startIdx+len(startMarker) : endIdx], nil
}
