package githubstats

import "time"

type Summary struct {
	Username       string    `json:"username"`
	Followers      int       `json:"followers"`
	Following      int       `json:"following"`
	PublicRepos    int       `json:"publicRepos"`
	PublicGists    int       `json:"publicGists"`
	OwnedRepos     int       `json:"ownedRepos"`
	ForkedRepos    int       `json:"forkedRepos"`
	TotalStars     int       `json:"totalStars"`
	TopRepoName    string    `json:"topRepoName,omitempty"`
	TopRepoStars   int       `json:"topRepoStars,omitempty"`
	GeneratedAtUTC time.Time `json:"generatedAtUtc"`
	Source         string    `json:"source"`
}

type Badge struct {
	Label   string `json:"label"`
	Message string `json:"message"`
	Color   string `json:"color"`
}
