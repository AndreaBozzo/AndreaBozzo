export interface PackageItemV1 {
  id: string;
  ecosystem: string;
  name: string;
  displayName: string;
  summary: string;
  version: string;
  url: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  homepageUrl?: string;
  license?: string;
  runtimeRequirement?: string;
  publishedAt?: string;
  updatedAt?: string;
  downloadsTotal?: number;
  recentDownloads?: number;
  relatedCaseStudies?: string[];
}

export interface PackageRegistryIndexV1 {
  $schemaVersion: 'v1';
  generatedAt: string;
  source: string;
  items: PackageItemV1[];
}
