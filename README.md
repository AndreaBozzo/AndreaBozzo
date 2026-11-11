# Andrea Bozzo

Open source engineer building data platforms, developer tooling, and technical writing around Rust, Python, Go, and modern analytics systems.

[Website](https://andreabozzo.github.io/AndreaBozzo/) | [Blog](https://andreabozzo.github.io/AndreaBozzo/blog/) | [LinkedIn](https://www.linkedin.com/in/andrea-bozzo-/) | [Email](mailto:andreabozzo92@gmail.com)

## Selected work

Systems I actively build. Related papers, integrations, datasets, and distribution repositories are grouped with their parent project.

| Project | Focus |
| --- | --- |
| [dataprof](https://github.com/AndreaBozzo/dataprof) | **v0.13.1**: bounded-memory Rust/Python profiling and pipeline quality gates for CSV, JSON, Parquet, DataFrames, and Arrow streams, with explicit assessment scope and comparable quality reports. Related work includes [Metric Evidence](https://github.com/AndreaBozzo/metric-evidence), a Power BI report with evidence beside each metric; a [dlt/SQL/DuckDB pipeline reference](https://github.com/AndreaBozzo/dataprof-pipeline-reference); a [seven-rule, six-tool comparison of checks and costs](https://github.com/AndreaBozzo/dataprof-dq-comparison); and an [ADBC query profiling and type/stream matrix](https://github.com/AndreaBozzo/dataprof-adbc-matrix). |
| [arrow-abi-doctor](https://github.com/AndreaBozzo/arrow-abi-doctor) | Differential testing of the Arrow C Data and C Stream interfaces across real consumers, in isolated processes. |
| [Tabular Evolution Corpus](https://github.com/AndreaBozzo/tabular-evolution-corpus) | **v0.3.0**: versioned Parquet scenarios of datasets changing shape, with machine-checked manifests, also on [Hugging Face](https://huggingface.co/datasets/AndreaBozzo/tabular-evolution-corpus). |
| [Nephtys](https://github.com/AndreaBozzo/Nephtys) | A low-footprint, multi-protocol connector for durable NATS JetStream pipelines, backed by an [IEEE UIC 2026 evaluation](https://github.com/AndreaBozzo/uic2026-nephtys). |

<details>
<summary><strong>More selected work</strong>: open data, knowledge graphs, lakehouse, applied research, and systems work</summary>

| Project | Focus |
| --- | --- |
| [Ceres](https://github.com/AndreaBozzo/Ceres) + [Ares](https://github.com/AndreaBozzo/Ares) | **v0.7.0 / v0.4.0**: reproducible open-data harvesting and schema-driven extraction. Ceres powers a [public open-data index](https://huggingface.co/datasets/AndreaBozzo/ceres-open-data-index) and a [Databricks analytics pipeline](https://github.com/AndreaBozzo/databricks-ceres-pipeline). |
| [GitNodes](https://github.com/AndreaBozzo/gitnodes) | **v0.2.0**: a Git-native, typed knowledge graph for engineering teams and AI agents, accessible through the web UI or MCP. |
| [dbt-isrm](https://github.com/AndreaBozzo/dbt-isrm) | **Active**: a release matrix for dbt's Information Schema across releases and execution stages. |
| [dlt + dbt on Databricks](https://github.com/AndreaBozzo/dlt-dbt-databricks) | **Active**: runnable ingestion, transformation, orchestration, and quality-gate examples validated against Databricks and in DuckDB CI. |
| [OCCAS](https://github.com/AndreaBozzo/occas) | **v0.1.0 research release**: a provenance-backed PX4/ERA5 agreement study; external wind estimates were too imprecise to substitute for onboard estimates under the study's criterion. |
| [Fantabuddy](https://github.com/AndreaBozzo/fantabuddy) | **v0.4.0 data product**: a local DuckDB history of official player lists, offline Classic/Mantra auction reports, and verifiable Parquet corpus exports. |
| [DCE](https://github.com/AndreaBozzo/dce) | **Pre-release**: a Rust-native engine for defining, validating, and enforcing data contracts. |
| [Zero Grappler](https://github.com/AndreaBozzo/zero-grappler) | **Prototype**: a `no_std`, allocation-free async pipeline for embedded sensor, DSP, and inference workloads. |
| [IcebergSharp](https://github.com/AndreaBozzo/IcebergSharp) | **In development**: .NET Iceberg metadata, Avro manifests, and REST catalog access; scan planning and Parquet data reads remain on the roadmap. |
| [Lares](https://github.com/AndreaBozzo/lares) | **In use**: a small self-hosted home stack built around failure semantics, with digest-pinned images, application-consistent SQLite snapshots to encrypted offsite backup, and a scripted bare-metal rebuild. |

</details>

Browse the [full project archive](https://andreabozzo.github.io/AndreaBozzo/#workbench) or [all repositories](https://github.com/AndreaBozzo?tab=repositories).

## Recent writing

<!-- RECENT_WRITING:START -->
- 2026-11-09: [One Year, 24 Posts: What Held Up and What Didn't](https://andreabozzo.github.io/AndreaBozzo/blog/en/posts/one-year-of-writing-blog/)
- 2026-10-20: [Where Should the Library Stop?](https://andreabozzo.github.io/AndreaBozzo/blog/en/posts/where-should-the-library-stop-blog/)
- 2026-10-05: [Green Is a Policy, Not a Fact](https://andreabozzo.github.io/AndreaBozzo/blog/en/posts/green-is-a-policy-blog/)
<!-- RECENT_WRITING:END -->

The [full blog](https://andreabozzo.github.io/AndreaBozzo/blog/) has posts in English and Italian.

## Open source contributions

Contributions to the broader open source ecosystem beyond my own repositories.

> This section is updated automatically via GitHub Actions.

<!-- EXTERNAL_CONTRIBUTIONS:START -->
<details>
<summary><strong>65 merged PRs across 30 upstream projects</strong> · 231.2k combined stars</summary>

<p align="center">
  <img src="https://img.shields.io/badge/Projects-30-blue?style=flat-square" alt="Projects"/>
  <img src="https://img.shields.io/badge/PRs_Merged-65-success?style=flat-square" alt="PRs Merged"/>
  <img src="https://img.shields.io/badge/Combined_Stars-231.2k-yellow?style=flat-square" alt="Stars"/>
</p>

### 🔬 Data Ecosystem

<p>
<a href="https://github.com/pola-rs/polars"><img src="https://img.shields.io/badge/polars-%E2%AD%90%2040.3k%20%7C%203%20PR-informational?style=flat-square" alt="polars"/></a>
  <a href="https://github.com/apache/datafusion"><img src="https://img.shields.io/badge/datafusion-%E2%AD%90%209.6k%20%7C%201%20PR-informational?style=flat-square" alt="datafusion"/></a>
  <a href="https://github.com/risingwavelabs/risingwave"><img src="https://img.shields.io/badge/risingwave-%E2%AD%90%209.4k%20%7C%201%20PR-informational?style=flat-square" alt="risingwave"/></a>
  <a href="https://github.com/igorbarinov/awesome-data-engineering"><img src="https://img.shields.io/badge/awesome--data--engineering-%E2%AD%90%209.2k%20%7C%201%20PR-informational?style=flat-square" alt="awesome-data-engineering"/></a>
  <a href="https://github.com/lance-format/lance"><img src="https://img.shields.io/badge/lance-%E2%AD%90%207.3k%20%7C%202%20PR-informational?style=flat-square" alt="lance"/></a>
  <a href="https://github.com/apache/arrow-rs"><img src="https://img.shields.io/badge/arrow--rs-%E2%AD%90%203.7k%20%7C%205%20PR-informational?style=flat-square" alt="arrow-rs"/></a>
  <a href="https://github.com/supabase/etl"><img src="https://img.shields.io/badge/etl-%E2%AD%90%202.4k%20%7C%202%20PR-informational?style=flat-square" alt="etl"/></a>
  <a href="https://github.com/lakekeeper/lakekeeper"><img src="https://img.shields.io/badge/lakekeeper-%E2%AD%90%201.5k%20%7C%204%20PR-informational?style=flat-square" alt="lakekeeper"/></a>
  <a href="https://github.com/ddotta/awesome-polars"><img src="https://img.shields.io/badge/awesome--polars-%E2%AD%90%201.1k%20%7C%201%20PR-informational?style=flat-square" alt="awesome-polars"/></a>
  <a href="https://github.com/pganalyze/pg_query.rs"><img src="https://img.shields.io/badge/pg__query.rs-%E2%AD%90%20260%20%7C%201%20PR-informational?style=flat-square" alt="pg_query.rs"/></a>
  <a href="https://github.com/apache/arrow-nanoarrow"><img src="https://img.shields.io/badge/arrow--nanoarrow-%E2%AD%90%20252%20%7C%201%20PR-informational?style=flat-square" alt="arrow-nanoarrow"/></a>
  <a href="https://github.com/apache/fluss-rust"><img src="https://img.shields.io/badge/fluss--rust-%E2%AD%90%2059%20%7C%202%20PR-informational?style=flat-square" alt="fluss-rust"/></a>
  <a href="https://github.com/ArchAI-Labs/medha"><img src="https://img.shields.io/badge/medha-%E2%AD%90%2031%20%7C%201%20PR-informational?style=flat-square" alt="medha"/></a>
</p>

### 🦀 Rust Tooling

<p>
<a href="https://github.com/rust-unofficial/awesome-rust"><img src="https://img.shields.io/badge/awesome--rust-%E2%AD%90%2060.4k%20%7C%201%20PR-informational?style=flat-square" alt="awesome-rust"/></a>
  <a href="https://github.com/tokio-rs/tokio"><img src="https://img.shields.io/badge/tokio-%E2%AD%90%2033.8k%20%7C%202%20PR-informational?style=flat-square" alt="tokio"/></a>
  <a href="https://github.com/tokio-rs/axum"><img src="https://img.shields.io/badge/axum-%E2%AD%90%2027.8k%20%7C%201%20PR-informational?style=flat-square" alt="axum"/></a>
  <a href="https://github.com/rust-lang/this-week-in-rust"><img src="https://img.shields.io/badge/this--week--in--rust-%E2%AD%90%202.7k%20%7C%201%20PR-informational?style=flat-square" alt="this-week-in-rust"/></a>
  <a href="https://github.com/apache/iceberg-rust"><img src="https://img.shields.io/badge/iceberg--rust-%E2%AD%90%201.4k%20%7C%203%20PR-informational?style=flat-square" alt="iceberg-rust"/></a>
  <a href="https://github.com/vakamo-labs/openfga-client"><img src="https://img.shields.io/badge/openfga--client-%E2%AD%90%207%20%7C%201%20PR-informational?style=flat-square" alt="openfga-client"/></a>
  <a href="https://github.com/rust-ita/rust-docs-it"><img src="https://img.shields.io/badge/rust--docs--it-%E2%AD%90%202%20%7C%202%20PR-informational?style=flat-square" alt="rust-docs-it"/></a>
</p>

### 🤖 AI/ML

<p>
<a href="https://github.com/datapizza-labs/datapizza-ai"><img src="https://img.shields.io/badge/datapizza--ai-%E2%AD%90%202.2k%20%7C%205%20PR-informational?style=flat-square" alt="datapizza-ai"/></a>
  <a href="https://github.com/mosaico-labs/mosaico"><img src="https://img.shields.io/badge/mosaico-%E2%AD%90%201.1k%20%7C%2010%20PR-informational?style=flat-square" alt="mosaico"/></a>
</p>

### 🛠️ Infrastructure

<p>
<a href="https://github.com/beelzebub-labs/beelzebub"><img src="https://img.shields.io/badge/beelzebub-%E2%AD%90%202.2k%20%7C%201%20PR-informational?style=flat-square" alt="beelzebub"/></a>
  <a href="https://github.com/CortexFlow/CortexBrain"><img src="https://img.shields.io/badge/CortexBrain-%E2%AD%90%2093%20%7C%203%20PR-informational?style=flat-square" alt="CortexBrain"/></a>
</p>

### 📦 Other

<p>
<a href="https://github.com/microsoft/winget-pkgs"><img src="https://img.shields.io/badge/winget--pkgs-%E2%AD%90%2011.3k%20%7C%201%20PR-informational?style=flat-square" alt="winget-pkgs"/></a>
  <a href="https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2"><img src="https://img.shields.io/badge/PathOfBuilding--PoE2-%E2%AD%90%201.9k%20%7C%201%20PR-informational?style=flat-square" alt="PathOfBuilding-PoE2"/></a>
  <a href="https://github.com/zornade/visura-api"><img src="https://img.shields.io/badge/visura--api-%E2%AD%90%20681%20%7C%201%20PR-informational?style=flat-square" alt="visura-api"/></a>
  <a href="https://github.com/italia-opensource/awesome-italia-opensource"><img src="https://img.shields.io/badge/awesome--italia--opensource-%E2%AD%90%20338%20%7C%202%20PR-informational?style=flat-square" alt="awesome-italia-opensource"/></a>
  <a href="https://github.com/piopy/fantacalcio-py"><img src="https://img.shields.io/badge/fantacalcio--py-%E2%AD%90%2067%20%7C%204%20PR-informational?style=flat-square" alt="fantacalcio-py"/></a>
  <a href="https://github.com/informagico/fantavibe"><img src="https://img.shields.io/badge/fantavibe-%E2%AD%90%208%20%7C%201%20PR-informational?style=flat-square" alt="fantavibe"/></a>
</p>

</details><!-- EXTERNAL_CONTRIBUTIONS:END -->

## GitHub snapshot

<p align="center">
  <img src="metrics/github-stats.svg" alt="GitHub Stats"/>
  <img src="metrics/languages.svg" alt="Top Languages"/>
</p>

<p align="center">
  <img src="metrics/contributions.svg" alt="Contribution Graph" />
</p>
