---
title: "Zerobus Ingest: when Unity Catalog becomes the sink"
date: 2026-07-05T12:00:00+02:00
draft: false
tags: ["Data Engineering", "Databricks", "Zerobus", "Rust", "Apache Arrow", "Unity Catalog", "Lakehouse", "Streaming"]
categories: ["Data Engineering"]
keywords: ["Zerobus Ingest", "Databricks", "Rust", "Apache Arrow", "Arrow Flight", "Unity Catalog", "Lakehouse", "Streaming", "Delta Lake"]
description: "A real Zerobus Ingest demo on Databricks: dedicated Unity Catalog catalog, managed Delta table on S3, Rust producer, JSON and Arrow Flight all the way to the sink."
summary: "In the dlt+dbt post the contract was a Unity Catalog schema. With Zerobus Ingest I moved the same question to the producer edge: when the sink is already a governed Delta table, do you really need a bus in the middle?"
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
    image: "images/zerobus-cover.png"
    alt: "Zerobus Ingest, Rust producer, Unity Catalog sink"
    caption: "Rust producer, Zerobus Ingest, Unity Catalog governed Delta table"
    relative: false
    hidden: false
---

In the [previous post on dlt + dbt](/AndreaBozzo/blog/posts/dlt-dbt-unity-catalog-blog/) I had landed
on a shape I liked precisely because it was so unspectacular: `dlt` wrote raw tables, `dbt` built on
top, and the contract between the two was not an always-on service but a **Unity Catalog schema**.

This post starts from the same exposed nerve, just closer to the edge of the system. If the sink is
already known, governed and transactional — that is, a Delta table in Unity Catalog — how much
infrastructure still needs to sit between it and the producer?

The short answer is that the bus does not magically disappear. It changes jobs. And in some cases its
job is no longer being Kafka.

![Zerobus cover](/AndreaBozzo/blog/images/zerobus-cover.png "Rust producer, Zerobus Ingest, Unity Catalog governed Delta table")

## The Kafka reflex

For years the mental default for streaming has been: producer, topic, partitions, registry, consumer
groups, connectors, sink. And it often makes sense. If you have fan-out, replay, independent
consumers, retention semantics, backfill and different teams reading the same event on different
timelines, Kafka or something like it is not a detail: it is the product.

But there is a much narrower and very common class of workloads: sensors, collectors, gateways or
application services that only need to push fresh events into a lakehouse table. They are not
publishing a multi-consumer event domain. They are feeding a governed analytical sink.

[Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-overview) sits exactly in that
space: a serverless push API that writes directly into Unity Catalog Delta tables. The part that
interests me is not "fewer components" in the abstract. It is more precise: when the producer already
knows that the contract is the table, Unity Catalog stops being just the place where data lands and
becomes part of the ingestion protocol.

![Kafka-style flow vs Zerobus direct ingest](/AndreaBozzo/blog/images/zerobus-before-after.png "Traditional default vs single-sink path")

This is the connection with my recent posts:

- in the dlt+dbt post, Unity Catalog was the boundary between ingestion and transformation;
- in the posts on Arrow, DataFusion and tabular pipelines, the point was not losing columnar
  structure the moment data becomes interesting;
- in the Rust posts, from Lakekeeper to Zero Grappler, the recurring theme was using Rust where the
  boundary is tight: network, memory, schema, back-pressure.

Zerobus puts all three into the same small experiment.

## What actually changes

The Databricks documentation describes Zerobus as a service that opens direct streams towards a
target table: the client builds messages compatible with the table schema, the service makes them
durable, acks the client, and then materializes them into Delta.

The important phrase is "compatible with the table schema". Zerobus does not create the table for
you, does not decide the contract and does not do automatic schema evolution. The table is the
authority.

This shifts responsibility in a clean way:

1. **The producer does not send generic messages.** It sends records for a specific table.
2. **Unity Catalog is not a passive catalog.** It is the point where authorization, schema and
   storage meet.
3. **A stream is not a topic.** A stream writes to one table; ordering is guaranteed per stream, not
   if you round-robin messages across different streams.

In my case I used the [Rust SDK](https://docs.rs/databricks-zerobus-ingest-sdk/latest/databricks_zerobus_ingest_sdk/)
with the `arrow-flight` feature enabled:

```toml
[dependencies]
arrow-array = "58.3.0"
databricks-zerobus-ingest-sdk = { version = "2.3.0", features = ["arrow-flight"] }
dotenvy = "0.15"
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time"] }
uuid = { version = "1", features = ["v4"] }
```

I did the first pass with JSON, to validate credentials, endpoint and permissions without adding
Arrow friction right away. Then I did the real pass with `RecordBatch` and Arrow Flight.

## The part that bit me: default storage

The demo was supposed to be trivial: create a managed Delta table in the workspace, grant
`USE CATALOG`, `USE SCHEMA`, `MODIFY` and `SELECT` to the service principal, then launch the
producer.

The first useful error was this:

```text
InvalidArgument: Unsupported table kind.
Tables created in default storage are not supported.
Error Code: 4024
```

This is the kind of error that is worth a post. The table was managed. It was Delta. It was in Unity
Catalog. But it was not in the kind of storage Zerobus accepts.

The limitation is explicit on the official
[Zerobus Ingest limits page](https://docs.databricks.com/aws/en/ingestion/zerobus-limits): it only
writes to managed Delta tables, but not on default storage. So I created a catalog dedicated to the
demo, `zerobus_demo`, with an S3 managed location registered through a storage credential and an
external location. The Unity Catalog documentation on
[managed storage locations](https://docs.databricks.com/aws/en/connect/unity-catalog/cloud-storage/managed-storage)
explains the point: for a standard catalog, the `MANAGED LOCATION` has to live inside an external
location.

The final sequence was: a dedicated S3 bucket in `us-east-2` (same region as the workspace, another
Zerobus requirement), a storage credential with an IAM role, the `zerobus_demo_location` external
location, the `zerobus_demo` catalog created with that `MANAGED LOCATION`, an `events` schema, then
the managed Delta table.

```sql
CREATE SCHEMA IF NOT EXISTS zerobus_demo.events;

CREATE OR REPLACE TABLE zerobus_demo.events.rust_telemetry_events (
  event_id STRING,
  device_id STRING,
  event_time_ms BIGINT,
  batch_id STRING,
  sequence_num BIGINT,
  temperature_c DOUBLE,
  humidity_pct DOUBLE,
  battery_pct DOUBLE,
  source STRING
)
USING DELTA;
```

I gave the demo service principal only the privileges it needed: `USE CATALOG` on the catalog,
`USE SCHEMA` on the schema and `SELECT, MODIFY` on the target table. Today
`databricks grants get table` on the table shows exactly those two privileges on the principal,
nothing else. The OAuth secret stayed in a local `.env` outside the repo.

One operational detail that cost me a few minutes: the external location had file events enabled by
default. This demo did not need them, and validation also asked for SNS/SQS permissions on top of S3.
I disabled file events on the location, and validation then passed on `READ`, `LIST`, `WRITE` and
`DELETE`.

```powershell
databricks external-locations update zerobus_demo_location `
  --json '{"enable_file_events":false}' `
  --skip-validation
```

At that point the same managed table became acceptable to Zerobus.

![Workspace receipt with successful JSON and Arrow Flight ingestion](/AndreaBozzo/blog/images/zerobus-catalog-explorer.png "Dedicated catalog, accepted ingest")

## The Rust producer

The producer is deliberately small: it reads the endpoint, workspace URL, table and OAuth client
credentials from `.env`, generates 64 synthetic telemetry events and pushes them into the table. A
single variable, `ZEROBUS_FORMAT`, picks the path: JSON or Arrow Flight. The full code, with the
table DDL and the minimal grants, is at
[github.com/AndreaBozzo/zerobus-rust-demo](https://github.com/AndreaBozzo/zerobus-rust-demo).

The JSON path is the one to use when you want to remove variables. It sends the 64 records one at a
time on the same stream, keeps the last offset and waits for the ack only at the end:

```rust
let sdk = ZerobusSdk::builder()
    .endpoint(&server_endpoint)
    .unity_catalog_url(&workspace_url)
    .build()?;

let mut stream = sdk
    .stream_builder()
    .table(table_name)
    .oauth(client_id, client_secret)
    .json()
    .max_inflight_requests(32)
    .build()
    .await?;

let mut last_offset = None;
for sequence_num in 0..ROWS {
    let record = telemetry_record(&demo, sequence_num);
    last_offset = Some(stream.ingest_record_offset(JsonValue(record)).await?);
}
if let Some(offset) = last_offset {
    stream.wait_for_offset(offset).await?;
}
stream.close().await?;
```

The terminal, after the catalog fix, finally said the boring thing I wanted:

```text
zerobus demo producer
format=json
table=zerobus_demo.events.rust_telemetry_events
batch_id=rust-json-a43bcfa6-133f-4ad8-bd78-423c86b6c437
acked_rows=64
status=ok
```

Then I changed only the format:

```powershell
$env:ZEROBUS_FORMAT = "arrow-flight"
cargo run
```

And the second pass landed in the same table:

```text
zerobus demo producer
format=arrow-flight
table=zerobus_demo.events.rust_telemetry_events
batch_id=rust-arrow-a33a4215-49e2-4c4b-8e17-4668e68279a2
acked_rows=64
status=ok
```

The verification query on the SQL warehouse:

```sql
SELECT
  source,
  count(*) AS rows,
  min(sequence_num) AS first_sequence,
  max(sequence_num) AS last_sequence,
  count(DISTINCT batch_id) AS batches
FROM zerobus_demo.events.rust_telemetry_events
GROUP BY source
ORDER BY source;
```

Result:

| source | rows | first_sequence | last_sequence | batches |
|---|---:|---:|---:|---:|
| `rust-sdk-arrow-flight` | 64 | 0 | 63 | 1 |
| `rust-sdk-json` | 64 | 0 | 63 | 1 |

## The receipt in the Delta log

The verification I liked most, though, is not the `SELECT`. It is `DESCRIBE HISTORY`, because it
shows what Zerobus looks like from the table's point of view:

| version | timestamp (UTC) | operation | engineInfo | isBlindAppend |
|---:|---|---|---|---|
| 2 | 2026-07-05 09:25:50 | WRITE | `Zerobus` | true |
| 1 | 2026-07-05 09:19:00 | WRITE | `Zerobus` | true |
| 0 | 2026-07-05 09:18:23 | CREATE OR REPLACE TABLE | `Databricks-Runtime/18.2.x-…-photon` | true |

Three commits. The first one is mine, from the SQL warehouse, and indeed it carries my user and the
runtime's engine. The other two are the producer's two passes, and they arrive with
`engineInfo=Zerobus`, no interactive user, as blind appends. Each producer run is exactly one Delta
commit: no scattered micro-batches, no orphan files to compact right away.

`DESCRIBE DETAIL` closes the loop on the AWS side:

```text
location    = s3://<demo-bucket>/zerobus-demo/catalog/__unitystorage/
              catalogs/0f88…/tables/c071…
numFiles    = 2
sizeInBytes = 8889
properties  = { "delta.parquet.compression.codec": "zstd", … }
```

The whole demo, on the bucket, is two zstd Parquet files totalling 8.9 KB. Volume was never the
point: the point is that the data sits in the dedicated catalog's S3 managed location, one file per
commit, and it got there without the producer knowing anything about buckets, paths or AWS
credentials.

One detail that makes "governed" concrete: I tried to `LIST` the table's S3 path directly from the
warehouse, as the catalog owner. Refused:

```text
INVALID_PARAMETER_VALUE.LOCATION_OVERLAP: Input path url 's3://…/tables/c071…'
overlaps with managed storage within 'ListFiles' call.
```

Unity Catalog does not let you go around the table to look at the managed location's files, not even
if you are the one who registered that location. Access goes through the contract, on write and on
read. That is exactly the property Zerobus leans on.

## Why Arrow Flight is interesting here

The documentation on
[Arrow Flight with Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-arrow-flight)
positions it as the third option next to JSON and Protobuf: you send Arrow `RecordBatch`es directly
to the same endpoint, with `DoPut` over gRPC.

In my demo the performance advantage is not the point: 64 rows measure nothing. The point is the
mental interface. If you are already aggregating data in columnar form, or you come from Polars,
DataFusion, pyarrow or `arrow-rs`, you do not have to fall back to row-by-row JSON just to get into
the lakehouse.

The Arrow path in the producer looks like this: same endpoint, same OAuth, but the stream is built
around an Arrow schema and the 64 events leave as a single `RecordBatch`:

```rust
let schema = Arc::new(ArrowSchema::new(vec![
    Field::new("event_id", DataType::LargeUtf8, true),
    Field::new("device_id", DataType::LargeUtf8, true),
    Field::new("event_time_ms", DataType::Int64, true),
    Field::new("batch_id", DataType::LargeUtf8, true),
    Field::new("sequence_num", DataType::Int64, true),
    Field::new("temperature_c", DataType::Float64, true),
    Field::new("humidity_pct", DataType::Float64, true),
    Field::new("battery_pct", DataType::Float64, true),
    Field::new("source", DataType::LargeUtf8, true),
]));

let mut stream = sdk
    .stream_builder()
    .table(table_name)
    .oauth(client_id, client_secret)
    .arrow(schema.clone())
    .max_inflight_batches(8)
    .build_arrow()
    .await?;

let offset = stream.ingest_batch(batch).await?;
stream.wait_for_offset(offset).await?;
stream.close().await?;
```

![RecordBatch to Delta via Rust SDK and Arrow Flight](/AndreaBozzo/blog/images/zerobus-rust-arrow-flight.png "RecordBatch to Delta via Arrow Flight")

I like it for the same reason I keep coming back to Arrow in posts about data systems: it is not a
"storage" format, and it is not just a library. It is a data plane. If a producer is born columnar,
keeping that shape all the way to the ingestion boundary reduces copies, conversions and the points
where the contract becomes implicit.

That said, Arrow Flight in Zerobus is still in beta. For simple, sparse, one-row-at-a-time traffic,
JSON or Protobuf remain more direct. Arrow becomes interesting when the batch is natural.

## The limitations to put before the demo

It is easy to sell yourself too clean a story here: "no Kafka, just an SDK, done". That is not the
right criterion.

These are the limits I would keep in front of the decision:

- **At-least-once delivery.** The producer needs an idempotency key or a dedup strategy if
  duplicates matter. In my schema `event_id` exists for this.
- **Ordering per stream.** Ordering is guaranteed within a stream; if you raise throughput by opening
  more streams and round-robin across them, you no longer have global ordering.
- **No auto-evolution.** Zerobus does not evolve the table. Adding nullable columns is manageable
  (missing fields become NULL), but schema and producer have to stay coordinated.
- **Managed Delta, not default storage.** This is the point I verified in the real workspace: a
  managed table in default storage is not enough.
- **Record size and quotas matter.** The per-record limit is 10 MB, and it also applies to every
  single row inside an Arrow `RecordBatch`. The documented quotas are 100 MB/s and 15,000 records/s
  per stream, 10 GB/s per target table; workspace and table must be in the same region.
- **The buffer is not retention.** Data that has been accepted but not yet materialized lives at most
  31 days in the service. It is not a log you re-read from: it is a delivery queue.
- **It is not an event bus.** If you need long replays, multi-team fan-out, independent consumers or
  retention as a product, you are still talking to Kafka, Kinesis, NATS, Pulsar or similar.

The criterion I would use is simple: if the event has a life of its own, use a bus. If the event
exists to land in a governed table and the rest of the platform reads from there, Zerobus deserves a
try.

## What I take away

The most instructive part was not writing the producer. That was pleasantly small. The interesting
part was the initial failure on default storage, because it forced me to make the demo's real
boundary explicit: storage credential, external location, managed location, catalog. All the AWS
plumbing that usually stays implicit became part of the contract.

In the dlt+dbt post the boundary was "a Unity Catalog schema between two tools". Here the boundary is
even earlier: the producer enters the governed world right away. It does not send a message to a
neutral place hoping a connector will interpret it later; it opens a stream towards a table with a
name, a schema, permissions and storage. And the Delta log records it like any other writer, with its
own identity.

This does not make Zerobus a universal answer. But it sharpens a question that matters outside
Databricks too:

> when the lakehouse is the real sink, do I actually want to keep a general-purpose bus, or do I want
> to move the contract to the producer edge?

For a platform with many consumers, the answer is still a bus. For a single-sink, governed,
high-volume pipeline, this demo convinced me it is worth having a second option.

## Sources

- [Zerobus Ingest connector overview](https://docs.databricks.com/aws/en/ingestion/zerobus-overview)
- [Use the Zerobus Ingest connector](https://docs.databricks.com/aws/en/ingestion/zerobus-ingest)
- [Use Arrow Flight with Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-arrow-flight)
- [Zerobus Ingest connector limitations](https://docs.databricks.com/aws/en/ingestion/zerobus-limits)
- [Databricks Zerobus Rust SDK docs](https://docs.rs/databricks-zerobus-ingest-sdk/latest/databricks_zerobus_ingest_sdk/)
- [Unity Catalog managed storage locations](https://docs.databricks.com/aws/en/connect/unity-catalog/cloud-storage/managed-storage)
