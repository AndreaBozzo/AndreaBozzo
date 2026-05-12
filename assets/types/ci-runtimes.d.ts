export interface CIRuntimeItemV1 {
  caseStudySlug: string;
  repoFullName: string;
  repoUrl: string;
  workflowName: string;
  workflowPath?: string;
  workflowUrl?: string;
  runsSampled: number;
  medianDurationSeconds: number;
  p95DurationSeconds: number;
  successRate: number;
  latestStatus?: string;
  latestConclusion?: string;
  latestRunAt?: string;
}

export interface CIRuntimeIndexV1 {
  $schemaVersion: 'v1';
  generatedAt: string;
  source: string;
  items: CIRuntimeItemV1[];
}
