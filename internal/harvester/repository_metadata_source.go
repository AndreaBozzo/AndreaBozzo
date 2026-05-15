package harvester

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/AndreaBozzo/AndreaBozzo/internal/harvester/schema"
)

const defaultOwnedRepoReleaseLimit = 3

type OwnedRepositoryMetadataSource struct {
	RepoRoot     string
	HTTPClient   *http.Client
	APIBaseURL   string
	Token        string
	ReleaseLimit int
	GitHubOwner  string
}

type githubOwnedRepoResponse struct {
	FullName        string   `json:"full_name"`
	HTMLURL         string   `json:"html_url"`
	Description     string   `json:"description"`
	StargazersCount int      `json:"stargazers_count"`
	ForksCount      int      `json:"forks_count"`
	Topics          []string `json:"topics"`
	Language        string   `json:"language"`
	PushedAt        string   `json:"pushed_at"`
	DefaultBranch   string   `json:"default_branch"`
}

type githubReleaseResponse struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Draft       bool   `json:"draft"`
	Prerelease  bool   `json:"prerelease"`
	Target      string `json:"target_commitish"`
}

func (source OwnedRepositoryMetadataSource) Name() string {
	return "repo-metadata"
}

func (source OwnedRepositoryMetadataSource) OutputPath(repoRoot string) string {
	return repositoryMetadataOutputPath(repoRoot)
}

func (source OwnedRepositoryMetadataSource) Fetch(ctx context.Context) (any, error) {
	payload, err := loadCaseStudiesPayload(caseStudiesPath(source.RepoRoot))
	if err != nil {
		return nil, err
	}

	owner := strings.ToLower(strings.TrimSpace(firstNonEmpty(source.GitHubOwner, "AndreaBozzo")))
	releaseLimit := source.ReleaseLimit
	if releaseLimit <= 0 {
		releaseLimit = defaultOwnedRepoReleaseLimit
	}

	items := make([]schema.RepositoryMetadataItemV1, 0, len(payload.Items))
	seen := make(map[string]struct{}, len(payload.Items))
	for _, study := range payload.Items {
		fullName := githubRepoFullName(study.RepoURL)
		if fullName == "" {
			continue
		}
		parts := strings.SplitN(fullName, "/", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != owner {
			continue
		}
		if _, ok := seen[fullName]; ok {
			continue
		}
		seen[fullName] = struct{}{}

		item, err := source.fetchRepository(ctx, study, fullName, releaseLimit)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].CaseStudySlug == items[j].CaseStudySlug {
			return items[i].RepoFullName < items[j].RepoFullName
		}
		return items[i].CaseStudySlug < items[j].CaseStudySlug
	})

	return schema.RepositoryMetadataIndexV1{
		SchemaVersion: schema.VersionV1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        "case-study repoUrl GitHub repository metadata",
		Items:         items,
	}, nil
}

func GenerateRepositoryMetadataIndex(ctx context.Context, repoRoot string) error {
	return RunSource(ctx, repoRoot, OwnedRepositoryMetadataSource{RepoRoot: repoRoot})
}

func (source OwnedRepositoryMetadataSource) fetchRepository(ctx context.Context, study caseStudy, fullName string, releaseLimit int) (schema.RepositoryMetadataItemV1, error) {
	client := githubClient{
		repoRoot:   source.RepoRoot,
		httpClient: source.HTTPClient,
		token:      strings.TrimSpace(firstNonEmpty(source.Token, os.Getenv("GITHUB_TOKEN"))),
		cache:      newHTTPCache(source.RepoRoot),
	}
	if client.httpClient == nil {
		client.httpClient = &http.Client{Timeout: 30 * time.Second}
	}

	baseURL := strings.TrimRight(firstNonEmpty(source.APIBaseURL, defaultGitHubAPIBaseURL), "/")
	var repo githubOwnedRepoResponse
	if err := client.getJSON(ctx, baseURL+"/repos/"+fullName, &repo); err != nil {
		return schema.RepositoryMetadataItemV1{}, fmt.Errorf("fetch repository metadata for %s: %w", fullName, err)
	}

	var releases []githubReleaseResponse
	if err := client.getJSON(ctx, baseURL+"/repos/"+fullName+"/releases?per_page=10", &releases); err != nil {
		return schema.RepositoryMetadataItemV1{}, fmt.Errorf("fetch releases for %s: %w", fullName, err)
	}

	selected := make([]schema.RepositoryReleaseV1, 0, releaseLimit)
	for _, release := range releases {
		if release.Draft || release.Prerelease {
			continue
		}
		selected = append(selected, schema.RepositoryReleaseV1{
			TagName:     release.TagName,
			Name:        firstNonEmpty(release.Name, release.TagName),
			URL:         release.HTMLURL,
			PublishedAt: normalizeRegistryTime(release.PublishedAt),
			Target:      release.Target,
		})
		if len(selected) == releaseLimit {
			break
		}
	}

	return schema.RepositoryMetadataItemV1{
		CaseStudySlug:      study.Slug,
		RepoFullName:       firstNonEmpty(repo.FullName, fullName),
		RepoURL:            firstNonEmpty(repo.HTMLURL, study.RepoURL),
		Description:        repo.Description,
		Stars:              repo.StargazersCount,
		Forks:              repo.ForksCount,
		Topics:             repo.Topics,
		Language:           repo.Language,
		PushedAt:           normalizeRegistryTime(repo.PushedAt),
		DefaultBranch:      repo.DefaultBranch,
		Releases:           selected,
		RelatedCaseStudies: []string{study.Slug},
	}, nil
}

func loadRepositoryMetadataIndex(repoRoot string) (schema.RepositoryMetadataIndexV1, error) {
	raw, err := os.ReadFile(repositoryMetadataOutputPath(repoRoot))
	if err != nil {
		if os.IsNotExist(err) {
			return schema.RepositoryMetadataIndexV1{}, nil
		}
		return schema.RepositoryMetadataIndexV1{}, fmt.Errorf("read repository metadata index: %w", err)
	}

	var index schema.RepositoryMetadataIndexV1
	if err := json.Unmarshal(raw, &index); err != nil {
		return schema.RepositoryMetadataIndexV1{}, fmt.Errorf("decode repository metadata index: %w", err)
	}
	return index, nil
}
