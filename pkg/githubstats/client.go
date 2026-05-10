package githubstats

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultAPIBaseURL = "https://api.github.com"

type Client struct {
	baseURL    string
	httpClient *http.Client
	token      string
}

type userResponse struct {
	Login       string `json:"login"`
	Followers   int    `json:"followers"`
	Following   int    `json:"following"`
	PublicRepos int    `json:"public_repos"`
	PublicGists int    `json:"public_gists"`
}

type repositoryResponse struct {
	Name            string `json:"name"`
	StargazersCount int    `json:"stargazers_count"`
	Fork            bool   `json:"fork"`
	Owner           struct {
		Login string `json:"login"`
	} `json:"owner"`
}

func NewClient() *Client {
	return NewClientWithBaseURL(defaultAPIBaseURL, nil)
}

func NewClientWithBaseURL(baseURL string, httpClient *http.Client) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultAPIBaseURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
		token:      firstNonEmpty(strings.TrimSpace(os.Getenv("GITHUB_API_TOKEN")), strings.TrimSpace(os.Getenv("GITHUB_TOKEN"))),
	}
}

func (client *Client) FetchSummary(ctx context.Context, username string) (Summary, error) {
	if strings.TrimSpace(username) == "" {
		return Summary{}, fmt.Errorf("username is required")
	}

	var user userResponse
	if err := client.getJSON(ctx, "/users/"+url.PathEscape(username), &user); err != nil {
		return Summary{}, err
	}

	repositories, err := client.fetchOwnedRepositories(ctx, username)
	if err != nil {
		return Summary{}, err
	}

	summary := Summary{
		Username:       user.Login,
		Followers:      user.Followers,
		Following:      user.Following,
		PublicRepos:    user.PublicRepos,
		PublicGists:    user.PublicGists,
		GeneratedAtUTC: time.Now().UTC(),
		Source:         "api.github.com",
	}

	for _, repo := range repositories {
		if repo.Fork {
			summary.ForkedRepos++
			continue
		}
		summary.OwnedRepos++
		summary.TotalStars += repo.StargazersCount
		if repo.StargazersCount > summary.TopRepoStars {
			summary.TopRepoStars = repo.StargazersCount
			summary.TopRepoName = repo.Name
		}
	}

	return summary, nil
}

func (client *Client) fetchOwnedRepositories(ctx context.Context, username string) ([]repositoryResponse, error) {
	var repositories []repositoryResponse
	for page := 1; ; page++ {
		endpoint := fmt.Sprintf("/users/%s/repos?per_page=100&page=%d&type=owner&sort=updated", url.PathEscape(username), page)
		var batch []repositoryResponse
		if err := client.getJSON(ctx, endpoint, &batch); err != nil {
			return nil, err
		}
		repositories = append(repositories, batch...)
		if len(batch) < 100 {
			break
		}
	}
	return repositories, nil
}

func (client *Client) getJSON(ctx context.Context, path string, target any) error {
	endpoint := client.baseURL + path
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return fmt.Errorf("build request for %s: %w", endpoint, err)
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("User-Agent", "andreabozzo-api")
		if client.token != "" {
			req.Header.Set("Authorization", "Bearer "+client.token)
		}

		resp, err := client.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("request %s: %w", endpoint, err)
		}

		body, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return fmt.Errorf("read response for %s: %w", endpoint, readErr)
		}

		if resp.StatusCode == http.StatusForbidden && isRateLimited(resp) {
			sleepFor := rateLimitDelay(resp.Header.Get("X-RateLimit-Reset"))
			time.Sleep(sleepFor)
			continue
		}
		if resp.StatusCode >= 300 {
			return fmt.Errorf("github API %s returned %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
		}
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("decode response for %s: %w", endpoint, err)
		}
		return nil
	}

	return fmt.Errorf("github API %s exceeded retry budget", endpoint)
}

func isRateLimited(resp *http.Response) bool {
	return resp.Header.Get("X-RateLimit-Remaining") == "0"
}

func rateLimitDelay(resetUnix string) time.Duration {
	if resetUnix == "" {
		return 10 * time.Second
	}
	parsed, err := strconv.ParseInt(resetUnix, 10, 64)
	if err != nil {
		return 10 * time.Second
	}
	delay := time.Until(time.Unix(parsed, 0))
	if delay < 10*time.Second {
		return 10 * time.Second
	}
	if delay > 2*time.Minute {
		return 2 * time.Minute
	}
	return delay
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
