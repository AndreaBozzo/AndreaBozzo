package handler

import (
	"net/http"

	"github.com/AndreaBozzo/AndreaBozzo/pkg/githubstats"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	githubstats.StatsHandler(nil).ServeHTTP(w, r)
}
