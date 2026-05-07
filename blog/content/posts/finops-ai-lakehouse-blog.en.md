---
title: "FinOps for AI Data Platforms in 2026: Databricks vs AWS-Native vs DIY Iceberg on Top of Your Warehouse"
date: 2026-05-07T12:00:00+02:00
draft: false
tags: ["Data Engineering", "FinOps", "Databricks", "AWS", "Apache Iceberg", "Lakehouse", "AI", "Streaming"]
categories: ["Data Engineering", "FinOps"]
description: "A FinOps-first comparison of Databricks, AWS Glue/Athena with Iceberg, and a DIY Iceberg stack for adding AI/ML and streaming on top of an existing warehouse, with 2026 USD/EUR cost anchors."
summary: "Three lakehouse stacks for adding AI/ML and streaming on top of an existing warehouse, compared through a FinOps lens: DBUs, DPUs, TB-scanned, S3 GB-month, and egress, walked through real workload patterns with 2026 prices."
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
    image: "images/FinOps-Lakehouse-Cover.png"
    alt: "FinOps for AI Data Platforms 2026"
    caption: "Databricks vs AWS-Native vs DIY Iceberg, through a FinOps lens"
    relative: false
    hidden: false
---

## Introduction

Most conversations I have with founders and platform leads these days follow the same shape. There is already a warehouse — Snowflake, Redshift, BigQuery, sometimes Postgres pretending to be one — and it is not going anywhere. Around it, three pressures piled up almost simultaneously: cheaper history on object storage, AI/ML feature pipelines that need to feed training and serving, and some flavor of streaming or near-real-time analytics. Pick any startup with a serious data footprint in 2026 and you will hear a version of "we need a lakehouse next to the warehouse, without our cloud bill exploding."

This is the FinOps-first version of that conversation. Three families keep coming up: Databricks, AWS-native (Glue + Athena + Iceberg, including S3 Tables), and a DIY Iceberg stack with engines like Spark, Flink, and Trino. I want to look at how their pricing primitives behave when mapped onto AI/ML and streaming workloads, not at which vendor wins on a feature matrix. Numbers are in USD with rough EUR conversions for European readers, using a 2026 year-to-date average of 1 EUR ≈ 1.17 USD.

Short version: Databricks is the most integrated AI platform and the one where bills are hardest to predict; AWS-native is the path of least resistance if you are already deep in AWS and value serverless; DIY Iceberg gives you the best long-term unit economics, but only if you have the platform engineers to run it. The work is figuring out which of those constraints binds first for your team.

## The Decision Frame: Warehouse + Lakehouse, Not Warehouse vs Lakehouse

The starting point matters. The teams I talk to almost never want to rip out their warehouse. The warehouse is where finance and product analytics live, where dashboards have stabilized, where SQL skills are concentrated. They want a second tier of storage and compute that handles three things the warehouse does badly or expensively: storing years of raw and semi-structured history at object-storage prices, training and serving ML and gen-AI features over that history, and ingesting streams with seconds-level freshness instead of micro-batch ELT every fifteen minutes.

That changes the comparison. The right question is not "Databricks vs Snowflake" or "Athena vs BigQuery" in isolation. It is "what is the marginal cost of bolting an AI/streaming-capable lakehouse onto a warehouse you are keeping," with the understanding that some workloads will migrate over time and others will stay. The three options below answer that question, but they answer it with different pricing primitives and different assumptions about your team.

## Pricing Primitives You Need in Your Head

Before getting into stacks, the unit economics of the layers underneath everything else are worth internalizing. These are the numbers I reach for in conversations, and they translate directly into back-of-the-envelope estimates for the workload patterns later on.

**Databricks DBUs.** Independent 2026 pricing guides put real-world DBU rates in a wide band, roughly 0.07 to ~0.95 USD per DBU-hour depending on workload class and tier. Jobs Compute (classic) and Lakeflow Declarative Pipelines core sit toward the lower end; serverless SQL warehouses and serverless all-purpose compute sit at the top. Counterintuitively, Model Serving DBUs are among the cheapest in the catalog — the cost of Mosaic AI workloads tends to come from token-based foundation-model usage and underlying GPU compute, not from the DBU rate itself. In EUR that is roughly 0.06 to 0.81 EUR per DBU-hour. DBUs stack on top of underlying EC2/Azure/GCP infrastructure costs, so the platform fee is one column in a two-column bill. Pre-purchase commitments of one to three years can take up to ~37% off list, but only if you can predict consumption — which most teams cannot during the first year.

**AWS Glue DPUs.** Glue ETL and crawlers bill per DPU-second with a one-minute minimum. Standard execution is 0.44 USD per DPU-hour (~0.38 EUR), and the Flex tier for non-urgent jobs drops to 0.29 USD per DPU-hour (~0.25 EUR). AWS's canonical example, a 15-minute Spark job at 6 DPUs, works out to 0.66 USD. That number is small enough to feel comfortable until you multiply it by hundreds of jobs across many tables, which is what happens once a feature platform takes shape.

**Athena queries.** On-demand SQL is the famous 5.00 USD per TB scanned (~4.27 EUR/TB), with a 10 MB minimum per query against federated data sources. Capacity reservations come in at 0.30 USD per DPU-hour with a 24-DPU minimum and per-minute billing, and Athena Spark sits at 0.35 USD per DPU-hour. Partition pruning, columnar formats, and Iceberg metadata pruning are not optional optimizations here; they are the difference between an affordable analytics layer and a runaway bill.

**S3 storage and egress.** S3 Standard in regions comparable to eu-central-1 is around 0.023 USD per GB-month, or ~23 USD per TB-month (~20 EUR). Egress surprises people more often: moving data out of an AWS region typically starts around 0.09 USD per GB, so a single terabyte leaving the region costs roughly 90 USD — more than three months of storage for that same TB. In the new AWS European Sovereign Cloud (launched January 2026 with the Brandenburg region), list prices are quoted directly in EUR and run roughly 15–17% higher than comparable eu-central-1 prices; that gap matters for European teams with regulatory constraints.

Two things follow. The platform markup on top of raw infrastructure varies enormously: a DIY stack pays close to bare infra prices, AWS-native pays a moderate Glue/Athena premium, Databricks layers DBUs on top of everything. And egress and cross-region movement are the silent line items — they punish architectures that bounce data between clouds and reward stacks where compute lives in the same region as storage.

## Option 1: Databricks (Delta + Mosaic AI)

Databricks is the option founders mention first when they say "we want one tool that does everything." The platform does cover the full surface from ingestion to model serving, and the integration is tight enough that an ML engineer can go from a Delta table to a deployed agent without leaving the workspace. Mosaic AI bundles model training, an agent platform (Agent Bricks, the successor to the original Agent Framework), vector search, an AI gateway (now Unity AI Gateway, brought under Unity Catalog governance), and model serving into the lakehouse; MLflow handles experiment tracking and the registry; the Feature Store with online serving plugs into Unity Catalog for governance and lineage. Spark Structured Streaming with Photon gives a unified batch-and-stream API on the same Delta tables, with seconds-level micro-batches that are good enough for most feature pipelines.

![Databricks DBU stack](images/Databricks-DBU-Stack.png "Databricks DBU classes — Jobs, SQL, Serverless, Mosaic AI — stacked on shared EC2 infrastructure")

Cost is where Databricks gets harder to reason about. The DBU is not a single price, it is a family of prices that depends on workload class. Jobs DBUs are cheap, SQL warehouse DBUs more expensive, serverless SQL and serverless all-purpose DBUs the most expensive of the lot. A typical mid-sized team I have spoken to reports monthly Databricks platform charges in the 500 to 5,000 USD range — roughly 430 to 4,270 EUR — *before* underlying compute costs are added. The bill becomes hard to forecast because four or five DBU buckets are filling at once, and serverless autoscaling can quietly push you up the curve.

This is where FinOps discipline matters more on Databricks than on the other two options. Cluster policies, job timeouts, instance pool sizing, photon-on-or-off decisions, serverless SQL warehouse min/max, Mosaic AI quota controls — all are levers that need owners. Without them, the platform's frictionlessness becomes its own cost. With them, Databricks can be very competitive, especially when you can consolidate enough warehouse workloads into the lakehouse to amortize the platform fee across a wider footprint.

Delta as a format is excellent inside Databricks: Photon, Liquid Clustering (now the recommended default over Z-Order for new tables), auto-compaction, and Predictive Optimization extract real performance. Outside Databricks, Delta works but is clearly a second-class citizen compared to inside; multi-engine flexibility — what Iceberg now does well — is not Delta's strength, even with UniForm bridging Delta to Iceberg readers. If you expect Trino, Flink, Snowflake, and bespoke services all hitting the same tables, that points away from this option.

Databricks fits when the team is willing to consolidate workloads onto the lakehouse, when AI/ML velocity is the dominant business pressure, and when there is real budget and headcount for FinOps governance. It fits worst when the warehouse is staying primary and you only want a thin lakehouse tier next to it; in that posture you pay for a lot of platform you do not yet use.

## Option 2: AWS-Native (Glue + Athena + Iceberg / S3 Tables)

The AWS-native path is the one I see chosen most often by lean teams that are already on AWS and do not want a new vendor relationship. Architecturally it is familiar: S3 is the lake, Glue handles ETL/ELT and the catalog, Athena queries the lake against Iceberg tables, SageMaker carries the ML lifecycle. Increasingly, AWS is bundling Glue Data Catalog and Lake Formation under the broader **SageMaker Lakehouse** umbrella, with an AWS Glue Iceberg REST Catalog API and federated catalog support — the AWS-native answer to "give me one unified catalog layer," not just "Glue plus whatever." AWS has been publishing migration case studies in this direction, including teams replacing Databricks/Delta with Glue jobs writing Iceberg tables on S3 and Athena slicing them dynamically for training. The pitch is straightforward: serverless pricing, no long-running clusters, IAM as the unifying identity layer.

S3 Tables is the new and interesting piece. It is fully managed Iceberg storage on S3, with automatic compaction, snapshot management, and tighter Glue Data Catalog integration. AWS quotes "up to 3x faster query throughput and 10x higher transactions per second" versus self-managed Iceberg on raw S3, which is a real benefit for teams that do not want to own compaction. The catch is the maintenance cost layer: Onehouse's 2025 benchmark on small-file-heavy Iceberg writes originally found self-managed EMR compaction roughly 29x cheaper than S3 Tables. After AWS's July 2025 S3 Tables price cut (compaction down 80–90% per byte, 50% per object), Onehouse's updated numbers put the gap at roughly 3x. Still meaningful, no longer order-of-magnitude, and the benchmark was deliberately small-file-heavy in a way that favors self-management; results shift with file-size distribution and write cadence.

The unit economics are easier to reason about than Databricks. A 15-minute Glue Spark job at 6 DPUs is 0.66 USD; multiply by job count and frequency to size your ETL bill. Athena queries at 5.00 USD per TB scanned (~4.3 EUR/TB) are forgiving as long as tables are partitioned and stored in Parquet or Iceberg. Capacity reservations help once query volume is predictable enough to commit to a baseline. S3 storage at 23 USD per TB-month is the floor; S3 Tables maintenance fees sit on top depending on how often data is rewritten.

Where this option fights the other two is integration depth. Glue is strong on managed defaults, weak on knob-level tuning compared to Databricks; there is no Photon-equivalent engine for Athena SQL when concurrency or join complexity gets nasty. The ML side is also less integrated: SageMaker is a serious platform, but stitching it to Glue, Athena, Step Functions, and EventBridge into a coherent feature-and-model lifecycle is composition work your team has to do. The win is that nothing about this composition is exotic — most teams already on AWS know how to wire those services together.

AWS-native works well when the existing warehouse and analytics are concentrated in AWS, when the platform team is small enough that "fewer moving vendors" outweighs "best-in-class AI UX," and when the AI/ML workload is real but not the daily center of gravity. It works less well when you need first-class multi-cloud, or when the team is already standardized on tools that live outside AWS.

## Option 3: DIY Iceberg + Engines (Spark / Flink / Trino)

The third option is the one I find most interesting personally, and the one I am most cautious about recommending. A DIY Iceberg stack typically looks like this: object storage (S3 or compatible), Apache Iceberg as the table format, a catalog of your choice (Glue, Hive Metastore, or REST catalogs like [Lakekeeper](https://andreabozzo.github.io/AndreaBozzo/blog/posts/lakekeeper-blog.en/), Nessie, or Apache Polaris — which graduated to a top-level Apache project in February 2026), and one or more engines on top — Spark for batch, Flink for streaming, Trino or Presto for interactive SQL, possibly DuckDB or DataFusion for embedded analytics. ML and AI tooling is whatever you already standardize on (MLflow, KServe, custom services), wired into engines via open interfaces.

![Three lakehouse stacks compared](images/Lakehouse-Three-Stacks.png "Databricks, AWS-Native, and DIY Iceberg stacks over a shared S3-compatible object storage layer")

The argument for this stack in 2026 is that the open-format war is over and Iceberg has won. Multi-engine compatibility is no longer a future promise; Spark, Flink, Trino, Presto, Snowflake, Dremio, RisingWave, and a growing number of Rust-native systems all read and write the same Iceberg tables today. Once you accept that, the lock-in question moves up a layer. The file format does not trap you anymore; the catalog and surrounding platform services do. Choosing your catalog and committing to it deliberately is the most important architectural decision in this option.

The cost story is the simplest of the three on paper and the hardest in practice. There is no DBU, no DPU markup beyond what the engines themselves charge for compute. You pay S3 storage, S3 requests, EMR or EKS or self-managed Kubernetes for compute, and minor catalog fees if you run a managed catalog. At scale this is materially cheaper than the other two. The reason it is not the obvious answer is that Iceberg performance depends on continuous maintenance: compaction strategies, snapshot expiry, small-file repair, partition statistics. Get any of those wrong and your query times degrade, your storage costs creep up, and your team spends Friday afternoons tuning instead of shipping.

That maintenance burden is what managed Iceberg services like S3 Tables, Starburst-managed Iceberg, and several others are selling. They reintroduce a platform fee to take the operational pain away. The DIY question splits in two: pure DIY (cheapest, hardest) or hybrid DIY with a managed catalog and managed table maintenance (still cheaper than Databricks, much easier than full DIY)? The answer depends on whether you have a platform guild that wants to own JVM engines, Kubernetes, and lakehouse internals, or whether you would rather pay someone to handle compaction.

For streaming, the DIY route shines. Flink + Iceberg is the canonical pattern for sub-second event-time processing into the lakehouse, and the Kafka → Flink → Iceberg pipeline is well-established enough that experienced streaming engineers can stand it up in a couple of weeks. If you have read my [RisingWave article](https://andreabozzo.github.io/AndreaBozzo/blog/posts/iceberg-risingwave-blog.en/), you know I think the Rust-native variants of this pattern (RisingWave + Iceberg-Rust + Lakekeeper + DataFusion) are particularly compelling for teams that want to escape JVM-heavy operations entirely.

## Three Workload Patterns, Three Bills

Pricing primitives only become useful when mapped to actual workload shapes. The patterns below are the ones I find myself sketching most often on whiteboards. None are precise TCO models; they are directional, and they assume well-tuned baselines for each stack.

### Pattern 1: Batch Feature Pipelines + Weekly Model Retraining

The canonical AI/ML workload: nightly ETL jobs build feature tables, a weekly job retrains a model, an offline evaluation runs against held-out data, the model is deployed to a serving stack.

On Databricks this lives naturally. Lakeflow Declarative Pipelines (the rebranded Delta Live Tables) and Lakeflow Jobs handle the feature pipelines; notebooks and SQL warehouses serve the exploratory phase; Mosaic AI carries training and serving. Platform cost depends on how disciplined the team is — a well-governed mid-sized team in this pattern typically lands somewhere in the 500–5,000 USD/month range for DBUs (~430–4,270 EUR) before EC2. The undisciplined version is much higher, mostly because of always-on SQL warehouses and oversized all-purpose clusters.

On AWS-native, the same workload fragments into many small Glue jobs and Athena queries. Each job is cheap individually (the 0.66 USD canonical example), but the total bill is dominated by job count and total TB scanned during exploration. Storage and Glue runtime are predictable; Athena is the variable cost, and a poorly partitioned table shows up immediately. SageMaker training is a separate line item using familiar EC2-style pricing. For the same effective workload, the bill tends to be flatter and easier to forecast than Databricks, though sometimes higher in absolute terms once SageMaker is added.

On DIY Iceberg, cost is dominated by EMR or Kubernetes nodes running Spark for the feature pipelines, plus S3 storage and requests, plus whatever the team uses for ML lifecycle. There is no platform surcharge. At scale this can be the cheapest option by a wide margin — but only if the platform team is genuinely covering the cost of running their own compaction and catalog. If they are not, you pay in degraded performance and Friday-afternoon firefighting instead of in invoices, and that is often worse.

### Pattern 2: Ad-Hoc Analytics and Notebook-Heavy Experimentation

The workload that most surprises teams in the bill: data scientists exploring, running queries against everything, leaving notebooks open, retraining things informally.

Databricks is the most ergonomic of the three for this and the most dangerous on cost. Always-on serverless SQL warehouses and lingering all-purpose clusters generate DBUs whether anyone is actually working or not. Cluster policies, idle timeouts, and quota controls are not optional.

Athena is built for this pattern. Pay-per-query at 5 USD per TB scanned (~4.3 EUR/TB) is hard to beat for sporadic exploration, *if* tables are partitioned and columnar. The notebook UX is less integrated than Databricks, but Athena Spark and capacity reservations close some of that gap. For teams whose data scientists are comfortable with SQL-first workflows, this is often the cheapest place to do exploration.

DIY Iceberg with a shared Trino cluster gives sub-second SQL over Iceberg with predictable node-hour billing and no per-query surcharge. The pain point is that "right-sized" requires actual capacity planning, and Jupyter or similar notebook environments need to be hosted separately. Teams that already run Trino tend to love this pattern; teams that do not find themselves doing more platform work than expected.

### Pattern 3: Real-Time or Low-Latency Feature Pipelines

The workload everyone wants in the architecture diagram and few teams actually need at sub-second latency.

Databricks Structured Streaming on Delta handles seconds-level micro-batches well, which is sufficient for most real-time feature pipelines I see in practice. Sub-second serving is usually delegated to an external online store; Mosaic AI vector search covers RAG-style serving inside the platform. Cost is roughly continuous DBU consumption at jobs or DLT rates, plus underlying compute, which becomes predictable once the streaming jobs stabilize.

AWS-native uses Glue Streaming (Spark-based) plus Kinesis or MSK for ingestion into Iceberg, with online stores like DynamoDB or ElastiCache for serving. It works, but composition cost is real: orchestration, observability, and exactly-once semantics across multiple services add operational weight. Athena is not a serving path; it is the analytics query layer over the streamed data.

DIY Iceberg with Flink is the strongest technical option for genuinely low-latency event-time processing. Sub-second pipelines are achievable, exactly-once semantics are well-understood, the Kafka → Flink → Iceberg pattern is mature. The cost is operational: Flink is not gentle, and running it well is a specialized skill. For teams that have it, the unit economics are excellent. For teams that do not, Databricks or AWS-native streaming will get them to "good enough" much faster.

## A Practical Decision Filter

Cost matrices and feature comparisons are useful, but the choice usually comes down to a smaller set of forcing functions. From conversations over the last several months, three filters tend to settle the question quickly.

![Lakehouse decision funnel](images/Lakehouse-Decision-Funnel.png "Three filters that usually settle the lakehouse choice: team shape, warehouse footprint, portability appetite")

**Team shape, not workload.** A small team that already speaks AWS fluently and wants one less vendor will get more done on AWS-native than on Databricks, even when Databricks looks objectively better on paper. A team with a real platform guild that enjoys running JVM engines will get more leverage out of DIY Iceberg than out of either managed option. A team that wants AI/ML velocity above everything else and can afford the platform fee will move fastest on Databricks.

**How much of the warehouse is staying.** If the warehouse will keep most analytical workloads for the foreseeable future, the lakehouse tier should be lean and cheap, which pushes toward AWS-native or DIY Iceberg. If the lakehouse is going to absorb increasing share over time, paying for a more integrated platform like Databricks amortizes better.

**Portability appetite.** If multi-engine and multi-cloud are credible future requirements — and for many European teams in 2026 they are, partly for sovereignty reasons — Iceberg as the substrate is the safer bet, and the choice collapses to "AWS-native Iceberg with S3 Tables convenience" versus "DIY Iceberg with a portable catalog like Lakekeeper." Delta-on-Databricks is a harder sell in that posture.

## Where Lock-In Actually Lives in 2026

One pattern worth naming, because it changes how I now advise teams: **lock-in has migrated up the stack**. For most of the last decade, the table-format choice was the strategic decision — Delta or Iceberg or Hudi — and getting it wrong meant a painful migration later. That conversation is largely settled. Iceberg has effectively won as the open table format, with broad multi-engine support and active development across the ecosystem.

The lock-in conversation has moved one layer up. The decision that matters most now is the **catalog and platform layer**: Unity Catalog inside Databricks, SageMaker Lakehouse over Glue Data Catalog and S3 Tables inside AWS, or a portable open catalog like Lakekeeper, Nessie, or Apache Polaris if you want true neutrality. That is where governance, access control, lineage, and the AI control plane intersect, and that is where switching costs are highest in 2026.

This reframes the FinOps conversation. When you compare Databricks DBUs to Glue DPUs to bare EMR/EKS compute, you are not just comparing compute prices — you are comparing how much you are paying for the catalog and AI control plane sitting above the engines. Databricks bundles much of that platform value into the DBU; AWS unbundles it across Glue Data Catalog, IAM, Lake Formation, and SageMaker; DIY Iceberg lets you assemble it yourself or buy it piecemeal. None is universally right. Naming the trade explicitly — "what am I paying for above the engine?" — turns out to be the sharpest FinOps question you can ask of any of these stacks.

## Closing Thoughts

If I had to compress everything above into a single recommendation pattern: pick the stack that matches the constraint that binds first for your team, not the one that looks best on a feature matrix. For most early-stage teams I talk to, that constraint is platform-engineering capacity, and the honest answer is AWS-native with Iceberg and a deliberate catalog choice. For teams with real AI/ML pressure and the budget to match, Databricks earns its premium if you commit to FinOps discipline from day one. For teams with a strong platform guild and a multi-engine future on the roadmap, DIY Iceberg with a portable catalog will age best, and the unit economics will reward you for the operational investment.

The shift underneath all of this is that the open lakehouse is no longer a research bet. Iceberg is mature, the catalog ecosystem is filling out, and Rust-native components are starting to compete seriously with JVM-dominant defaults. That is good news for teams worried about lock-in, and good news for FinOps: when the substrate is genuinely portable, you negotiate from a stronger position on every layer above it.

I am curious which of these three patterns rings true for the team you are on right now. If you are working through one of these decisions and want a second pair of eyes — particularly on the FinOps modeling side — feel free to reach out.
