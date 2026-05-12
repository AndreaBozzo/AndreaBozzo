// One-shot helper: merges a per-slug systemAnatomy map into assets/data/case-studies.json
// in place. Idempotent — re-running updates the systemAnatomy field without touching
// anything else. Safe to delete once anatomy content is stable.

import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'assets/data/case-studies.json';

const ANATOMY = {
  dataprof: {
    inputs: ['Parquet / CSV / JSON files', 'Arrow RecordBatches', 'Streaming or batch tables', 'CLI flags or Python kwargs'],
    core: ['Rust profiler engine', 'Arrow-native column metrics', 'DataFusion SQL layer (in progress)', 'Selective-metric scheduler'],
    outputs: ['Machine-readable JSON report', 'CLI exit code for CI gating', 'Python dataclass results', 'Type / pattern signatures'],
    constraints: ['Bounded memory', 'No JVM, no notebook', 'Wide-table safe', 'Runs offline'],
  },
  'apache-rust-upstream': {
    inputs: ['Downstream system pain', 'Public Apache codebases', 'Issue trackers + design docs', 'Reproducible failure cases'],
    core: ['arrow-rs Parquet reader work', 'DataFusion query surfaces', 'iceberg-rust table semantics', 'fluss-rust streaming clients'],
    outputs: ['Merged PRs (2 / 1 / 3 / 2)', 'Documentation examples', 'Long-form write-ups', 'Reusable upstream substrate'],
    constraints: ['Public review process', 'No private forks', 'Compat with downstream tools', 'Long iteration cycles'],
  },
  'ares-ceres': {
    inputs: ['Open-data portals (CKAN/DCAT)', 'Arbitrary web pages', 'JSON Schemas', 'Crawl session configs'],
    core: ['Ceres: incremental sync engine', 'Ares: fetch + extract pipeline', 'Queue-driven workers', 'LLM extraction with retries'],
    outputs: ['Catalog dumps + exports', 'Schema-validated rows', 'Change-detection events', 'Optional semantic index'],
    constraints: ['Polite fetch behavior', 'Resumable runs', 'Schema-first contract', 'Two separate tools by design'],
  },
  mosaico: {
    inputs: ['Robotics datasets', 'SDK calls', 'CI signals', 'Backend job definitions'],
    core: ['SDK / backend contract surface', 'Query ergonomics layer', 'Job orchestration boundary', 'Integration tests'],
    outputs: ['Reproducible dataset runs', 'Stable SDK responses', 'Green CI builds', 'Public PR trail'],
    constraints: ['Multi-team consumption', 'Research + prod dual use', 'No magical abstractions', 'Debuggable failure modes'],
  },
  'zero-grappler': {
    inputs: ['Async sensor sources', 'Compile-time buffer sizes', 'Embassy executor', 'Board hardware (target)'],
    core: ['Source / Transform / Inference traits', 'Embassy channels', 'Monomorphic task wrappers', 'Zero-allocation runtime'],
    outputs: ['Inference results downstream', 'Host-side mock outputs', 'Bill-of-materials reference', 'Reusable pipeline crate'],
    constraints: ['no_std', 'No heap', 'Single-board first', 'Types carry buffer sizes'],
  },
  nephtys: {
    inputs: ['WebSocket / SSE feeds', 'Webhooks + gRPC streams', 'REST connector configs', 'Source credentials'],
    core: ['Go service per connector', 'Event normalizer + middleware', 'NATS JetStream publisher', 'REST control plane'],
    outputs: ['Durable JetStream subjects', 'Prometheus metrics', 'Grafana dashboards', 'Replayable event log'],
    constraints: ['Restartable connectors', 'Explicit middleware order', 'Operable, not hidden', 'One event contract downstream'],
  },
  dce: {
    inputs: ['contract.yml files', 'Iceberg tables', 'Sample dataset slices', 'CI / orchestration triggers'],
    core: ['Contract validation engine', 'Format-aware checks', 'dataprof profiler core', 'CLI commands (validate / init / check)'],
    outputs: ['Pass/fail exit code', 'Structured violation reports', 'Schema + quality verdicts', 'Documented limitations'],
    constraints: ['Iceberg-first', 'Documented format gaps', 'Lightweight, no governance UI', 'CI-friendly'],
  },
  'lakehouse-starter-kit': {
    inputs: ['Source APIs (via dlt)', 'Raw object storage', 'dbt model definitions', 'Local credentials'],
    core: ['dlt ingestion', 'dbt transformations', 'Superset dashboards', 'MinIO S3-compatible storage'],
    outputs: ['Staged + marted tables', 'Live dashboards', 'Local lakehouse stack', 'Compose-up reproducibility'],
    constraints: ['Small-team scale', 'Replaceable components', 'No platform team required', 'S3-compatible by default'],
  },
  lakekeeper: {
    inputs: ['Iceberg REST requests', 'OIDC identities', 'Cloud storage credentials', 'OpenFGA authorization model'],
    core: ['Rust REST catalog service', 'Postgres-backed metadata', 'Vended credentials issuer', 'CloudEvents emitter'],
    outputs: ['Iceberg table metadata', 'Temporary storage credentials', 'Cross-engine query access', 'Audit + change events'],
    constraints: ['No JVM', 'Monthly release cadence', 'Multi-engine interoperability', 'Identity-aware by default'],
  },
  'peek-a-boo': {
    inputs: ['Target codebase tree', 'Natural-language mission', 'Token + step budgets', 'Allowed tool surface'],
    core: ['Python agent loop', 'Focused grep / ls primitives', 'Mission-shaped prompts', 'Bounded traversal'],
    outputs: ['Answers with evidence paths', 'Run telemetry', 'Token-cost summary', 'Reproducible benchmark runs'],
    constraints: ['Small tool surface by design', 'Hard step + token caps', 'No embeddings', 'No whole-repo context'],
  },
  'lance-bridge': {
    inputs: ['JetStream event batches', 'LanceModel schema', 'Embedding model (registry or batch)', 'Local LanceDB store path'],
    core: ['Python NATS consumer', 'Payload normalizer', 'Embedding computation', 'LanceModel writer'],
    outputs: ['LanceDB tables', 'Arrow-native query surface', 'Vector + semantic search', 'Compaction-ready storage'],
    constraints: ['Local-first, no vector DB cluster', 'Zero-copy reads', 'Stable event identifiers', 'Embedding metadata required'],
  },
  'druid-datafusion-bridge': {
    inputs: ['Druid segment files (index.dr)', 'Wikipedia segment fixtures', 'DataFusion SessionContext', 'Test query plans'],
    core: ['Segment parser layer', 'TableProvider adapter', 'ExecutionPlan adapter', 'Arrow-friendly conversion'],
    outputs: ['DataFusion-queryable tables', 'Integration test results', 'Offline segment access', 'Translated dictionaries + metrics'],
    constraints: ['No running Druid cluster needed', 'Vectorized where feasible', 'Work-in-progress evaluation', 'Format quirks preserved'],
  },
  'andreabozzo-site': {
    inputs: ['Structured JSON sources', 'Hugo blog content', 'README contribution badges', 'Live GitHub API'],
    core: ['Go harvester + generators', 'Rust/WASM workbench engine', 'Hugo blog build', 'Vercel-hosted Go API'],
    outputs: ['Generated case-study pages', 'Static GitHub Pages site', 'Live stats + badge endpoints', 'Interactive knowledge graph'],
    constraints: ['Static-first delivery', 'Live API only where needed', 'Typed inputs everywhere', 'No CMS, no SPA framework'],
  },
};

const data = JSON.parse(readFileSync(TARGET, 'utf8'));
let updated = 0;
let missing = [];

for (const item of data.items) {
  const anatomy = ANATOMY[item.slug];
  if (!anatomy) {
    missing.push(item.slug);
    continue;
  }
  item.systemAnatomy = anatomy;
  updated += 1;
}

writeFileSync(TARGET, JSON.stringify(data, null, 2) + '\n');

console.log(`updated ${updated} / ${data.items.length} case studies`);
if (missing.length) {
  console.log(`no anatomy mapping for: ${missing.join(', ')}`);
}
