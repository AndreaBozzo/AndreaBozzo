package githubstats

import (
	"encoding/json"
	"net/http"
	"strings"
)

const defaultUsername = "AndreaBozzo"

func StatsHandler(client *Client) http.HandlerFunc {
	if client == nil {
		client = NewClient()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		username := strings.TrimSpace(r.URL.Query().Get("username"))
		if username == "" {
			username = defaultUsername
		}

		summary, err := client.FetchSummary(r.Context(), username)
		if err != nil {
			writeJSONError(w, http.StatusBadGateway, err.Error())
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
		_ = json.NewEncoder(w).Encode(summary)
	}
}

func BadgeHandler(client *Client) http.HandlerFunc {
	if client == nil {
		client = NewClient()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		username := strings.TrimSpace(r.URL.Query().Get("username"))
		if username == "" {
			username = defaultUsername
		}
		summary, err := client.FetchSummary(r.Context(), username)
		if err != nil {
			w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(RenderSVG(Badge{Label: "GitHub", Message: "unavailable", Color: "ef4444"})))
			return
		}

		badge, err := BadgeForMetric(summary, r.URL.Query().Get("metric"))
		if err != nil {
			w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(RenderSVG(Badge{Label: "GitHub", Message: "bad metric", Color: "ef4444"})))
			return
		}

		w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
		w.Header().Set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
		_, _ = w.Write([]byte(RenderSVG(badge)))
	}
}

func applyCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func writeJSONError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
