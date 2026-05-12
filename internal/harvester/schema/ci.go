package schema

type CIRuntimeIndexV1 struct {
	SchemaVersion string            `json:"$schemaVersion"`
	GeneratedAt   string            `json:"generatedAt"`
	Source        string            `json:"source"`
	Items         []CIRuntimeItemV1 `json:"items"`
}

type CIRuntimeItemV1 struct {
	CaseStudySlug         string  `json:"caseStudySlug"`
	RepoFullName          string  `json:"repoFullName"`
	RepoURL               string  `json:"repoUrl"`
	WorkflowName          string  `json:"workflowName"`
	WorkflowPath          string  `json:"workflowPath,omitempty"`
	WorkflowURL           string  `json:"workflowUrl,omitempty"`
	RunsSampled           int     `json:"runsSampled"`
	MedianDurationSeconds int     `json:"medianDurationSeconds"`
	P95DurationSeconds    int     `json:"p95DurationSeconds"`
	SuccessRate           float64 `json:"successRate"`
	LatestStatus          string  `json:"latestStatus,omitempty"`
	LatestConclusion      string  `json:"latestConclusion,omitempty"`
	LatestRunAt           string  `json:"latestRunAt,omitempty"`
}
