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
			path:    filepath.Join(repoRoot, "assets", "types", "writing.d.ts"),
			content: writingTypes,
		},
		{
			path:    filepath.Join(repoRoot, "assets", "types", "packages.d.ts"),
			content: packagesTypes,
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
