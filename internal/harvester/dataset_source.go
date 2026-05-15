package harvester

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

const defaultHuggingFaceAPIBase = "https://huggingface.co/api"
const defaultHuggingFaceRawBase = "https://huggingface.co/datasets"

type DatasetSource struct {
	RepoRoot       string
	HTTPClient     *http.Client
	HuggingFaceAPI string
	HuggingFaceRaw string
}

type datasetSourcesConfig struct {
	SchemaVersion string                `json:"$schemaVersion"`
	Datasets      []datasetSourceConfig `json:"datasets"`
}

type datasetSourceConfig struct {
	Provider           string   `json:"provider"`
	Slug               string   `json:"slug"`
	DisplayName        string   `json:"displayName"`
	MetadataPath       string   `json:"metadataPath"`
	RelatedCaseStudies []string `json:"relatedCaseStudies"`
}

type huggingFaceDatasetResponse struct {
	ID           string   `json:"id"`
	Author       string   `json:"author"`
	LastModified string   `json:"lastModified"`
	Downloads    int      `json:"downloads"`
	Likes        int      `json:"likes"`
	Tags         []string `json:"tags"`
	Description  string   `json:"description"`
	CardData     struct {
		License    any      `json:"license"`
		Language   []string `json:"language"`
		Tags       []string `json:"tags"`
		PrettyName string   `json:"pretty_name"`
	} `json:"cardData"`
}

type ceresOpenDataMetadata struct {
	TotalExported   int                   `json:"total_exported"`
	TotalFiltered   int                   `json:"total_filtered"`
	TotalDuplicates int                   `json:"total_duplicates"`
	Portals         []ceresOpenDataPortal `json:"portals"`
	SnapshotDate    string                `json:"snapshot_date"`
}

type ceresOpenDataPortal struct {
	Name  string `json:"name"`
	URL   string `json:"url"`
	Count int    `json:"count"`
}

func (source DatasetSource) Name() string {
	return "datasets"
}

func (source DatasetSource) OutputPath(repoRoot string) string {
	return datasetOutputPath(repoRoot)
}

func (source DatasetSource) Fetch(ctx context.Context) (any, error) {
	config, err := loadDatasetSourcesConfig(source.RepoRoot)
	if err != nil {
		return nil, err
	}

	items := make([]schema.DatasetItemV1, 0, len(config.Datasets))
	for _, configured := range config.Datasets {
		if !strings.EqualFold(strings.TrimSpace(configured.Provider), "huggingface") {
			return nil, fmt.Errorf("unsupported dataset provider %q for %s", configured.Provider, configured.Slug)
		}
		item, err := source.fetchHuggingFaceDataset(ctx, configured)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})

	return schema.DatasetIndexV1{
		SchemaVersion: schema.VersionV1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        "assets/data/dataset-sources.json",
		Items:         items,
	}, nil
}

func GenerateDatasetIndex(ctx context.Context, repoRoot string) error {
	return RunSource(ctx, repoRoot, DatasetSource{RepoRoot: repoRoot})
}

func loadDatasetSourcesConfig(repoRoot string) (datasetSourcesConfig, error) {
	configPath := filepath.Join(repoRoot, "assets", "data", "dataset-sources.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return datasetSourcesConfig{}, fmt.Errorf("read dataset source config: %w", err)
	}

	var config datasetSourcesConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return datasetSourcesConfig{}, fmt.Errorf("decode dataset source config: %w", err)
	}
	return config, nil
}

func (source DatasetSource) fetchHuggingFaceDataset(ctx context.Context, configured datasetSourceConfig) (schema.DatasetItemV1, error) {
	apiBase := firstNonEmpty(source.HuggingFaceAPI, defaultHuggingFaceAPIBase)
	rawBase := firstNonEmpty(source.HuggingFaceRaw, defaultHuggingFaceRawBase)

	apiURL := strings.TrimRight(apiBase, "/") + "/datasets/" + configured.Slug
	var apiResponse huggingFaceDatasetResponse
	if err := source.getJSON(ctx, apiURL, &apiResponse); err != nil {
		return schema.DatasetItemV1{}, fmt.Errorf("fetch Hugging Face dataset %s: %w", configured.Slug, err)
	}

	item := schema.DatasetItemV1{
		ID:                 "huggingface:" + configured.Slug,
		Provider:           "huggingface",
		Slug:               configured.Slug,
		DisplayName:        firstNonEmpty(configured.DisplayName, apiResponse.CardData.PrettyName, configured.Slug),
		URL:                "https://huggingface.co/datasets/" + configured.Slug,
		License:            normalizeHuggingFaceLicense(apiResponse.CardData.License),
		Summary:            apiResponse.Description,
		Languages:          apiResponse.CardData.Language,
		Tags:               apiResponse.CardData.Tags,
		LastModified:       normalizeRegistryTime(apiResponse.LastModified),
		RelatedCaseStudies: configured.RelatedCaseStudies,
	}
	if apiResponse.Downloads > 0 {
		downloads := apiResponse.Downloads
		item.Downloads = &downloads
	}
	if apiResponse.Likes > 0 {
		likes := apiResponse.Likes
		item.Likes = &likes
	}

	metadataPath := strings.TrimSpace(configured.MetadataPath)
	if metadataPath != "" {
		metadataURL := strings.TrimRight(rawBase, "/") + "/" + configured.Slug + "/raw/main/" + strings.TrimLeft(metadataPath, "/")
		var meta ceresOpenDataMetadata
		if err := source.getJSON(ctx, metadataURL, &meta); err != nil {
			return schema.DatasetItemV1{}, fmt.Errorf("fetch dataset metadata for %s: %w", configured.Slug, err)
		}
		applyCeresMetadata(&item, meta)
	}

	return item, nil
}

func applyCeresMetadata(item *schema.DatasetItemV1, meta ceresOpenDataMetadata) {
	if meta.TotalExported > 0 {
		total := meta.TotalExported
		item.TotalRecords = &total
		if meta.TotalDuplicates > 0 && meta.TotalDuplicates < total {
			unique := total - meta.TotalDuplicates
			item.UniqueRecords = &unique
		}
	}
	if meta.TotalDuplicates > 0 {
		dups := meta.TotalDuplicates
		item.DuplicateRecords = &dups
	}
	if meta.TotalFiltered > 0 {
		filtered := meta.TotalFiltered
		item.FilteredRecords = &filtered
	}
	if strings.TrimSpace(meta.SnapshotDate) != "" {
		item.SnapshotDate = meta.SnapshotDate
	}
	if len(meta.Portals) > 0 {
		sources := make([]schema.DatasetSourceV1, 0, len(meta.Portals))
		for _, portal := range meta.Portals {
			sources = append(sources, schema.DatasetSourceV1{
				Name:  portal.Name,
				URL:   portal.URL,
				Count: portal.Count,
			})
		}
		sort.Slice(sources, func(i, j int) bool {
			if sources[i].Count == sources[j].Count {
				return sources[i].Name < sources[j].Name
			}
			return sources[i].Count > sources[j].Count
		})
		item.Sources = sources
		count := len(sources)
		item.SourceCount = &count
		countries := countCountriesFromPortals(meta.Portals)
		if countries > 0 {
			item.CountryCount = &countries
		}
	}
}

// countCountriesFromPortals approximates the country count by mapping each
// portal URL host to a country bucket. International portals (UN OCHA, etc.)
// fall into an "international" bucket so they're still counted distinctly.
func countCountriesFromPortals(portals []ceresOpenDataPortal) int {
	hostToCountry := map[string]string{
		"catalog.data.gov":               "us",
		"data.gov.au":                    "au",
		"data.gouv.fr":                   "fr",
		"dati.gov.it":                    "it",
		"open.canada.ca":                 "ca",
		"data.gov.ua":                    "ua",
		"data.humdata.org":               "international",
		"ckan.open.nrw.de":               "de",
		"data.gov.ie":                    "ie",
		"ckan.opendata.swiss":            "ch",
		"dati.toscana.it":                "it",
		"catalog.data.metro.tokyo.lg.jp": "jp",
		"discover.data.vic.gov.au":       "au",
		"dati.regione.marche.it":         "it",
		"data.gov.ro":                    "ro",
		"catalogue.data.gov.bc.ca":       "ca",
		"dati.emilia-romagna.it":         "it",
		"opendata.aragon.es":             "es",
		"datos.gob.cl":                   "cl",
		"dati.comune.milano.it":          "it",
		"data.public.lu":                 "lu",
		"dati.puglia.it":                 "it",
		"dati.trentino.it":               "it",
		"dati.regione.umbria.it":         "it",
		"dati.lazio.it":                  "it",
		"dati.comune.roma.it":            "it",
		"dati.regione.campania.it":       "it",
		"www.opendata-hro.de":            "de",
		"dati.regione.sicilia.it":        "it",
		"dati.comune.genova.it":          "it",
		"dati.regione.liguria.it":        "it",
		"dati.comune.napoli.it":          "it",
	}
	seen := make(map[string]struct{}, len(portals))
	for _, portal := range portals {
		host := portalHost(portal.URL)
		country, ok := hostToCountry[host]
		if !ok {
			country = host
		}
		if country == "" {
			continue
		}
		seen[country] = struct{}{}
	}
	return len(seen)
}

func portalHost(rawURL string) string {
	value := strings.TrimSpace(rawURL)
	value = strings.TrimPrefix(value, "https://")
	value = strings.TrimPrefix(value, "http://")
	if idx := strings.Index(value, "/"); idx >= 0 {
		value = value[:idx]
	}
	return strings.ToLower(value)
}

func normalizeHuggingFaceLicense(raw any) string {
	switch typed := raw.(type) {
	case string:
		return typed
	case []any:
		parts := make([]string, 0, len(typed))
		for _, candidate := range typed {
			if str, ok := candidate.(string); ok && strings.TrimSpace(str) != "" {
				parts = append(parts, str)
			}
		}
		return strings.Join(parts, ", ")
	default:
		return ""
	}
}

func (source DatasetSource) getJSON(ctx context.Context, endpoint string, target any) error {
	client := source.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}

	body, err := newHTTPCache(source.RepoRoot).get("datasets", endpoint, func() ([]byte, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, fmt.Errorf("build request: %w", err)
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", registryUserAgent)

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("request %s: %w", endpoint, err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read response for %s: %w", endpoint, err)
		}
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("%s returned %d", endpoint, resp.StatusCode)
		}
		return body, nil
	})
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode response for %s: %w", endpoint, err)
	}
	return nil
}
