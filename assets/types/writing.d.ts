export interface WritingItemV1 {
  id: string;
  slug: string;
  language: string;
  title: string;
  summary: string;
  description?: string;
  publishedAt: string;
  url: string;
  sourcePath: string;
  tags: string[];
  categories: string[];
  relatedCaseStudies?: string[];
  wordCount: number;
  readingMinutes: number;
}

export interface WritingIndexV1 {
  $schemaVersion: 'v1';
  generatedAt: string;
  source: string;
  items: WritingItemV1[];
}
