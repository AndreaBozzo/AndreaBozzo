---
title: "Lance Format and LanceDB: Columnar Storage for the Embedding Age"
date: 2026-04-07
draft: false
tags: ["lancedb", "lance-format", "embeddings", "apache-arrow", "data-engineering", "nats"]
categories: ["Data Engineering", "Open Source"]
keywords: ["lancedb", "lance-format", "embeddings", "apache-arrow", "data-engineering", "nats", "Data Engineering", "Open Source"]
description: "Lance is a columnar format built for ML workloads — fast random access, native vector indexing, and zero-copy Arrow integration. This article walks through the format, LanceDB, and wiring it into a live NATS stream."
summary: "Lance is a columnar storage format built for machine learning workloads — fast random access, native vector indexing, and zero-copy Arrow integration. This article walks through the format itself, how LanceDB builds on top of it, and how I wired it into a live NATS stream to build a simple semantic search layer over real-time events."
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
    image: "images/lanceformat-cover.png"
    alt: "Lance Format and LanceDB"
    caption: "Columnar storage for the embedding age"
    relative: false
    hidden: false
---

## Lance Format and LanceDB: Columnar Storage for the Embedding Age

I have been spending time lately looking at storage formats from the perspective of ML infrastructure rather than analytics. Most of my day-to-day work sits in the Arrow/DataFusion ecosystem, so when I wanted to add a vector search layer to a small event streaming project, my first instinct was to ask: is there a format that speaks Arrow natively, handles embeddings without a separate vector database, and doesn't require me to run a separate server?

Lance turned out to be that format. But before writing a single line of the bridge project I ended up building on top of it, I had already been inside the codebase as a contributor — and that is probably the most honest way to explain why I trust it enough to build on.

## Contributing Before Building

Two small PRs of mine landed in the [`lance-format/lance`](https://github.com/lance-format/lance) repo in January 2026.

[#5577](https://github.com/lance-format/lance/pull/5577) added a proper `Protocol`-based type hint for the `to_tensor_fn` parameter in `lance/torch/data.py`. The original annotation was a loose `Callable[[pa.RecordBatch], ...]` that did not capture the actual signature — specifically the optional `hf_converter` and `use_blob_api` keyword arguments. The fix introduces a `ToTensorFn` protocol that makes those explicit, which matters in a pydantic-heavy SDK where type annotations drive validation and IDE inference.

[#5739](https://github.com/lance-format/lance/pull/5739) fixed a Rust-level bug in `dataset/transaction.rs`. During compaction rewrites, the code would hard-error if an index UUID referenced in the compaction plan no longer existed — for example because a concurrent operation had already removed it — instead of gracefully skipping it. The fix replaces the `.ok_or_else(|| Error::invalid_input(...))?` pattern with a `let Some(...) else { continue }` guard, and adds a regression test to cover the case.

Neither of these is directly related to what I later built on top of Lance. The torch data loader path is nowhere near a NATS consumer, and the compaction edge case is something I only encountered later in practice. But digging through the codebase to find and fix them is exactly how I built enough confidence in the internals to know what I was building on top of.

## What Lance Is

Lance is an open-source columnar storage format designed specifically for ML workloads. It is _not_ Parquet with vector support bolted on — it makes a different set of tradeoffs:

- **Random-access at the row level** — Parquet is excellent for full-column scans but expensive for fetching individual rows (you have to decompress a full page). Lance stores data in a way that makes O(1) random row access cheap, which matters for training loops that sample mini-batches non-sequentially.
- **Native vector indexing** — Lance builds IVFPQ and HNSW indices directly into the format, not as a sidecar structure. There is no separate index server.
- **Zero-copy Arrow integration** — A Lance table is directly readable as an Arrow `RecordBatch`. No deserialization step, no format translation. The Lance Rust core uses Arrow's IPC memory layout directly.
- **Versioned, append-friendly** — Lance supports schema evolution and keeps versions of data natively, making it suitable as a "live" store rather than a write-once archive.

The on-disk structure uses a manifest file, a set of data fragments (`.lance` files), and an index directory. Each fragment is independently readable, which enables both parallel ingestion and partial scans.

## LanceDB on Top

LanceDB is the embedded database that wraps the Lance format. "Embedded" is the important word — it runs in-process, like DuckDB or SQLite, with no daemon to manage. You `lancedb.connect("./path")` and you are done.

The Python API is intentionally thin over the format:

```python
import lancedb

db = lancedb.connect("./data/my_db")
table = db.create_table("events", schema=MyLanceModel)
table.add(records)

results = table.search(query_vector).limit(10).to_arrow()
```

What the SDK adds on top of raw Lance: automatic embedding generation via registered models (the `get_registry()` API), full-text search indices backed by Tantivy, and a hybrid search mode that combines vector and keyword scores. All of this is available without running a separate service.

For teams already using Arrow — reading Parquet, running DataFusion queries, working with `pyarrow.RecordBatch` — the integration path is short. LanceDB tables are Arrow tables with an index layer.

## The Nephtys Bridge

The [lancedb-nephtys-bridge](https://github.com/AndreaBozzo/lancedb-nephtys-bridge) started as a question: if I have a NATS JetStream topic publishing Wikipedia edit events as JSON batches, can I index them into LanceDB with semantic embeddings in real-time with minimal code?

The answer is yes, and the code stays small. The core is a `LanceModel` schema:

```python
from lancedb.pydantic import LanceModel, Vector
from lancedb.embeddings import get_registry

model = get_registry().get("sentence-transformers").create(name="all-MiniLM-L6-v2")

class NephtysEvent(LanceModel):
    source_id: str
    timestamp: int
    text: str = model.SourceField()
    vector: Vector(model.ndims()) = model.VectorField()
```

`SourceField` tells LanceDB which column drives embedding generation. `VectorField` tells it where to store the output. When you call `table.add(records)`, the SDK automatically calls `compute_source_embeddings` on the `text` column and fills `vector` — no explicit embedding loop needed.

In the bridge, I compute embeddings explicitly in batches before insertion for better control over the embedding step, but the automatic path works identically for simpler use cases.

The NATS consumer normalizes incoming edit batches, filters out bot edits, builds a human-readable sentence per edit, and hands the resulting `NephtysEvent` objects to LanceDB. Timestamp normalization handles the fact that NATS payloads sometimes carry seconds-epoch values and sometimes milliseconds:

```python
async def message_handler(msg):
    data = json.loads(msg.data.decode())
    # ... filter, normalize, build event_rows ...
    vectors = model.compute_source_embeddings(texts_to_embed)
    records_to_insert = [
        NephtysEvent(
            source_id=row["source_id"],
            timestamp=row["timestamp"],
            text=row["text"],
            vector=vector,
        )
        for row, vector in zip(event_rows, vectors)
    ]
    table.add(records_to_insert)
    await msg.ack()
```

The result is a local Lance store that grows with the stream. At any point you can query it semantically:

```python
results = table.search(query_vector).limit(10).to_arrow()
```

No vector database cluster, no Redis, no Elasticsearch — just a directory on disk that speaks Arrow.

## What Running This Reveals

A few things that are not obvious from the documentation surface quickly in practice.

**Appends are cheap, compaction is not free.** Lance's append model works by writing new fragments. After many small appends — one NATS batch, one fragment — you accumulate a large number of fragments that degrade scan performance. The SDK exposes `table.compact_files()` for this, but you need to call it explicitly. In a production streaming scenario you would schedule compaction as a background job. This is the same small-file compaction problem that Iceberg users know well, and it is also where the bug fixed in [#5739](https://github.com/lance-format/lance/pull/5739) becomes relevant: if your compaction loop runs frequently enough, it can race with concurrent writes and hit index UUIDs that no longer exist. That fix makes the rewrite path resilient to that case.

**The embedding registry is convenient but opinionated.** `get_registry().get("sentence-transformers")` will download the model on first use and cache it locally. This is ergonomic for development but worth thinking about in a container environment where you want deterministic, pre-pulled model weights.

**Arrow round-trips are genuinely zero-copy.** `table.to_arrow()` returns a `pyarrow.Table` backed by memory-mapped buffers from the Lance files on disk. There is no deserialization — the Rust core uses Arrow's IPC memory layout directly, so reading back into Python is a pointer hand-off, not a copy.

**Vector search latency is competitive for local workloads.** On a small table (~50k rows) ANN search with IVFPQ was in the single-digit millisecond range without GPU. The index needs to be explicitly created after the first bulk load via `table.create_index()`, and it is rebuilt on significant data changes. For streaming ingestion, schedule index rebuilds periodically rather than after every write.

## Lance vs. Parquet for ML Storage

| Dimension | Parquet | Lance |
|---|---|---|
| Column scans | Excellent (vectorized, compressed) | Good, slightly less compressed |
| Random row access | Slow (page decompression) | Fast (O(1) via row offsets) |
| Vector indexing | None (external system needed) | Native IVFPQ / HNSW |
| Arrow integration | Via `pyarrow.parquet` (copy) | Direct (zero-copy) |
| Schema evolution | Limited (column add/drop) | Full versioning |
| Streaming appends | Expensive rewrite | Cheap (new fragments) |
| Ecosystem maturity | Very mature | Growing rapidly |

The short version: if your workload is analytics and ETL, Parquet is the right default. If your workload involves random-access training loops, embedding search, or live-updating vector indices, Lance makes real tradeoffs in your favor.

## Where This Fits in the Arrow Stack

From a data engineering perspective, what makes Lance interesting is not the vector search per se — you can do vector search with many tools. It is that Lance is a _format_ with Arrow as its first-class API, rather than a database that happens to expose an Arrow endpoint.

This fits naturally into a stack where you already use Arrow for inter-process communication (the C Data Interface), DataFusion for query execution, and Parquet/Iceberg for cold storage. LanceDB occupies the "hot vector store" layer in that stack: data arrives, gets embedded, and is immediately queryable — all without leaving the Arrow memory model.

If the [previous article on ML pipeline guardrails](../tabularmlpipes-blog/) was about keeping data clean before it reaches a model, this is the natural complement: once you have clean, embedded data, where do you put it so it stays queryable in real-time without a database cluster? For the Nephtys bridge use case, the answer is a directory on disk that the Lance format turns into a semantically queryable event log.