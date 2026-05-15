export interface ContributionPRV1 {
  title: string;
  number: number;
  url: string;
  mergedAt?: string;
}

export interface ContributionItemV1 {
  name: string;
  url: string;
  stars: string;
  prs: string;
  desc: string;
  language?: string;
  topics?: string[];
  lastPRMergedAt?: string;
  prList?: ContributionPRV1[];
}

export interface ContributionsIndexV1 {
  $schemaVersion: 'v1';
  generatedAt: string;
  source: string;
  items: ContributionItemV1[];
}
