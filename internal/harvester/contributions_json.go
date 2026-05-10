package harvester

import (
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

var contributionDescriptions = map[string]string{
	"apache/arrow-rs":                             "Rust-side work in the Arrow ecosystem around columnar data and query plumbing.",
	"apache/datafusion":                           "Query engine fixes and improvements in the Arrow-native SQL execution stack.",
	"apache/fluss-rust":                           "Client and integration work in the Fluss streaming ecosystem.",
	"apache/iceberg-rust":                         "Rust contributions around Apache Iceberg tables, metadata, and interoperability.",
	"beelzebub-labs/beelzebub":                    "Infrastructure-facing fixes and implementation work in a production-oriented platform project.",
	"cortexflow/cortexbrain":                      "Implementation work across infrastructure and automation-oriented platform tooling.",
	"datapizza-labs/datapizza-ai":                 "Applied AI engineering work across product integrations and developer-facing features.",
	"informagico/fantavibe":                       "Targeted upstream fixes and improvements in a smaller community project.",
	"italia-opensource/awesome-italia-opensource": "Curation and contribution work supporting the Italian open source ecosystem.",
	"lakekeeper/lakekeeper":                       "Lakehouse catalog and metadata contributions around operational reliability.",
	"lance-format/lance":                          "Columnar storage and vector-data work in the Lance ecosystem.",
	"mosaico-labs/mosaico":                        "Contributions across AI workflow orchestration and open tooling.",
	"pganalyze/pg_query.rs":                       "Rust and Postgres parsing work in a low-level developer tooling library.",
	"piopy/fantacalcio-py":                        "Small but concrete fixes in a Python project with an active user base.",
	"pola-rs/polars":                              "Rust-native analytics work across DataFrame performance, ergonomics, and engine behavior.",
	"risingwavelabs/risingwave":                   "Streaming database contributions across query behavior, engine details, and developer workflow.",
	"rust-ita/rust-docs-it":                       "Community translation and upkeep work for Italian Rust documentation.",
	"supabase/etl":                                "Data ingestion and transformation contributions in a production-facing ETL stack.",
	"tokio-rs/axum":                               "Web framework contributions around routing, ergonomics, and service integration in Rust.",
	"tokio-rs/tokio":                              "Async runtime improvements around Rust concurrency, scheduling, and developer ergonomics.",
	"vakamo-labs/openfga-client":                  "Client-library fixes and interface improvements around authorization tooling.",
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
			Desc:  contributionDescription(match[1], match[3]),
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

func contributionDescription(repoURL, name string) string {
	if key := repositoryKey(repoURL); key != "" {
		if desc, ok := contributionDescriptions[key]; ok {
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
	withoutStyle := regexp.MustCompile(`-informational.*$`).ReplaceAllString(badgeSource, "")
	pieces := strings.Split(withoutStyle, "-")
	metricsSegment := ""
	if len(pieces) > 0 {
		metricsSegment = pieces[len(pieces)-1]
	}
	metricParts := strings.Split(metricsSegment, "|")
	starsPart := ""
	prsPart := ""
	if len(metricParts) > 0 {
		starsPart = strings.TrimSpace(metricParts[0])
	}
	if len(metricParts) > 1 {
		prsPart = strings.TrimSpace(metricParts[1])
	}

	stars := strings.TrimSpace(strings.TrimPrefix(starsPart, "⭐"))
	prs := strings.TrimSpace(strings.TrimSuffix(prsPart, "PR"))
	if stars == "" {
		stars = "0"
	}
	if prs == "" {
		prs = "0"
	}
	return stars, prs
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
