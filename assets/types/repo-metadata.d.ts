export interface RepositoryReleaseV1 {
  tagName: string;
  name: string;
  url?: string;
  publishedAt?: string;
  target?: string;
}

export interface RepositoryMetadataItemV1 {
  caseStudySlug: string;
  repoFullName: string;
  repoUrl: string;
  description?: string;
  stars: number;
  forks: number;
  topics?: string[];
  language?: string;
  pushedAt?: string;
  defaultBranch?: string;
  relatedCaseStudies?: string[];
  releases?: RepositoryReleaseV1[];
}

export interface RepositoryMetadataIndexV1 {
  $schemaVersion: 'v1';
  generatedAt: string;
  source: string;
  items: RepositoryMetadataItemV1[];
}
