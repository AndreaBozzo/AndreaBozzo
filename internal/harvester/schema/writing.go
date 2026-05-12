package schema

const VersionV1 = "v1"

type WritingIndexV1 struct {
	SchemaVersion string          `json:"$schemaVersion"`
	GeneratedAt   string          `json:"generatedAt"`
	Source        string          `json:"source"`
	Items         []WritingItemV1 `json:"items"`
}

type WritingItemV1 struct {
	ID                 string   `json:"id"`
	Slug               string   `json:"slug"`
	Language           string   `json:"language"`
	Title              string   `json:"title"`
	Summary            string   `json:"summary"`
	Description        string   `json:"description,omitempty"`
	PublishedAt        string   `json:"publishedAt"`
	URL                string   `json:"url"`
	SourcePath         string   `json:"sourcePath"`
	Tags               []string `json:"tags"`
	Categories         []string `json:"categories"`
	RelatedCaseStudies []string `json:"relatedCaseStudies,omitempty"`
	WordCount          int      `json:"wordCount"`
	ReadingMinutes     int      `json:"readingMinutes"`
}
