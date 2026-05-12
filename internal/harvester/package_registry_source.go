package harvester

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

const defaultPyPIBaseURL = "https://pypi.org"
const defaultCratesBaseURL = "https://crates.io"
const registryUserAgent = "andreabozzo-harvester (github.com/AndreaBozzo/AndreaBozzo)"

type PackageRegistrySource struct {
	RepoRoot      string
	Ecosystems    map[string]bool
	HTTPClient    *http.Client
	PyPIBaseURL   string
	CratesBaseURL string
}

type packageSourcesConfig struct {
	SchemaVersion string                `json:"$schemaVersion"`
	Packages      []packageSourceConfig `json:"packages"`
}

type packageSourceConfig struct {
	Ecosystem          string   `json:"ecosystem"`
	Name               string   `json:"name"`
	DisplayName        string   `json:"displayName"`
	RepositoryURL      string   `json:"repositoryUrl"`
	DocumentationURL   string   `json:"documentationUrl"`
	HomepageURL        string   `json:"homepageUrl"`
	RelatedCaseStudies []string `json:"relatedCaseStudies"`
}

type pypiProjectResponse struct {
	Info struct {
		Name           string            `json:"name"`
		Version        string            `json:"version"`
		Summary        string            `json:"summary"`
		ProjectURL     string            `json:"project_url"`
		PackageURL     string            `json:"package_url"`
		ReleaseURL     string            `json:"release_url"`
		HomePage       string            `json:"home_page"`
		License        string            `json:"license"`
		RequiresPython string            `json:"requires_python"`
		ProjectURLs    map[string]string `json:"project_urls"`
	} `json:"info"`
	URLs []struct {
		UploadTimeISO8601 string `json:"upload_time_iso_8601"`
	} `json:"urls"`
}

type cratesProjectResponse struct {
	Crate struct {
		Name            string `json:"name"`
		NewestVersion   string `json:"newest_version"`
		Description     string `json:"description"`
		Repository      string `json:"repository"`
		Documentation   string `json:"documentation"`
		Homepage        string `json:"homepage"`
		Downloads       int    `json:"downloads"`
		RecentDownloads int    `json:"recent_downloads"`
		UpdatedAt       string `json:"updated_at"`
	} `json:"crate"`
	Versions []struct {
		Num       string `json:"num"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
		Yanked    bool   `json:"yanked"`
		License   string `json:"license"`
	} `json:"versions"`
}

func (source PackageRegistrySource) Name() string {
	return "packages"
}

func (source PackageRegistrySource) OutputPath(repoRoot string) string {
	return packageRegistryOutputPath(repoRoot)
}

func (source PackageRegistrySource) Fetch(ctx context.Context) (any, error) {
	config, err := loadPackageSourcesConfig(source.RepoRoot)
	if err != nil {
		return nil, err
	}

	items := make([]schema.PackageItemV1, 0, len(config.Packages))
	for _, configured := range config.Packages {
		if !source.includesEcosystem(configured.Ecosystem) {
			continue
		}

		item, err := source.fetchPackage(ctx, configured)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Ecosystem == items[j].Ecosystem {
			return items[i].Name < items[j].Name
		}
		return items[i].Ecosystem < items[j].Ecosystem
	})

	return schema.PackageRegistryIndexV1{
		SchemaVersion: schema.VersionV1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        "assets/data/package-sources.json",
		Items:         items,
	}, nil
}

func GeneratePackageRegistryIndex(ctx context.Context, repoRoot string) error {
	return RunSource(ctx, repoRoot, PackageRegistrySource{RepoRoot: repoRoot})
}

func loadPackageSourcesConfig(repoRoot string) (packageSourcesConfig, error) {
	configPath := filepath.Join(repoRoot, "assets", "data", "package-sources.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return packageSourcesConfig{}, fmt.Errorf("read package source config: %w", err)
	}

	var config packageSourcesConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return packageSourcesConfig{}, fmt.Errorf("decode package source config: %w", err)
	}
	return config, nil
}

func (source PackageRegistrySource) includesEcosystem(ecosystem string) bool {
	if len(source.Ecosystems) == 0 {
		return true
	}
	return source.Ecosystems[ecosystem]
}

func (source PackageRegistrySource) fetchPackage(ctx context.Context, configured packageSourceConfig) (schema.PackageItemV1, error) {
	switch configured.Ecosystem {
	case "pypi":
		return source.fetchPyPIPackage(ctx, configured)
	case "crates.io":
		return source.fetchCratesPackage(ctx, configured)
	default:
		return schema.PackageItemV1{}, fmt.Errorf("unsupported package ecosystem %q for %s", configured.Ecosystem, configured.Name)
	}
}

func (source PackageRegistrySource) fetchPyPIPackage(ctx context.Context, configured packageSourceConfig) (schema.PackageItemV1, error) {
	endpoint, err := joinRegistryURL(firstNonEmpty(source.PyPIBaseURL, defaultPyPIBaseURL), "pypi", configured.Name, "json")
	if err != nil {
		return schema.PackageItemV1{}, err
	}

	var response pypiProjectResponse
	if err := source.getRegistryJSON(ctx, endpoint, &response); err != nil {
		return schema.PackageItemV1{}, fmt.Errorf("fetch PyPI package %s: %w", configured.Name, err)
	}

	name := firstNonEmpty(response.Info.Name, configured.Name)
	return schema.PackageItemV1{
		ID:                 "pypi:" + name,
		Ecosystem:          "pypi",
		Name:               name,
		DisplayName:        firstNonEmpty(configured.DisplayName, name),
		Summary:            response.Info.Summary,
		Version:            response.Info.Version,
		URL:                firstNonEmpty(response.Info.ProjectURL, response.Info.PackageURL, response.Info.ReleaseURL, "https://pypi.org/project/"+name+"/"),
		RepositoryURL:      firstNonEmpty(configured.RepositoryURL, projectURLByKey(response.Info.ProjectURLs, "Source"), projectURLByKey(response.Info.ProjectURLs, "Repository")),
		DocumentationURL:   firstNonEmpty(configured.DocumentationURL, projectURLByKey(response.Info.ProjectURLs, "Documentation"), projectURLByKey(response.Info.ProjectURLs, "Docs")),
		HomepageURL:        firstNonEmpty(configured.HomepageURL, response.Info.HomePage, projectURLByKey(response.Info.ProjectURLs, "Homepage")),
		License:            response.Info.License,
		RuntimeRequirement: response.Info.RequiresPython,
		PublishedAt:        latestPyPIUploadTime(response.URLs),
		RelatedCaseStudies: configured.RelatedCaseStudies,
	}, nil
}

func (source PackageRegistrySource) fetchCratesPackage(ctx context.Context, configured packageSourceConfig) (schema.PackageItemV1, error) {
	endpoint, err := joinRegistryURL(firstNonEmpty(source.CratesBaseURL, defaultCratesBaseURL), "api", "v1", "crates", configured.Name)
	if err != nil {
		return schema.PackageItemV1{}, err
	}

	var response cratesProjectResponse
	if err := source.getRegistryJSON(ctx, endpoint, &response); err != nil {
		return schema.PackageItemV1{}, fmt.Errorf("fetch crates.io package %s: %w", configured.Name, err)
	}

	name := firstNonEmpty(response.Crate.Name, configured.Name)
	totalDownloads := response.Crate.Downloads
	recentDownloads := response.Crate.RecentDownloads
	latestVersion := matchingCrateVersion(response.Crate.NewestVersion, response.Versions)
	return schema.PackageItemV1{
		ID:                 "crates.io:" + name,
		Ecosystem:          "crates.io",
		Name:               name,
		DisplayName:        firstNonEmpty(configured.DisplayName, name),
		Summary:            response.Crate.Description,
		Version:            response.Crate.NewestVersion,
		URL:                "https://crates.io/crates/" + name,
		RepositoryURL:      firstNonEmpty(configured.RepositoryURL, response.Crate.Repository),
		DocumentationURL:   firstNonEmpty(configured.DocumentationURL, response.Crate.Documentation),
		HomepageURL:        firstNonEmpty(configured.HomepageURL, response.Crate.Homepage),
		License:            latestVersion.License,
		PublishedAt:        normalizeRegistryTime(latestVersion.CreatedAt),
		UpdatedAt:          normalizeRegistryTime(firstNonEmpty(latestVersion.UpdatedAt, response.Crate.UpdatedAt)),
		DownloadsTotal:     &totalDownloads,
		RecentDownloads:    &recentDownloads,
		RelatedCaseStudies: configured.RelatedCaseStudies,
	}, nil
}

func (source PackageRegistrySource) getRegistryJSON(ctx context.Context, endpoint string, target any) error {
	client := source.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", registryUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("%s returned %d", endpoint, resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("decode response for %s: %w", endpoint, err)
	}
	return nil
}

func joinRegistryURL(baseURL string, parts ...string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("parse registry base url %q: %w", baseURL, err)
	}
	allParts := append([]string{parsed.Path}, parts...)
	parsed.Path = path.Join(allParts...)
	return parsed.String(), nil
}

func projectURLByKey(projectURLs map[string]string, key string) string {
	for candidateKey, value := range projectURLs {
		if strings.EqualFold(candidateKey, key) {
			return value
		}
	}
	return ""
}

func latestPyPIUploadTime(urls []struct {
	UploadTimeISO8601 string `json:"upload_time_iso_8601"`
}) string {
	var latest time.Time
	for _, file := range urls {
		parsed, err := time.Parse(time.RFC3339Nano, file.UploadTimeISO8601)
		if err == nil && parsed.After(latest) {
			latest = parsed
		}
	}
	if latest.IsZero() {
		return ""
	}
	return latest.UTC().Format(time.RFC3339)
}

func matchingCrateVersion(newestVersion string, versions []struct {
	Num       string `json:"num"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	Yanked    bool   `json:"yanked"`
	License   string `json:"license"`
}) struct {
	Num       string `json:"num"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	Yanked    bool   `json:"yanked"`
	License   string `json:"license"`
} {
	for _, version := range versions {
		if version.Num == newestVersion {
			return version
		}
	}
	if len(versions) > 0 {
		return versions[0]
	}
	return struct {
		Num       string `json:"num"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
		Yanked    bool   `json:"yanked"`
		License   string `json:"license"`
	}{}
}

func normalizeRegistryTime(value string) string {
	if value == "" {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return value
	}
	return parsed.UTC().Format(time.RFC3339)
}
