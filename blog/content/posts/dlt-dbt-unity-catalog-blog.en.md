---
title: "dlt + dbt on One Unity Catalog (and Why It's Not 'Two DLTs')"
date: 2026-06-22T12:00:00+02:00
draft: false
tags: ["Data Engineering", "dlt", "dbt", "Databricks", "Unity Catalog", "Lakehouse", "Python"]
categories: ["Data Engineering"]
keywords: ["dlt", "dbt", "Databricks", "Unity Catalog", "Lakehouse", "Delta Live Tables", "data ingestion", "ELT"]
description: "How dlt (dlthub) ingestion and dbt transformation meet at a single Unity Catalog schema on Databricks — and why the inner pipeline here is dbt, not Delta Live Tables."
summary: "Python-native ingestion with dlt (dlthub), SQL transformation with dbt, and a single Unity Catalog schema as the contract between them. Notes from wiring them together on a real Databricks workspace — including the naming collision that bit me in actual code."
author: "Andrea Bozzo"
showToc: true
TocOpen: true
hidemeta: false
comments: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
cover:
    image: "images/twodlt-cover.png"
    alt: "dlt + dbt on one Unity Catalog"
    caption: "Python ingestion with dlt, SQL transformation with dbt, one governed Unity Catalog schema as the contract"
    relative: false
    hidden: false
---

I spent a few weeks building a small but *runnable* reference for ingestion-plus-transformation on
Databricks, and the most useful thing I learned wasn't architectural — it was that two of the tools
involved have almost the same name, and that collision is not just a marketing annoyance. It shows
up in your `sys.path`.

So before anything else, the disambiguation, because the whole post depends on it:

- **`dlt`** (lowercase) is **[dlthub](https://dlthub.com)**, an open-source **Python** library that
  extracts from sources and loads into destinations. `pip install dlt`.
- **`DLT`** / **Delta Live Tables** is a **Databricks** product for declarative pipelines, renamed in
  2026 to **Lakeflow Spark Declarative Pipelines**.

This post is about the first one. **I deliberately did not use the second one.** The transformation
layer here is **[dbt](https://www.getdbt.com)**, not Delta Live Tables. The shape I ended up liking is
boring and decoupled: `dlt` lands raw tables into a Unity Catalog schema, `dbt` reads that schema and
builds marts on top, and the only thing connecting them is a schema name. The full code is on GitHub:
[AndreaBozzo/dlt-dbt-databricks](https://github.com/AndreaBozzo/dlt-dbt-databricks).

---

## The architecture in one line

`dlt` extracts from a source (a REST API or Postgres here) and **loads raw tables into a Unity
Catalog schema** → **dbt** reads that schema as a `source` and builds `staging → intermediate →
marts`, all on a Databricks SQL warehouse.

![dlt to Unity Catalog to dbt architecture](/AndreaBozzo/blog/images/twodlt-architecture.png "dlt lands raw tables into a Unity Catalog schema; dbt reads that schema and builds staging → intermediate → marts on a SQL warehouse")

There is no in-memory handoff, no shared file, no orchestration glue that has to be alive for the
contract to hold. The boundary is a **Unity Catalog schema**. That single decision is what makes the
two tools independent.

---

## Outer layer: dlt as the ingestion fabric

`dlt` owns one schema — `<catalog>.raw` by default, plus a managed staging Volume in the same catalog for bulk `COPY INTO` — and writes nothing else. The headline
example is a declarative REST source with a parent→child relationship (posts, then each post's
comments), loaded with `merge` so reruns upsert instead of duplicating:

```python
from dlt.sources.rest_api import rest_api_source

source = rest_api_source({
    "client": {"base_url": "https://jsonplaceholder.typicode.com/"},
    "resource_defaults": {"write_disposition": "merge", "primary_key": "id"},
    "resources": [
        {"name": "rest_posts", "endpoint": {"path": "posts"}},
        {
            "name": "rest_comments",
            "endpoint": {
                "path": "posts/{post_id}/comments",
                "params": {"post_id": {"type": "resolve", "resource": "rest_posts", "field": "id"}},
            },
        },
    ],
})
```

The things that make `dlt` a good *outer* layer are the unglamorous ones:

- **Python-first.** It reads like normal client code with decorators, not like fighting a distributed
  system to fetch JSON. The long tail of niche SaaS, internal REST endpoints, and "the vendor gave us
  this one weird API" is exactly where it shines and where managed connectors don't.
- **Stateful but boring.** Incremental cursors, schema inference, and merge semantics are declarative.
  The advanced examples in the repo show `write_disposition="merge"` + `dlt.sources.incremental(...)`
  compiling down to an idempotent `MERGE INTO`, and schema contracts (`evolve` / `freeze`) that emit
  real `PRIMARY KEY` / `FOREIGN KEY` constraints on the Databricks tables.
- **Polyglot.** The same pipeline runs locally, in CI, or inside a Databricks job. There's also a
  Postgres source (`sql_database`) and an Iceberg table-format variant — Databricks is one destination
  among several, not the center of gravity.

By the time `dlt` is done, you have **Delta tables in a governed Unity Catalog schema** — not a Hive
metastore, not an ungoverned bucket. That's the precondition the whole rest of the design leans on.

---

## The contract: a Unity Catalog schema, nothing more

This is the part worth being precise about, because it's the entire point of pairing the two tools.

1. **dlt owns `raw`.** Each run loads into `<catalog>.<DLT_DATASET_NAME>` (default `raw`), alongside
   its own bookkeeping tables (`_dlt_loads`, `_dlt_pipeline_state`, `_dlt_version`). Leave those alone.
2. **dbt reads `raw` as a `source`, never as a hardcoded table.** A `sources.yml` declares the schema,
   and staging models select from `{{ source('raw', 'rest_posts') }}`. The clever bit: the source
   schema resolves from `{{ env_var('DLT_DATASET_NAME', 'raw') }}` — the *same* env var the dlt
   pipelines read — so renaming the landing schema can't desync the two sides.
3. **dbt owns `analytics`.** Models materialize into `<catalog>.<DATABRICKS_SCHEMA>`. Nothing ever
   writes back into `raw`.

Because the boundary is a schema and not a process, the two tools stay fully decoupled. You can run
them on different schedules, from different machines, or one without the other, and the contract still
holds. dbt doesn't know or care that a Python project feeds its sources; dlt doesn't know anything is
reading them.

![Databricks Catalog Explorer showing the raw and analytics schemas](/AndreaBozzo/blog/images/twodlt-catalog-explorer.png "Catalog Explorer: dlt's raw schema (rest_posts, rest_comments, and the _dlt_* bookkeeping tables) sitting next to dbt's analytics schema")

---

## Inner layer: dbt, staging → marts

The transformation side is ordinary dbt, and the repo carries two distinct datasets through it.

**The dlt-fed path.** Staging is a 1:1 cleanup of the landed tables — rename and cast, no business
logic, since dlt already normalized `camelCase` → `snake_case` on the way in:

```sql
-- stg_rest_posts.sql
with source as (select * from {{ source('raw', 'rest_posts') }})
select
    cast(id as bigint)      as post_id,
    cast(user_id as bigint) as user_id,
    title, body,
    _dlt_load_id
from source
```

**A real, messy analytics layer.** The more interesting models sit on top of
`samples.healthverity.claims_sample_synthetic` — a synthetic healthcare-claims dataset (~410k rows,
one row per claim *service line*) that ships in every Databricks workspace. It's a good stress test
because the raw data is all strings, ~57% of `line_charge` is `NULL`, and a few thousand rows are
negative (claim reversals). Staging casts and flags that; an intermediate model rolls line-detail up
to one row per claim; the mart answers an actual business question — charged vs. allowed amounts by
payer segment:

```sql
-- mart_claims_by_payer.sql
select
    payer_type, patient_state, claim_type,
    count(*)                                                   as claims,
    count(distinct hvid)                                       as members,
    sum(total_allowed)                                         as total_allowed,
    round(sum(total_allowed) / nullif(sum(total_charge), 0), 4) as allowed_ratio
from {{ ref('int_claims') }}
group by payer_type, patient_state, claim_type
```

This is the honest division of labor: dlt is close to where HTTP and JSON live; dbt is close to where
SQL, tests, surrogate keys, and incremental merge strategies live. Neither tool is asked to do the
other's job.

![The analytics schema — dbt's staging, intermediate, and mart tables](/AndreaBozzo/blog/images/twodlt-analytics-schema.png "Catalog Explorer: the analytics schema dbt owns — stg_*, int_*, and mart_* built on top of the dlt-landed raw tables")

---

## What actually broke

The intro promised this, so here are the real ones — none of them architectural, all of them the kind
of thing you only find by running it.

**The two dlts collide on `sys.path`.** Databricks serverless ships a *built-in* `dlt` module — the
Lakeflow/DLT one — whose import hook shadows dlthub's `dlt`. `import dlt` in a notebook can resolve to
the wrong package entirely. The fix in the repo is an ugly little shim that temporarily strips the
first `sys.meta_path` finder so the real package wins:

```python
def import_dlt():
    """Import dltHub's dlt despite Databricks serverless' built-in DLT hook."""
    metas = list(sys.meta_path)
    if os.getenv("DATABRICKS_RUNTIME_VERSION") and metas:
        sys.meta_path = metas[1:]
    try:
        import dlt
        return dlt
    finally:
        sys.meta_path = metas
```

If you ever doubted that the naming collision is a real problem and not just a pedantic footnote: it's
six lines of `meta_path` surgery in production code.

**Serverless doesn't always have a SQL warehouse for dlt's destination.** dlt's Databricks destination
wants a warehouse and a staging volume. Inside a serverless job that path isn't always available, so
the REST pipeline has a `--load-mode spark` fallback that just does `spark.saveAsTable`. The catch:
that fallback **must emit the exact same `snake_case` columns plus `_dlt_load_id`** that dlt would,
or dbt's staging models break downstream. Two code paths, one schema contract to honor.

**Keeping dbt's source schema in sync with dlt's dataset name** is the silent failure mode — point
them at different schemas and dbt cheerfully builds nothing. Resolving both from one env var is what
makes that a non-issue.

---

## Orchestration: local first, then a Bundle

For demos there's a small local runner (~50 lines) that calls dlt, then `dbt build`, in one process — enough to
prove the handoff. For production the repo ships a **Databricks Asset Bundle**: one Job, two tasks,
`dbt_build` gated on `dlt_ingest` succeeding, with versioned, deployable infrastructure instead of a
script.

```yaml
resources:
  jobs:
    dlt_dbt_pipeline:
      tasks:
        - task_key: dlt_ingest
          spark_python_task:
            python_file: ingestion/pipelines/rest_api_to_databricks.py
            parameters: ["--catalog", "${var.catalog}", "--dataset-name", "raw", "--load-mode", "spark"]
        - task_key: dbt_build
          depends_on: [{ task_key: dlt_ingest }]
          dbt_task:
            project_directory: transformation/dbt_databricks
            warehouse_id: ${var.warehouse_id}
            commands: ["dbt deps", "dbt build"]
```

![Databricks Job run with two dependent tasks](/AndreaBozzo/blog/images/twodlt-job-run.png "The deployed Asset Bundle job: dlt_ingest runs first, dbt_build runs only on success")

There's also an offline `doctor.py` preflight that checks env vars, parses the dbt project, and runs
`bundle validate` **without touching the warehouse** — so a new contributor can tell whether the repo
is wired correctly before spending a cent of compute. Every example is validated against a real
workspace; no dead demos.

---

## Why one Unity Catalog still matters

Even though the inner layer is dbt and not a Databricks-native pipeline, terminating *everything* into
Unity Catalog is what makes the split pay off:

- **Access control** is on catalogs and schemas, not random buckets — analysts, ML engineers, and
  service principals all see the same permissions.
- **Lineage** traverses from dbt marts back through staging to the dlt-landed `raw` tables — and on
  into whatever reads them — one graph, both tools.
- **One governance surface.** Tables, views, functions, and any models you register all live under
  the same `catalog.schema` namespace — one place for permissions, audit, and lineage, instead of
  separate stories for data, code, and ML.

![Unity Catalog column-level lineage for the mart_claims_by_payer mart](/AndreaBozzo/blog/images/twodlt-uc-lineage.png "Unity Catalog column-level lineage: mart_claims_by_payer traced back to int_claims — and on through staging to the dlt-landed raw tables")

That's the actual reason to send dlt's output straight into UC instead of staging it somewhere and
re-importing later: it turns an ingestion library into a first-class citizen of a governed lakehouse,
without writing a line of Spark.

---

## A checklist, mapped to the repo

1. **Set up Unity Catalog.** A catalog with a `raw` schema (dlt) and an `analytics` schema (dbt), and
   a running SQL warehouse. (`make doctor` checks the rest.)
2. **Configure dlt.** `dlt[databricks]`, point the destination at your catalog, model each source as a
   `rest_api_source` / `@dlt.resource` with `merge` + incremental cursors where it makes sense.
3. **Make the schema the contract.** Resolve dbt's `source` schema and dlt's `DLT_DATASET_NAME` from
   one env var. Don't let dlt write outside `raw`.
4. **Build dbt on top.** `staging → intermediate → marts` reading `raw` as a source, materializing into
   `analytics`, with tests on the keys.
5. **Promote orchestration.** Start with the local runner; ship the Asset Bundle when you want it in
   production.

At the end you have one catalog boundary, two tools doing the jobs they're actually good at, and a
clear place to hang governance. It's not the only way to use Databricks — but it stopped feeling like
overlapping products and started feeling like a lattice where each piece does exactly the amount of
work it's good at. And no, none of it is "DLT."
