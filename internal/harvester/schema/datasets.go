package schema

type DatasetIndexV1 struct {
	SchemaVersion string          `json:"$schemaVersion"`
	GeneratedAt   string          `json:"generatedAt"`
	Source        string          `json:"source"`
	Items         []DatasetItemV1 `json:"items"`
}

type DatasetItemV1 struct {
	ID                 string             `json:"id"`
	Provider           string             `json:"provider"`
	Slug               string             `json:"slug"`
	DisplayName        string             `json:"displayName"`
	URL                string             `json:"url"`
	License            string             `json:"license,omitempty"`
	Summary            string             `json:"summary,omitempty"`
	Languages          []string           `json:"languages,omitempty"`
	Tags               []string           `json:"tags,omitempty"`
	SnapshotDate       string             `json:"snapshotDate,omitempty"`
	LastModified       string             `json:"lastModified,omitempty"`
	Downloads          *int               `json:"downloads,omitempty"`
	Likes              *int               `json:"likes,omitempty"`
	TotalRecords       *int               `json:"totalRecords,omitempty"`
	UniqueRecords      *int               `json:"uniqueRecords,omitempty"`
	DuplicateRecords   *int               `json:"duplicateRecords,omitempty"`
	FilteredRecords    *int               `json:"filteredRecords,omitempty"`
	SourceCount        *int               `json:"sourceCount,omitempty"`
	CountryCount       *int               `json:"countryCount,omitempty"`
	Sources            []DatasetSourceV1  `json:"sources,omitempty"`
	RelatedCaseStudies []string           `json:"relatedCaseStudies,omitempty"`
}

type DatasetSourceV1 struct {
	Name  string `json:"name"`
	URL   string `json:"url,omitempty"`
	Count int    `json:"count"`
}
