package githubstats

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFetchSummaryAggregatesOwnedRepos(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/users/AndreaBozzo":
			fmt.Fprint(w, `{"login":"AndreaBozzo","followers":12,"following":3,"public_repos":4,"public_gists":1}`)
		case "/users/AndreaBozzo/repos":
			fmt.Fprint(w, `[{"name":"dataprof","stargazers_count":20,"fork":false,"owner":{"login":"AndreaBozzo"}},{"name":"forked","stargazers_count":99,"fork":true,"owner":{"login":"AndreaBozzo"}}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClientWithBaseURL(server.URL, server.Client())
	summary, err := client.FetchSummary(context.Background(), "AndreaBozzo")
	if err != nil {
		t.Fatalf("FetchSummary returned error: %v", err)
	}
	if summary.Username != "AndreaBozzo" || summary.Followers != 12 || summary.PublicRepos != 4 {
		t.Fatalf("unexpected user summary: %+v", summary)
	}
	if summary.TotalStars != 20 || summary.OwnedRepos != 1 || summary.ForkedRepos != 1 {
		t.Fatalf("unexpected repo aggregation: %+v", summary)
	}
	if summary.TopRepoName != "dataprof" || summary.TopRepoStars != 20 {
		t.Fatalf("unexpected top repo: %+v", summary)
	}
}

func TestStatsHandlerReturnsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/users/AndreaBozzo":
			fmt.Fprint(w, `{"login":"AndreaBozzo","followers":12,"following":3,"public_repos":4,"public_gists":1}`)
		case "/users/AndreaBozzo/repos":
			fmt.Fprint(w, `[{"name":"dataprof","stargazers_count":20,"fork":false,"owner":{"login":"AndreaBozzo"}}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClientWithBaseURL(server.URL, server.Client())
	req := httptest.NewRequest(http.MethodGet, "/api/github/stats?username=AndreaBozzo", nil)
	rec := httptest.NewRecorder()
	StatsHandler(client).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("unexpected content type: %s", got)
	}
}

func TestBadgeHandlerReturnsSVG(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/users/AndreaBozzo":
			fmt.Fprint(w, `{"login":"AndreaBozzo","followers":12,"following":3,"public_repos":4,"public_gists":1}`)
		case "/users/AndreaBozzo/repos":
			fmt.Fprint(w, `[{"name":"dataprof","stargazers_count":20,"fork":false,"owner":{"login":"AndreaBozzo"}}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClientWithBaseURL(server.URL, server.Client())
	req := httptest.NewRequest(http.MethodGet, "/api/github/badge?metric=stars&username=AndreaBozzo", nil)
	rec := httptest.NewRecorder()
	BadgeHandler(client).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "image/svg+xml; charset=utf-8" {
		t.Fatalf("unexpected content type: %s", got)
	}
}

func TestBadgeForMetric(t *testing.T) {
	badge, err := BadgeForMetric(Summary{TotalStars: 1450, Followers: 42, PublicRepos: 19, TopRepoName: "dataprof"}, "stars")
	if err != nil {
		t.Fatalf("BadgeForMetric returned error: %v", err)
	}
	if badge.Label != "GitHub stars" || badge.Message != "1.4k" {
		t.Fatalf("unexpected badge: %+v", badge)
	}
}

func TestRenderSVGIncludesEscapedLabelAndMessage(t *testing.T) {
	svg := RenderSVG(Badge{Label: "Top repo", Message: "data<prof>", Color: "7c3aed"})
	if svg == "" || !containsAll(svg, "Top repo", "data&lt;prof&gt;", "7c3aed") {
		t.Fatalf("unexpected svg output: %s", svg)
	}
}

func containsAll(haystack string, needles ...string) bool {
	for _, needle := range needles {
		if !strings.Contains(haystack, needle) {
			return false
		}
	}
	return true
}
