# Public work review — 13 September 2026

Window: **13 June–13 September 2026**. Sources were fetched anonymously from
GitHub's public user repositories endpoint, public READMEs, releases, and merged-PR
search. No authenticated repository listing or private checkout was used.
Repository push dates identified candidates; descriptions alone were not treated
as proof of a shipped feature. This is a curated content review, not a code audit.

## Added to the project directory

| Project | Public evidence and resulting description |
| --- | --- |
| [GitNodes](https://github.com/AndreaBozzo/gitnodes) | Created 23 June; [v0.2.0](https://github.com/AndreaBozzo/gitnodes/releases/tag/v0.2.0) released 29 August. Git-backed Markdown, disposable SQLite index, typed relationships, web editing, read-only MCP traversal, and packaged installation. |
| [dlt + dbt on Databricks](https://github.com/AndreaBozzo/dlt-dbt-databricks) | Created 16 June. Runnable ingestion, analytics marts, Asset Bundle orchestration, DuckDB CI, and deterministic quality-gate evidence. [PR 34](https://github.com/AndreaBozzo/dlt-dbt-databricks/pull/34) records fixes from live Zerobus validation. The [Rust/Arrow Flight demo](https://github.com/AndreaBozzo/zerobus-rust-demo) is grouped as companion work. |
| [Fantabuddy](https://github.com/AndreaBozzo/fantabuddy) | Created 5 August; [v0.4.0](https://github.com/AndreaBozzo/fantabuddy/releases/tag/v0.4.0) released 5 September. The current project includes a DuckDB history, Classic/Mantra reports, Parquet exports, and [verified corpus imports](https://github.com/AndreaBozzo/fantabuddy/pull/6). |
| [OCCAS](https://github.com/AndreaBozzo/occas) | Created 20 August. [Public v0.1.0 release](https://github.com/AndreaBozzo/occas/releases/tag/v0.1.0) exists, although the README still says “pending release.” The [analysis](https://github.com/AndreaBozzo/occas/blob/main/docs/10-h1-results.md) compares uncertain ERA5/PX4 estimates; lack of evidence of systematic offset does not establish equivalence or useful substitution. ODD representation remains future work. |
| [Iceberg stale-base reproduction](https://github.com/AndreaBozzo/iceberg-stale-base-repro) | Created 2 September. Minimal two-writer reproduction, linked to the existing blog experiment. Presented as an experiment, not a merged upstream fix. |
| [Mercury](https://github.com/AndreaBozzo/Mercury) | Public observation alpha: Nephtys/JetStream input, signals, Lance archive, and replay. Default observation sends no orders; live execution is disabled. No performance or profitability claim. |

## Corrected and refreshed existing material

- **[dataprof](https://github.com/AndreaBozzo/dataprof):** the current release surface is
  a beta Rust crate and Python library; the CLI is historical. Updated inputs and
  report semantics from [Arrow C Stream support](https://github.com/AndreaBozzo/dataprof/pull/706)
  and [explicit missing-assessment reasons](https://github.com/AndreaBozzo/dataprof/pull/722).
  Removed the old CLI-centered illustrations from this project note.
- **[Nephtys](https://github.com/AndreaBozzo/Nephtys):** corrected the homepage language
  tag to Go. Added supervised lifecycle, replay, readiness, and
  [connector reliability work](https://github.com/AndreaBozzo/Nephtys/pull/77).
  The [paper companion](https://github.com/AndreaBozzo/uic2026-nephtys) remains linked;
  lower memory is not presented as demonstrated whole-board energy savings.
- **[Ceres](https://github.com/AndreaBozzo/Ceres) / [Ares](https://github.com/AndreaBozzo/Ares):**
  harvesting-first catalog, ten documented harvest paths, optional embeddings,
  reproducible exports, and schema-validated extraction. Grouped the
  [Databricks pipeline](https://github.com/AndreaBozzo/databricks-ceres-pipeline) and
  [discovery agent](https://github.com/AndreaBozzo/ceres-discovery-agent) with their parent.
  Avoided a hardcoded dataset count that would need frequent refreshes.
- **[IcebergSharp](https://github.com/AndreaBozzo/IcebergSharp):** metadata, manifests,
  and REST catalog foundations are implemented; scan planning, file I/O, live
  catalog validation, and Parquet reads remain planned. Corrected copy that blurred
  the intended reader with the current implementation.
- **[DCE](https://github.com/AndreaBozzo/dce):** explicitly labeled pre-release and
  not ready for production use.

## Upstream work in the window

The anonymous public merged-PR query returned four results outside the user's
repositories. Package distribution is distinguished from library contributions:

- [arrow-rs #10916](https://github.com/apache/arrow-rs/pull/10916): FFI import of
  zero-length Utf8/Binary arrays at a non-zero offset.
- [arrow-rs #10579](https://github.com/apache/arrow-rs/pull/10579): padded-row
  accounting for `with_truncated_rows`.
- [lakekeeper #1924](https://github.com/lakekeeper/lakekeeper/pull/1924): authorization
  events before assignment writes.
- [winget-pkgs #396497](https://github.com/microsoft/winget-pkgs/pull/396497): GitNodes
  package distribution, rather than a separate engineering project.

## Maintenance

Updated English and Italian project notes in `projects.json`, homepage selections,
and README highlights. Recent notes have a `reviewedAt` date. The six new entries
use the existing static templates; no feed, API integration, or dependency was added.
Existing blog articles remain historical records and were not rewritten.
