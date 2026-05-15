package harvester

import (
	"fmt"
	"os"
	"path/filepath"
)

type generatedArtifact struct {
	path    string
	content string
}

func GenerateContractArtifacts(repoRoot string) error {
	artifacts := []generatedArtifact{
		{
			path:    filepath.Join(repoRoot, "schema", "writing.schema.json"),
			content: writingSchemaJSON,
		},
		{
			path:    filepath.Join(repoRoot, "schema", "packages.schema.json"),
			content: packagesSchemaJSON,
		},
		{
			path:    filepath.Join(repoRoot, "schema", "ci-runtimes.schema.json"),
			content: ciRuntimesSchemaJSON,
		},
		{
			path:    filepath.Join(repoRoot, "schema", "contributions.schema.json"),
			content: contributionsSchemaJSON,
		},
		{
			path:    filepath.Join(repoRoot, "schema", "repo-metadata.schema.json"),
			content: repoMetadataSchemaJSON,
		},
		{
			path:    filepath.Join(repoRoot, "assets", "types", "writing.d.ts"),
			content: writingTypes,
		},
		{
			path:    filepath.Join(repoRoot, "assets", "types", "packages.d.ts"),
			content: packagesTypes,
		},
		{
			path:    filepath.Join(repoRoot, "assets", "types", "ci-runtimes.d.ts"),
			content: ciRuntimesTypes,
		},
		{
			path:    filepath.Join(repoRoot, "assets", "types", "contributions.d.ts"),
			content: contributionsTypes,
		},
		{
			path:    filepath.Join(repoRoot, "assets", "types", "repo-metadata.d.ts"),
			content: repoMetadataTypes,
		},
	}

	for _, artifact := range artifacts {
		if err := writeTextFile(artifact.path, artifact.content); err != nil {
			return fmt.Errorf("write contract artifact %s: %w", artifact.path, err)
		}
	}

	return nil
}

const writingSchemaJSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://andreabozzo.dev/schema/writing.schema.json",
  "title": "WritingIndexV1",
  "type": "object",
  "additionalProperties": false,
  "required": ["$schemaVersion", "generatedAt", "source", "items"],
  "properties": {
    "$schemaVersion": {
      "const": "v1"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "source": {
      "type": "string",
      "minLength": 1
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/WritingItemV1"
      }
    }
  },
  "$defs": {
    "WritingItemV1": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "slug",
        "language",
        "title",
        "summary",
        "publishedAt",
        "url",
        "sourcePath",
        "tags",
        "categories",
        "wordCount",
        "readingMinutes"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "slug": {
          "type": "string",
          "minLength": 1
        },
        "language": {
          "type": "string",
          "minLength": 2
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "summary": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string"
        },
        "publishedAt": {
          "type": "string",
          "format": "date-time"
        },
        "url": {
          "type": "string",
          "minLength": 1
        },
        "sourcePath": {
          "type": "string",
          "minLength": 1
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "categories": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "relatedCaseStudies": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "wordCount": {
          "type": "integer",
          "minimum": 0
        },
        "readingMinutes": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
}
`

const packagesSchemaJSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://andreabozzo.dev/schema/packages.schema.json",
  "title": "PackageRegistryIndexV1",
  "type": "object",
  "additionalProperties": false,
  "required": ["$schemaVersion", "generatedAt", "source", "items"],
  "properties": {
    "$schemaVersion": {
      "const": "v1"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "source": {
      "type": "string",
      "minLength": 1
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/PackageItemV1"
      }
    }
  },
  "$defs": {
    "PackageItemV1": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "ecosystem", "name", "displayName", "summary", "version", "url"],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "ecosystem": {
          "type": "string",
          "minLength": 1
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "displayName": {
          "type": "string",
          "minLength": 1
        },
        "summary": {
          "type": "string"
        },
        "version": {
          "type": "string",
          "minLength": 1
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "repositoryUrl": {
          "type": "string",
          "format": "uri"
        },
        "documentationUrl": {
          "type": "string",
          "format": "uri"
        },
        "homepageUrl": {
          "type": "string",
          "format": "uri"
        },
        "license": {
          "type": "string"
        },
        "runtimeRequirement": {
          "type": "string"
        },
        "publishedAt": {
          "type": "string",
          "format": "date-time"
        },
        "updatedAt": {
          "type": "string",
          "format": "date-time"
        },
        "downloadsTotal": {
          "type": "integer",
          "minimum": 0
        },
        "recentDownloads": {
          "type": "integer",
          "minimum": 0
        },
        "relatedCaseStudies": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
`

const ciRuntimesSchemaJSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://andreabozzo.dev/schema/ci-runtimes.schema.json",
  "title": "CIRuntimeIndexV1",
  "type": "object",
  "additionalProperties": false,
  "required": ["$schemaVersion", "generatedAt", "source", "items"],
  "properties": {
    "$schemaVersion": {
      "const": "v1"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "source": {
      "type": "string",
      "minLength": 1
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/CIRuntimeItemV1"
      }
    }
  },
  "$defs": {
    "CIRuntimeItemV1": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "caseStudySlug",
        "repoFullName",
        "repoUrl",
        "workflowName",
        "runsSampled",
        "medianDurationSeconds",
        "p95DurationSeconds",
        "successRate"
      ],
      "properties": {
        "caseStudySlug": {
          "type": "string",
          "minLength": 1
        },
        "repoFullName": {
          "type": "string",
          "minLength": 1
        },
        "repoUrl": {
          "type": "string",
          "format": "uri"
        },
        "workflowName": {
          "type": "string",
          "minLength": 1
        },
        "workflowPath": {
          "type": "string"
        },
        "workflowUrl": {
          "type": "string",
          "format": "uri"
        },
        "runsSampled": {
          "type": "integer",
          "minimum": 0
        },
        "medianDurationSeconds": {
          "type": "integer",
          "minimum": 0
        },
        "p95DurationSeconds": {
          "type": "integer",
          "minimum": 0
        },
        "successRate": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "latestStatus": {
          "type": "string"
        },
        "latestConclusion": {
          "type": "string"
        },
        "latestRunAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
`

const contributionsSchemaJSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://andreabozzo.dev/schema/contributions.schema.json",
  "title": "ContributionsIndexV1",
  "type": "object",
  "additionalProperties": false,
  "required": ["$schemaVersion", "generatedAt", "source", "items"],
  "properties": {
    "$schemaVersion": {
      "const": "v1"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "source": {
      "type": "string",
      "minLength": 1
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/ContributionItemV1"
      }
    }
  },
  "$defs": {
    "ContributionItemV1": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "url", "stars", "prs", "desc"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "url": { "type": "string", "format": "uri" },
        "stars": { "type": "string", "minLength": 1 },
        "prs": { "type": "string", "minLength": 1 },
        "desc": { "type": "string", "minLength": 1 },
        "language": { "type": "string" },
        "topics": { "type": "array", "items": { "type": "string" } },
        "lastPRMergedAt": { "type": "string", "format": "date-time" },
        "prList": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["title", "number", "url"],
            "properties": {
              "title": { "type": "string", "minLength": 1 },
              "number": { "type": "integer", "minimum": 0 },
              "url": { "type": "string", "format": "uri" },
              "mergedAt": { "type": "string", "format": "date-time" }
            }
          }
        }
      }
    }
  }
}
`

const repoMetadataSchemaJSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://andreabozzo.dev/schema/repo-metadata.schema.json",
  "title": "RepositoryMetadataIndexV1",
  "type": "object",
  "additionalProperties": false,
  "required": ["$schemaVersion", "generatedAt", "source", "items"],
  "properties": {
    "$schemaVersion": {
      "const": "v1"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "source": {
      "type": "string",
      "minLength": 1
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/RepositoryMetadataItemV1"
      }
    }
  },
  "$defs": {
    "RepositoryMetadataItemV1": {
      "type": "object",
      "additionalProperties": false,
      "required": ["caseStudySlug", "repoFullName", "repoUrl", "stars", "forks"],
      "properties": {
        "caseStudySlug": { "type": "string", "minLength": 1 },
        "repoFullName": { "type": "string", "minLength": 1 },
        "repoUrl": { "type": "string", "format": "uri" },
        "description": { "type": "string" },
        "stars": { "type": "integer", "minimum": 0 },
        "forks": { "type": "integer", "minimum": 0 },
        "topics": { "type": "array", "items": { "type": "string" } },
        "language": { "type": "string" },
        "pushedAt": { "type": "string", "format": "date-time" },
        "defaultBranch": { "type": "string" },
        "relatedCaseStudies": { "type": "array", "items": { "type": "string" } },
        "releases": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["tagName", "name"],
            "properties": {
              "tagName": { "type": "string", "minLength": 1 },
              "name": { "type": "string", "minLength": 1 },
              "url": { "type": "string", "format": "uri" },
              "publishedAt": { "type": "string", "format": "date-time" },
              "target": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
`

const writingTypes = `export interface WritingItemV1 {
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
`

const packagesTypes = `export interface PackageItemV1 {
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
`

const ciRuntimesTypes = `export interface CIRuntimeItemV1 {
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
`

const contributionsTypes = `export interface ContributionPRV1 {
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
`

const repoMetadataTypes = `export interface RepositoryReleaseV1 {
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
`

func writeTextFile(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create directory for %s: %w", path, err)
	}

	body := []byte(content)
	if len(body) == 0 || body[len(body)-1] != '\n' {
		body = append(body, '\n')
	}

	if err := os.WriteFile(path, body, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	return nil
}
