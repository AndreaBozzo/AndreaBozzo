---
title: "dbt rewrote itself in Rust. The speed is the boring part."
date: 2026-08-04T10:00:00+02:00
draft: false
tags: ["dbt", "Rust", "DuckDB", "Apache Arrow", "DataFusion", "Iceberg", "Open Source", "Data Engineering"]
categories: ["Data Engineering", "Open Source"]
keywords: ["dbt Core v2", "dbt Fusion", "SDF Labs", "Rust", "DuckDB", "Iceberg REST", "AWS Glue", "DataFusion", "Parquet artifacts", "open source contribution"]
description: "dbt Core's main branch has no Python engine left in it. 77 Rust crates, 18 stray .py files, no runtime. Everyone is talking about parse times. Parse times are the least interesting thing that happened."
summary: "I opened a bug report against dbt and found a codebase nobody had told me about: 77 Rust crates where the Python used to be. This is what the rewrite is actually for, why the marketing undersells it, and what I broke loose while poking at it — two fixes, both for bugs that never printed an error."
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
    image: "images/dbt-fusion-cover.png"
    alt: "dbt Core v2: 77 Rust crates, 18 Python files, no Python runtime"
    caption: "Two engines walked in. One walked out, under Apache 2.0."
    relative: false
    hidden: false
---

I went to fix a one-line bug in dbt and ended up reading a C++ file in a DuckDB extension at
midnight, which is not where I expected the evening to go.

The trip started with a surprise. Clone `dbt-labs/dbt-core`, check out `main`, and the Python
engine is gone. Not shrunk — gone. The Cargo workspace lists 77 crates. The entire repository
contains 18 `.py` files and not one of them is a CLI. The Python dbt that runs in production
at your company is still alive and still shipping, but it moved house: it lives on the
`1.latest` branch now. `main` is dbt Core v2.0, in alpha since June 2026, Rust from the
argument parser down.

I contributed two fixes while I was in there. They are small and I will get to them, because
one of them is a nice piece of graph-theory carelessness and the other required arguing with
a maintainer's checklist. But the fixes are the smaller half of what I got. The larger half
was working out *why* anyone rewrites a ten-year-old tool with an enormous installed base in
a different language — and discovering that the reason on the tin is not the real one.

## How dbt ended up running two engines at once

The rewrite did not start inside dbt Labs. That is the part most summaries skip.

In early 2025 dbt Labs bought SDF Labs, a team building a Rust SQL compiler. In May 2025 that
work surfaced as the **dbt Fusion engine**: new code, built for speed and for something the
announcement called *SQL comprehension*, shipped under ELv2. Not Apache 2.0. Some pieces —
dbt-jinja, the adapters, the grammars, the specs — were open from the start. The engine was
not, and the community noticed.

What followed was a genuinely strange year, and you do not have to take my word for it,
because dbt Labs wrote it down. The repo has a `docs/roadmap/` directory going back to 2022,
and the June 2026 entry is startlingly candid. They were building two things at once: a fast
SQL-comprehending engine, and a beat-for-beat Rust reimplementation of dbt Core conformant
with every v1 behaviour except the ones they broke deliberately. Every bug got triaged, fixed
and tested twice. Two languages. Two test frameworks. Their words: it "definitely slowed us
down, and risks divergence of behavior."

Then in June 2026 the two collapsed into one. The core of the Rust rewrite shipped as dbt
Core v2.0 — alpha, Apache 2.0, on `main`. The `dbt-fusion` repo was archived. The separate
adapter repos were folded into the monorepo. And it all landed the same week Fivetran and dbt
Labs announced they were becoming one company, which is a lot of merging for one news cycle.

My favourite line in that roadmap post is an admission against interest. The Fusion releases
had been numbered `2.0.0.xxx` since the very first one, in May 2025. They had been quietly
calling it v2 for a year before they admitted it was v2. As the post puts it: they had the
date right, just the year was off by one.

So what exists now is one codebase, two distributions. **dbt Core** is the Apache 2.0 baseline.
**Fusion** is the same engine plus the SQL comprehension features — linting, column-level
lineage — behind `dbt login`. One language spec, one adapter layer, code portable both ways.

You can watch that boundary live, because the changelog is a single file with tagged entries:

```
- [dbt-core] Databricks: detect a changed view definition so that view_update_via_alter …
- [fusion]   dbt lint: do not raise UnionColumnCountMismatch (dbt0165 / AM07) for BY NAME …
- [internal] Add a run-cache unit test pinning that a model materialized as a built-in name …
```

That file tells you more than any licensing FAQ. `[fusion]` is almost entirely linting, the
language server, state caching. `[dbt-core]` is materializations, adapters, correctness. The
line between them is not arbitrary and it is not really about licensing: it falls almost
exactly between *running your project* and *understanding your project*.

![Two engines into one](/AndreaBozzo/blog/images/dbt-two-engines-timeline.png "From the SDF acquisition to dbt Core v2.0 alpha: what was ELv2, what was Apache 2.0, and what merged")

Some context on the pace, because it changes how contributing feels: `CHANGELOG-fusion.md`
records **181 preview releases** of 2.0.0. Preview 204 shipped 29 July 2026. Preview 205
shipped 31 July. Each one credits its external contributors — nine of them on 205 alone. Your
patch is not waiting for a quarterly release train.

## What actually got rewritten

| Layer | Crates |
|---|---|
| DAG and traversal | `dbt-dag`, `dbt-scheduler`, `dbt-selector-parser` |
| Jinja runtime | `dbt-jinja` (a minijinja fork), `dbt-jinja-ctx`, `dbt-jinja-filters` |
| SQL front end | `dbt-sql/dbt-lexer-{bigquery,databricks,duckdb,redshift,snowflake,trino}` |
| Adapters and catalogs | `dbt-adapter`, `dbt-adapter-core`, `dbt-adapter-sql`, `dbt-adbc` |
| Schema and validation | `dbt-schemas`, `dbt-schema-store` |
| Metadata and lineage | `dbt-metadata`, `dbt-metadata-parquet`, `dbt-lineage-core` |
| Query execution over metadata | `dbt-df-providers` |

Fourteen adapter macro packages now sit in that same repository — BigQuery, Databricks,
Snowflake, Redshift, Postgres, DuckDB, Spark, Fabric, ClickHouse, Exasol, Salesforce and
friends — where they used to be separate projects with separate release cycles and separate
maintainer bandwidth.

And "rewritten in Rust" here does not mean what it usually means. This is not Python with the
hot paths shoved into a native extension. There is no Python runtime in the loop at all. v2
ships as one self-contained binary. The only `pyo3` in the whole workspace is
`crates/dbt-jinja/minijinja-py` — the vendored Python bindings *of* minijinja, which the CLI
never touches. The `pyproject.toml` at the repo root is there so the binary can be shipped as
a pip wheel. It does not run anything.

![The dbt Core v2 crate map](/AndreaBozzo/blog/images/dbt-fusion-crates.png "77 workspace crates and 14 bundled adapters, grouped by what they replaced")

## Six lexers is not a performance optimisation

Every announcement leads with parse and compile times. Fine — they are real, and v1.12 even
ships the new parser behind `dbt parse --use-v2-parser` so you can feel it without migrating.

But go back and look at the SQL front end. Six lexers. One per warehouse dialect.

Nobody writes six lexers to go faster. You write six lexers because you have decided to stop
treating SQL as a string.

That single decision is load-bearing for everything in the `[fusion]` column. That linting
rule about `UnionColumnCountMismatch` on `UNION ALL BY NAME` has to know what a set operation
is and how that dialect matches columns. Column-level lineage has to resolve which output
column came from which input expression. A language server has to offer completions inside a
model you are halfway through typing.

My favourite of the lot is "symbolic" or "skeleton" SQL linting, which parses SQL that still
has Jinja holes in it. One changelog entry is about allowing a CTE name in a `WITH` clause to
be a Jinja hole "without making every identifier position holeable." That is a sentence which
can only exist in a universe where somebody is parsing your templated SQL structurally,
before rendering, and cares about where the holes are allowed to be.

A Python engine that string-substitutes Jinja and posts the result to a warehouse cannot do
any of this at any speed. So the "it's faster now" framing genuinely undersells the work. The
rewrite bought a whole *category* of capability. The latency win is a side effect.

The stricter spec falls out of the same decision. v1.10 and v1.11 started warning about
misspelled or misplaced configs; v2 makes them errors, from the same strongly-typed schemas.
You can only enforce that once there is a typed thing to enforce against — which, as it turns
out, is exactly the layer I ran into from the wrong side. More on that shortly.

## The metadata is Parquet now, and DataFusion queries it

Here is the part I did not see coming.

v2 emits its artifacts as Parquet, not just JSON. `dbt-metadata-parquet` has a module per
artifact family: parsed nodes, compiled nodes, column-level-lineage epochs, run results,
invocations, freshness. `manifest.json` still exists for compatibility, but it is no longer
the primary representation. Then `dbt-df-providers` hands the schema store to DataFusion as a
catalog provider, so the engine resolves and queries its own metadata lazily instead of
registering every table up front.

The visible payoff is the rewritten `dbt docs`, which reads those files instead of shoving a
giant JSON blob into your browser and hoping.

The payoff I actually care about is in the roadmap. Because project metadata is now a columnar
dataset with a query engine in front of it, **project quality checks can be written as SQL** and
folded into the task graph. Block a `dbt build` because a model has no owner, or violates a
naming convention, or selects from a source it has no business selecting from — as a metadata
query. Not as Jinja `{{ graph }}` manipulation, which the roadmap post describes as "as
impressive as it is illegible", and which anyone who has read dbt-project-evaluator will
recognise as generous.

So the state of your dbt project is now a queryable columnar dataset, and the thing querying
it is the same DataFusion runtime you would reach for against your warehouse extracts. If you
read the [Lance Format article](../lancearticle-blog/) or the
[Arrow work behind dataprof](../arrowfordataprof-blog/), this is that stack turning up one
floor higher than I expected: not under the storage, but under the transformation tool's own
bookkeeping.

## Two bugs, and neither of them said a word

Which is what I was doing in there in the first place. Both fixes are small. What makes them
worth the space is that neither bug printed anything. One returned an empty set. The other
threw away half your config on the way to the database. Both looked like success.

### The operator that quietly returned nothing

dbt's `@` operator means: the node, its descendants, and the ancestors of those descendants.
It is what you reach for when you want to rebuild everything that feeds anything downstream.

Chain of three, `a → b → c`, where `c` has no children. `@b` gave you `a, b, c`. `+c` gave you
`a, b, c`. And `@c` gave you nothing at all — not an error, an *empty selection*, which dbt
then executed cheerfully by doing no work whatsoever.

Sit with that for a second. If `@leaf` is in a CI job, that job goes green. It goes green
because it tested nothing, and green is green.

The cause is in `collect_childrens_parents` in `dbt-scheduler`, and it is the kind of thing
that reads as obviously correct until it isn't. Both `downstream()` and `upstream()` return
*edges*, not nodes. A leaf has no outgoing edges. So the descendant set comes back empty, the
leaf-detection pass has nothing to iterate over, and the ancestor walk never runs. The logic
was right for every node with at least one child — an assumption nobody ever wrote down,
because on a whiteboard "a node is its own descendant" is too obvious to say out loud.

Two lines of intent fix it. Seed the leaf candidates with the selected nodes themselves. Then
insert each leaf explicitly before walking its ancestors, because an isolated node has no
upstream edges either, and the same trap is waiting one level down:

```rust
    let leaf_nodes: BTreeSet<String> = desc
        .keys()
        .chain(desc.values().flatten())
        .chain(selected_nodes)
        .filter(|node| {
            // A node is a leaf if it has no outgoing dependencies in the descendant graph
            !desc.contains_key(*node) || desc.get(*node).is_none_or(|children| children.is_empty())
        })
        .cloned()
        .collect();
    for leaf in leaf_nodes {
        add_nodes(upstream(deps, &leaf, u32::MAX), &mut selected);
        selected.insert(leaf);
    }
```

Non-leaf behaviour is untouched: selected nodes enter the candidate set, and the filter drops
them the moment they have outgoing edges. And the same fix covers the `childrens_parents:
true` YAML selector, which compiles down to the same traversal — so if you keep your selectors
in `selectors.yml` you had the identical bug wearing different syntax.

### A config that validated, then evaporated

The second one lives in the gap between that lovely typed schema layer and what actually comes
out the other end.

`catalogs.yml` v2 lets you attach DuckDB to an Iceberg REST catalog, and for AWS there is a
shortcut: name the *kind* of endpoint and let DuckDB work out the rest.

```yaml
catalogs:
  - name: aws_glue
    type: glue
    table_format: iceberg
    config:
      duckdb:
        endpoint_type: GLUE
        secret: glue_s3
```

The schema takes this extremely seriously. `endpoint_type` is enumerated to `GLUE` and
`S3_TABLES`. Mutually exclusive with `endpoint`, exactly one required. `S3_TABLES` also
requires `warehouse`. `authorization_type` cannot be combined with `endpoint_type`. Four rules,
all enforced, all correct.

Then the builder composed the `ATTACH` statement and never emitted `ENDPOINT_TYPE` at all.

You end up somewhere genuinely nasty. Your config is valid, so nothing warns you. DuckDB gets
a statement with no `ENDPOINT`, no `ENDPOINT_TYPE`, no `AUTHORIZATION_TYPE`, shrugs, and falls
back to its oauth2 default — wrong for Glue and wrong for S3 Tables. And you cannot even hack
around it, because the schema forbids you from setting `authorization_type` yourself. Valid
config, wrong behaviour, no escape hatch.

![Validated, then dropped](/AndreaBozzo/blog/images/dbt-endpoint-type-drop.png "Every schema rule passed. The statement that came out the other side was missing the option that mattered.")

The regression traces cleanly, and it is a small monument to what consolidation costs.
`ENDPOINT_TYPE` emission was added in May 2026 and removed a month later by `dfe9a517c`, the
first part of the catalogs stack rewrite. That commit kept every schema rule and dropped the
builder branch. In the same breath it deleted `glue_minimal` and
`glue_with_secret_and_endpoint_type` — which is to say, every Glue attach fixture in the
repository. No fixture, no failing test, no signal. The validation-only tests kept passing,
and they were right to: validation was never the thing that broke.

The fix restores those fixtures and adds two more. The bit that took longest is invisible in
the diff — DuckDB reads the `ATTACH` operand for Glue as a *catalog path* and checks it
against its own grammar (`':'`, a twelve-digit account id, `'cat1/cat2'`). The old default,
the dbt catalog name, fails that check outright. So even a correctly emitted `ENDPOINT_TYPE`
would have attached to precisely nothing.

### The part where I argue with the issue

The issue was filed by a dbt Labs maintainer, rewritten once against a fresh checkout, and
came with a tidy five-item checklist. It is a good issue — better than most of mine. Two items
do not survive contact with the source.

It says to give Glue an `AUTHORIZATION_TYPE 'SIGV4'` default. Correct, and also a trap: it must
never combine with `endpoint_type`, because `S3OrGlueAttachInternal` sets SigV4 itself and
DuckDB then throws `'endpoint_type' can not be combined with 'authorization_type'`. Ship both
and you have traded a silent misconfiguration for a hard crash at attach time. Arguably an
upgrade. Not the fix.

It also says a bare `endpoint` URL gets double-schemed into `https://https://`. It does not.
`AddHttpHostIfMissing` is four lines long and hands the input straight back when a scheme is
already there. The genuinely surprising behaviour is the last line of that function: a *bare*
host gets `http://`. Not https. That is the thing worth documenting, and it is roughly the
opposite of what the checklist asked me to normalise away.

Neither correction was a judgement call. Both are sitting in a file anyone can open. I would
not have found either from the documentation, because documentation describes intent, and
intent is not what the extension executes. This is the midnight C++ I mentioned at the top,
and I would do it again.

## Nobody tells you the repo is a mirror

Here is the thing that caught me completely off guard, and it is not in any contributing guide.

`dbt-labs/dbt-core` on GitHub is a mirror. You open a PR, a bot copies your change into dbt
Labs' internal review repository, a maintainer reviews it *there*, and if it merges it comes
back to public `main` on a periodic sync. Then the bot closes your PR for you.

So my `@` operator PR shows as **closed**. Not merged — closed. Read only that and you would
assume it was rejected. It wasn't: the fix is in `main`, it landed 27 July 2026 as commit
`f95a810b7`, authored by the sync bot, and my PR closed the next day when the sync caught up.
The changelog entry has my name on it. The commit does not.

I am not complaining — for a company shipping a commercial distribution out of a shared
codebase it is a reasonable setup, and the bot narrates every step politely. But the universal
signal for "did my contribution land" is inverted here, and you find that out after you have
already opened the PR.

Two other things worth knowing before you start:

**The golden tests are the contract.** `dbt-goldie` is the in-house snapshot harness;
`GOLDIE_UPDATE=1 cargo test -p <crate>` regenerates fixtures. Some goldens — the catalogs JSON
schema among them — can only be regenerated with internal tooling. If your change touches a
schema doc string, say so in the PR description and let a maintainer handle it, rather than
shipping something that goes red on their side and looks like your fault.

**Conformance is the whole personality of this project.** dbt Labs spent six-plus months
asking one question of every change: same project in, same results as v1 out? Thousands of
bugs fell out of that. Once you know it, the codebase stops looking paranoid and starts making
sense — the `record_replay` module in the adapter layer, the fixture-heavy tests, the
insistence that behaviour changes be scoped and named. A patch that quietly moves output on an
unrelated path is the exact thing this project was built to catch.

## If you are still on v1 — and you are

Almost everyone is, and none of this changes that yet.

v2.0 is alpha. Python v1 lives on `1.latest`. v1.12 shipped in May 2026 with a genuinely
strong feature list, and patch releases still come from that branch. dbt Labs have said v1 is
not going anywhere soon and that they will watch v2 adoption before making long-term
maintenance calls.

What alpha means in practice is that they want your project to break it, and they say so
plainly: the parity work was done against projects they control, and the interesting edge
cases live in yours. Cheapest first step is `dbt parse --use-v2-parser` on v1.12 — though be
warned, the whole point of the new parser is that it stops forgiving things the old one
ignored, so a clean run is not guaranteed and a dirty run is the useful outcome.

And if you are already on v2 with DuckDB and a Glue or S3 Tables catalog: skip `endpoint_type`
until my fix lands. Set `endpoint` to a bare regional host, `warehouse` to your AWS account id,
and `authorization_type: SIGV4` by hand.

## Where the work is

The `@` operator fix is in `main` as `f95a810b7`, via
[#15372](https://github.com/dbt-labs/dbt-core/pull/15372) and issue
[#15280](https://github.com/dbt-labs/dbt-core/issues/15280). The DuckDB `ENDPOINT_TYPE` fix is
[#15764](https://github.com/dbt-labs/dbt-core/pull/15764), against issue
[#15725](https://github.com/dbt-labs/dbt-core/issues/15725) — open and unreviewed as I hit
publish.

Do yourself a favour and read
[`docs/roadmap/`](https://github.com/dbt-labs/dbt-core/tree/main/docs/roadmap) in the repo
itself. A decade of roadmap posts, written by people who are clearly enjoying themselves, with
jokes and off-by-one gags and the occasional public wince. If you want the story of how a
Python tool became a Rust one without the press-release compression, that directory beats
anything I can summarise here.

What I cannot tell you is how the review of #15764 goes. I think the `endpoint_type` ×
`authorization_type` exclusivity rule mirrors DuckDB's own hard error and is therefore exactly
the contract dbt wants to keep. A maintainer may well know a reason it was only ever meant to
be temporary. That is the honest state of an open PR: you can read every line of source
involved and still not know why somebody wrote it that way.
