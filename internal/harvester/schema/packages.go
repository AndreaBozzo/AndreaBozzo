package schema

type PackageRegistryIndexV1 struct {
	SchemaVersion string          `json:"$schemaVersion"`
	GeneratedAt   string          `json:"generatedAt"`
	Source        string          `json:"source"`
	Items         []PackageItemV1 `json:"items"`
}

type PackageItemV1 struct {
	ID                 string   `json:"id"`
	Ecosystem          string   `json:"ecosystem"`
	Name               string   `json:"name"`
	DisplayName        string   `json:"displayName"`
	Summary            string   `json:"summary"`
	Version            string   `json:"version"`
	URL                string   `json:"url"`
	RepositoryURL      string   `json:"repositoryUrl,omitempty"`
	DocumentationURL   string   `json:"documentationUrl,omitempty"`
	HomepageURL        string   `json:"homepageUrl,omitempty"`
	License            string   `json:"license,omitempty"`
	RuntimeRequirement string   `json:"runtimeRequirement,omitempty"`
	PublishedAt        string   `json:"publishedAt,omitempty"`
	UpdatedAt          string   `json:"updatedAt,omitempty"`
	DownloadsTotal     *int     `json:"downloadsTotal,omitempty"`
	RecentDownloads    *int     `json:"recentDownloads,omitempty"`
	RelatedCaseStudies []string `json:"relatedCaseStudies,omitempty"`
}
