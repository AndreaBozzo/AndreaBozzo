package handler

import (
	"net/http"

	"github.com/AndreaBozzo/AndreaBozzo/internal/githubstats"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	githubstats.BadgeHandler(nil).ServeHTTP(w, r)
}
