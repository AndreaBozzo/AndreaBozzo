---
title: "Ceres: Semantic Search for Open Data"
date: 2025-12-20T12:00:00+01:00
draft: false
tags: ["Rust", "Data Engineering", "Semantic Search", "Open Data", "CKAN", "PostgreSQL", "pgvector"]
categories: ["Data Engineering", "Open Source"]
description: "How Ceres solves the discoverability problem in European open data portals with semantic search, Rust and PostgreSQL+pgvector"
summary: "Ceres is a semantic search engine for CKAN portals. Built in Rust with Tokio and PostgreSQL+pgvector, it bridges the gap between how people search and how public administrations name their datasets."
author: "Andrea Bozzo"
showToc: true
TocOpen: true
hidemeta: false
comments: false
disableHLJS: false
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
cover:
    image: "images/Ceres-logo.jpeg"
    alt: "Ceres Logo"
    caption: "Ceres - Semantic Search for Open Data"
    relative: false
    hidden: false
---

CKAN-based open data portals publish thousands of datasets, yet they often remain invisible. A citizen searches for "air pollution" and finds nothing because the official dataset is called "PM10_monitoring_Q3_2024". A researcher typing "city population" doesn't discover demographic data because it's tagged differently. The problem isn't the amount of available information: it's that keyword search systematically fails when people don't know the administration's taxonomy.

Ceres addresses exactly this gap. It's a semantic search engine for CKAN portals, built with Rust, Tokio, and PostgreSQL+pgvector. It's not academic research, nor a proof-of-concept far from reality. It's a pragmatic answer to a problem that plagues the European open data landscape: how do end users find what they're looking for when they don't know the exact name?

## Three Components, One Coherent Philosophy

Ceres architecture is organized into three blocks that reflect a philosophy seen in previous articles: **metadata is the foundation, not a consequence**.

![Ceres Architecture](/images/Ceres_architecture.png)

### 1. Async Harvesting: Preserving Original Semantics

The first step is extracting metadata from a CKAN portal. We could do this with a simple sequential script that reads 100 datasets, then another 100. That would be inefficient for portals with tens of thousands of records. Ceres uses Tokio for parallel requests:

```rust
// Fetch list of all dataset IDs from the portal
let ids = ckan.list_package_ids().await?;

// Process datasets concurrently (10 at a time)
let results: Vec<_> = stream::iter(ids.into_iter())
    .map(|id| {
        let ckan = ckan.clone();
        let gemini = gemini_client.clone();

        async move {
            // Fetch dataset details
            let ckan_data = ckan.show_package(&id).await?;
            let mut new_dataset = CkanClient::into_new_dataset(ckan_data, &portal_url);

            // Generate embedding from title + description
            let combined_text = format!(
                "{} {}",
                new_dataset.title,
                new_dataset.description.as_deref().unwrap_or_default()
            );

            if !combined_text.trim().is_empty() {
                new_dataset.embedding = Some(Vector::from(
                    gemini.get_embeddings(&combined_text).await?
                ));
            }

            repo.upsert(&new_dataset).await
        }
    })
    .buffer_unordered(10)  // 10 parallel requests
    .collect()
    .await;
```

Three critical choices in this approach:

**Controlled concurrency**: `buffer_unordered(10)` processes 10 datasets in parallel. Enough to saturate the network, not too much to overload CKAN or Gemini APIs.

**Atomic upsert**: Each dataset is inserted or updated based on the pair `(source_portal, original_id)`. If a dataset already exists, it gets updated; otherwise it's created.

**Complete metadata preservation**: You don't save just title and description. Ceres maintains a `metadata` JSONB field containing custom attributes. If a portal adds `budget_year: 2024` or `department: Finance`, they remain available for subsequent filtering.

### 2. Embedding Generation: Simplicity and Effectiveness

Once metadata is collected, Ceres generates embeddings using Google Gemini (`text-embedding-004`, 768 dimensions). The approach is deliberately simple: concatenate title and description into a single text and generate a single vector.

```rust
let combined_text = format!(
    "{} {}",
    dataset.title,
    dataset.description.as_deref().unwrap_or_default()
);

let embedding = gemini.get_embeddings(&combined_text).await?;
```

Why not use differentiated weights per field? In practice, modern embedding models already capture semantic structure. A clear title naturally dominates because it appears first and contains the most salient terms. Adding complexity (weights, multiple concatenations) rarely improves results significantly, but increases API costs.

This choice reflects the philosophy you've seen with Lakekeeper: metadata is not a consequence of other decisions, it's the foundation on which you build the architecture.

### 3. Hybrid Storage in PostgreSQL

The third block is where you store vectors and metadata. A conscious choice: no external vector engine. PostgreSQL + pgvector.

```sql
CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    original_id VARCHAR NOT NULL,
    source_portal VARCHAR NOT NULL,
    url VARCHAR NOT NULL,

    title TEXT NOT NULL,
    description TEXT,
    embedding vector(768),
    metadata JSONB DEFAULT '{}'::jsonb,

    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_portal_original_id UNIQUE (source_portal, original_id)
);

-- HNSW index for fast vector search
CREATE INDEX ON datasets USING hnsw (embedding vector_cosine_ops);
```

The hybrid design (vectors + JSONB) enables:

**Refined semantic filters**: Retrieve top 10 by similarity, then filter by license or year with `metadata->>'license' = 'CC-BY'`.

**Temporal audit trail**: `first_seen_at` tracks when a dataset first appeared; `last_updated_at` when it was last updated. Useful for freshness analysis.

**HNSW for speed**: The HNSW (Hierarchical Navigable Small World) index is faster than IVFFlat for approximate nearest neighbor queries, with minimal precision trade-off.

## The Necessary Evolution: Delta Harvesting

Today Ceres performs a full-sync on each harvest: it downloads all datasets from the portal and regenerates all embeddings. With 50k datasets, each run costs about $3.75 in Gemini API. For daily updates, we're talking about ~$112/month just for embeddings—sustainable, but not optimal.

The natural evolution is **delta harvesting**: regenerating embeddings only for actually modified datasets. The idea is simple:

1. Calculate a `content_hash` (SHA-256 of title + description) for each dataset
2. On the next harvest, compare the existing hash with the new one
3. If identical → skip embedding, update only `last_updated_at`
4. If different → regenerate embedding and save the new hash

The economic impact is significant. Take a portal with 50k datasets and ~100 modifications per week (a realistic pattern for an active public administration). With full-sync: 50k embeddings × 52 weeks = 2.6 million API calls per year. With delta harvesting: 100 embeddings × 52 = 5,200 calls per year. **99.8% savings**.

This feature is on Ceres roadmap. The database structure is already prepared: the `metadata` JSONB field can host the content hash without schema changes. Implementation mainly requires application logic in the harvester.

## Use Cases That Actually Happen

**Citizen Discovery**: A Milan citizen searches for "Milan traffic". With pure full-text search on the official dataset "Flussi_veicoli_viabilità_RTB", they get zero results. With Ceres, the system understands they're looking for vehicle movement information in the city and returns the correct dataset.

**Interdisciplinary Research**: An epidemiologist at Politecnico searches for "environmental factors correlating with respiratory diseases". They don't know which datasets exist. Ceres semantically proposes related ones: air quality, urban green spaces by zone, population density, industrial density, aggregated hospital data. The idea isn't "find a dataset", but "discover a space of relevant data".

**Cross-Portal Aggregation**: An urbanist studying "public spaces" wants results from Milan, Rome, and Florence simultaneously. A single query returns datasets from all three portals, ranked by semantic relevance regardless of source.

## Cost-Conscious Effectiveness

One of the key reasons Ceres uses Google Gemini (not GPT-4 or alternative models) is **economic pragmatism**.

**Initial setup for 50k datasets**: Gemini API (~$3.75 for embeddings) + PostgreSQL t3.small (~$20/month) = **~$24 total** for first indexing.

**Recurring cost (monthly)**: With delta harvesting (future), only embeddings for new/modified datasets (~$0.10-0.50) + PostgreSQL infrastructure ($20) = **~$20-21/month**.

Compare with alternatives: Pinecone costs $48-150/month, Weaviate $60-200/month for the same volume. Ceres comes in at **1/5 the cost** of cloud-only solutions.

This isn't accidental. It's a deliberate decision to use PostgreSQL as the first choice, not as a fallback. A public administration or small-to-medium organization shouldn't need financial workarounds to have decent semantic search.

## Explicit Limitations and Future Directions

Being honest about limits is part of a project's growth:

**What it doesn't do (yet)**:

- **Offline**: Depends on live Gemini API. If Google has an outage, Ceres can't generate embeddings.
- **Delta harvesting**: Currently each harvest regenerates all embeddings. The optimization described above is planned but not yet implemented.
- **Sophisticated re-ranking**: Final ranking is purely by cosine similarity. Doesn't account for dataset freshness or user popularity.
- **Cross-portal deduplication**: If Milan and Rome upload the same ISTAT dataset, Ceres treats them as separate.
- **Advanced multilingualism**: Gemini handles Italian well, but there's no automatic translation for cross-language queries yet.

**Future directions**:

- **Delta/incremental harvesting**: Regenerate embeddings only for modified datasets (described above).
- **Lazy re-indexing**: When a new embedding model version comes out, regenerate only for the most searched datasets.
- **Multilingual translation**: Translate queries and content to a pivot language to improve cross-language retrieval.
- **Hybrid search**: Combine semantic search with PostgreSQL full-text as fallback.
- **Lakekeeper integration**: Combine semantic similarity with data quality score from the catalog.

## Why Ceres Deserves Attention

In the European open data landscape, CKAN dominates as a platform. Hundreds of public portals (local and national public administrations, international organizations) use it. But they remain for the most part **discoverable only to experts**: people who know how to navigate metadata, tags, taxonomies.

Ceres doesn't change the data format. It doesn't touch CKAN directly. It adds a semantic layer that makes data discoverable even for those who don't speak the administration's "technical language".

The Rust implementation guarantees performance, low memory overhead, and deployment simplicity (a single binary, no runtime complexities). Tokio handles asynchrony for parallel harvesting. PostgreSQL is stable, well understood, doesn't require specialists.

The project is young and open source. The code is available on [GitHub](https://github.com/AndreaBozzo/Ceres). If semantic search, open data, and Rust attract you, there's room to collaborate.
