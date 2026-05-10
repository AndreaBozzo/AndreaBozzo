package handler

import (
	"net/http"

	"github.com/AndreaBozzo/AndreaBozzo/internal/githubstats"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	githubstats.StatsHandler(nil).ServeHTTP(w, r)
}
