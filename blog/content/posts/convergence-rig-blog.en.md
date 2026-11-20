---
title: "Does the Replica Still Match? Disrupting a Postgres to Iceberg CDC Pipeline on Purpose"
date: 2026-11-20T16:30:00+01:00
draft: false
tags: ["PostgreSQL", "Apache Iceberg", "CDC", "Data Engineering", "AI Agents"]
categories: ["Data Engineering", "Open Source"]
description: "A local rig that disrupts a PostgreSQL 19 to Iceberg CDC pipeline and checks every row afterwards: REPACK held, a catalog outage stopped the pipeline, and a catalog restore left 209 wrong rows with zero errors."
summary: "I built a rig that breaks a Postgres to Iceberg pipeline on purpose and compares every row afterwards. The database held up. The catalog did not, once quietly."
author: "Andrea Bozzo"
showToc: true
TocOpen: false
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
    image: "images/convergence-rig-cover.webp"
    alt: "The orders_demo table in the Databricks Catalog Explorer, showing sample rows with ids, statuses, amounts and JSON payloads"
    caption: "1,000 rows, checked one by one."
    relative: false
    hidden: false
---

A CDC pipeline usually gets judged by whether it is running. The question I care about is narrower and harder: after something goes wrong, does the copy hold exactly the same rows as the source? Same keys, same values, same NULLs, same decimals to the last digit.

So I built a small rig to ask that question on repeat. It is called convergence-rig, it runs on one machine with Docker, and it is public: [github.com/AndreaBozzo/convergence-rig](https://github.com/AndreaBozzo/convergence-rig).

## The setup

- **Source:** PostgreSQL 19.0, released this week.
- **CDC writer:** [pg2iceberg](https://github.com/polynya-dev/pg2iceberg) 0.12.0, a Rust tool that streams logical replication into Apache Iceberg.
- **Catalog:** [Lakekeeper](https://github.com/lakekeeper/lakekeeper) as the Iceberg REST catalog, on S3-compatible storage.
- **Readers:** DuckDB, and Apache Spark as a second opinion.

A Python harness drives a steady write load (inserts, updates, deletes, large TOAST values, awkward decimals and timestamps), applies one disruption, and then compares both sides.

The comparison is the point of the project. It streams both tables ordered by primary key and checks every column of every row. Decimals are compared exactly, timestamps as UTC microseconds, text byte for byte and JSON structurally. Missing, extra and duplicate keys are reported before any row is paired. Each check has a test that feeds it a deliberate defect and expects it to fail, because a checker that has never failed proves nothing.

Every run ends in a verdict (`converged`, `mismatch at deadline`, `reader error`, and a few more), with the raw evidence committed next to it.

## First disruption: REPACK in PostgreSQL 19

PostgreSQL 19 adds `REPACK (CONCURRENTLY)`, which rewrites a bloated table while writes continue. It captures concurrent changes through its own logical decoding slot and takes an exclusive lock only for the final swap. That is exactly the kind of operation that makes a CDC pipeline nervous: the table is physically rebuilt underneath it.

On 250,000 rows (25,000 of them with TOAST values), under 10 writes per second:

- 7 of 7 runs converged exactly: 3 counterbalanced pairs with and without REPACK, plus a control.
- During the ~4.4 s rewrite, median write latency rose by about 12 ms and no writer was blocked.
- The CDC slot fell about 400 MB of WAL behind and caught up within seconds.
- Plain `REPACK`, the control, blocked writers for about 4.2 s. Details in the [M3 report](https://github.com/AndreaBozzo/convergence-rig/blob/main/reports/M3.md).

With pg2iceberg's compaction switched on, so that a compaction commit landed inside every REPACK, 6 of 6 runs still converged ([C1](https://github.com/AndreaBozzo/convergence-rig/blob/main/reports/C1.md)).

So for this workload, the new feature and the pipeline get along. The more interesting results came from disrupting the catalog instead of the database.

## When the catalog goes away for 60 seconds

I stopped the Iceberg catalog for one minute under load.

pg2iceberg 0.12.0 in its default single-process mode exits on the first failed catalog commit, and it does not come back on its own. Its replication slot goes inactive and WAL keeps piling up on the source until someone restarts it. After a restart it resumes cleanly from its slot and staging log, and the data matches exactly, with two orphan Parquet files left per outage.

Running the same tool in split mode (one process streaming, one materializing) retries through the same outage without exiting. The data is safe either way; the difference is whether someone has to be paged. I reported it upstream with a standalone reproduction: [pg2iceberg#154](https://github.com/polynya-dev/pg2iceberg/issues/154).

## When the catalog is restored from a backup

This is the result I did not expect.

Iceberg catalogs keep their state in a database, and databases get restored from backups. I took a `pg_dump` of the catalog's database during the run, kept writing, then restored the dump. The catalog went back three snapshots. pg2iceberg's own cursor in PostgreSQL did not go back.

pg2iceberg kept running, logged zero errors and zero warnings, and committed its next batch on top of the older snapshot. The changes in between were skipped for good. At the end of the run:

- 39 rows that exist in PostgreSQL were missing from Iceberg.
- 48 rows deleted in PostgreSQL were back in Iceberg.
- 122 rows carried stale values, 6 of them a mix of current columns and an older large value.

That is 209 wrong rows out of about 25,000, in a pipeline reporting itself as healthy.

The staged changes were still on disk, and `pg2iceberg verify` found exactly the same 209 differences as my checker. The documented re-snapshot procedure restored an exact match in about 21 seconds. So the tooling to detect and repair it exists; nothing triggers it. I reduced the case to a 35-row reproduction that runs in about a minute, confirmed it on the current main branch, and reported it as [pg2iceberg#156](https://github.com/polynya-dev/pg2iceberg/issues/156). The full drill is in the [K2 report](https://github.com/AndreaBozzo/convergence-rig/blob/main/reports/K2.md).

## Smaller results

- **Two readers agree.** DuckDB and Spark returned the same snapshot, schema and rows on a table with equality deletes.
- **Authorization holds at the object level.** With Lakekeeper plus OpenFGA and Keycloak, a reader without access gets a 404 on the table, a 403 on its files and a refused commit. There are no row filters or column masks at that layer.
- **Apache Polaris passes the same checks as Lakekeeper.** Lakekeeper is much lighter without authorization (35 MiB against 333 MiB at idle). With authorization, Polaris's built-in RBAC is lighter than Lakekeeper with Keycloak and OpenFGA (368 MiB against 886 MiB).
- **PostgreSQL 19 with `wal_level=replica` works for CDC.** PostgreSQL raises the effective level to `logical` when the slot is created. Only pg2iceberg's `init` check still reads the old setting and reports a failure that is not one.
- **Orphan cleanup** after an outage works with Spark's standard procedure when scoped to the table's `data/` folder.

## And Databricks

I also pointed the pipeline at Databricks Unity Catalog through its Iceberg REST endpoint, on a Free Edition workspace. The endpoint answers: configuration, table creation and vended credentials all work. Two things stop the pipeline. Unity Catalog refuses tables that declare identifier fields, which pg2iceberg always declares, so the CDC table cannot be created. And the vended storage credentials hit an explicit S3 deny, so no external engine could read or write the data files.

What does work: a table written from Databricks SQL matched the PostgreSQL source row by row, 1,000 of 1,000. The video below walks through it in the Databricks UI.

{{< video src="videos/convergence-rig-databricks.mp4" poster="images/convergence-rig-poster.webp" caption="The D1 table in Databricks: catalog, columns, sample rows, commits and the SQL check. Owner and storage details are blurred." >}}

One workspace and one edition; the S3 deny may well be specific to Free Edition. Details in the [D1 report](https://github.com/AndreaBozzo/convergence-rig/blob/main/reports/D1.md).

## How it was built

I wrote very little of this code. Most of it was written by coding agents while I slept.

I started with a question and a plan. Claude helped me turn the question into a written plan with milestones, pass criteria and the checks each milestone had to prove. The repository's agent instructions set the rules: everything stays local, every milestone ends with a report and a commit, and when something blocks, the agent writes a `BLOCKED.md` and stops instead of guessing.

Then Gemini, through Google's Antigravity CLI, ran the milestones headless, one session each. The first four, from an empty folder to the REPACK result, took about three and a half hours in an evening. The Spark, authorization and catalog outage milestones followed later that night in under an hour. The reproduction for the catalog outage and the compaction runs went overnight, and the reports were waiting in the morning. A few later milestones were finished by Claude when the Gemini sessions ran out of quota or stopped on a permission prompt.

My part was review, and that is where the time went. Every report was checked against its raw evidence, not taken at its word. A few examples of what that meant:

- The checker had to catch deliberate defects. Each single mutation of the comparison code was caught by the tests (7 of 7), with the original bytes restored and hashed afterwards.
- The upstream reproductions were rerun by hand before anything left the machine.
- One report left out a deadlock that had to be broken during a probe run. That kind of omission is the reason to read the evidence and not only the summary.

Nothing went upstream without me reading it and agreeing to the wording: both pg2iceberg issues were filed only after that. The name and the logo came from Codex.

The split worked well for this kind of project: a clear question, checks that can say no, and evidence on disk for every claim. The agents did the long, patient part. The judgment about what a result means, and whether it is true, stayed with a person.

## Limits

Everything ran on one Windows host with Docker Desktop, one writer connection and 10 writes per second. Read the latency figures as observations about that host. The rig checks the final state, not every intermediate version. Higher write rates may catch a writer in REPACK's short final lock; these runs never did.

## What I take from it

The database side behaved better than I expected: a table rewritten under load, compaction running at the same time, and still an exact match every time. Both real problems sat in the catalog, the component that is easiest to treat as plumbing. An outage stops the pipeline loudly, which is fine. A restore lets it continue quietly with wrong data, which is the case a scheduled exact comparison or a `verify` run is there to catch.

The rig is built to take more scenarios. If you run a CDC path into Iceberg and have a disruption you would like tested, [open an issue](https://github.com/AndreaBozzo/convergence-rig/issues).
