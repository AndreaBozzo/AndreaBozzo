package schema

type RepositoryMetadataIndexV1 struct {
	SchemaVersion string                     `json:"$schemaVersion"`
	GeneratedAt   string                     `json:"generatedAt"`
	Source        string                     `json:"source"`
	Items         []RepositoryMetadataItemV1 `json:"items"`
}

type RepositoryMetadataItemV1 struct {
	CaseStudySlug      string                `json:"caseStudySlug"`
	RepoFullName       string                `json:"repoFullName"`
	RepoURL            string                `json:"repoUrl"`
	Description        string                `json:"description,omitempty"`
	Stars              int                   `json:"stars"`
	Forks              int                   `json:"forks"`
	Topics             []string              `json:"topics,omitempty"`
	Language           string                `json:"language,omitempty"`
	PushedAt           string                `json:"pushedAt,omitempty"`
	DefaultBranch      string                `json:"defaultBranch,omitempty"`
	Releases           []RepositoryReleaseV1 `json:"releases,omitempty"`
	RelatedCaseStudies []string              `json:"relatedCaseStudies,omitempty"`
}

type RepositoryReleaseV1 struct {
	TagName     string `json:"tagName"`
	Name        string `json:"name"`
	URL         string `json:"url,omitempty"`
	PublishedAt string `json:"publishedAt,omitempty"`
	Target      string `json:"target,omitempty"`
}
