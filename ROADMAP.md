# Roadmap — The Living Portfolio

This file tracks the post–Phase A evolution of the site. It captures the four
phases not yet shipped, each scoped to be independently shippable.

> **Phase A — Force-directed graph UI** has shipped (see commit history for
> the WASM `tick_layout` export, edge derivation in `build_workbench`, and the
> Canvas 2D renderer wired in [`assets/main.js`](assets/main.js)). It is the
> visible baseline that the remaining phases extend.

## Guiding decisions (locked)

The roadmap was negotiated end-to-end with the following non-obvious calls.
They are recorded here so future-me does not relitigate them.

- **No Parquet-in-WASM.** The dataset is in the kilobyte range; shipping a
  1.5–3 MB columnar runtime to query it is theatre, not engineering. Real ETL
  flex lives in multi-source ingestion + a versioned typed schema.
- **No SSE/WebSocket on Vercel.** The platform's function model isn't a fit
  for long-lived streams (Fluid Compute can stream responses, but it's not the
  right primitive for "live viewers" or push-based events at our scale).
  Client polling at 30s intervals captures ~80% of the perceived "aliveness"
  at near-zero cost.
- **Canvas 2D over WebGL** for the graph at ≤50 nodes. Scale-up path (WebGL,
  Barnes-Hut, etc.) is documented but deferred until node count justifies it.
- **No new Cargo deps for the simulation.** Handwritten spring-electrical
  forces are ~150 lines; pulling in a physics engine like `rapier2d` would be
  wrong-tool flex.

---

## Near-Term Websuite Focus

These are the product priorities for the next public-site passes. SEO metadata
work is no longer the main bottleneck; the site now needs sharper visitor
paths and better cross-surface discovery.

1. **Clear positioning.** Keep the homepage first viewport explicit:
   Andrea builds Rust/Python/Go data infrastructure, open-source tools,
   lakehouse systems, and technical writing for engineers. Avoid letting the
   "living map" metaphor carry the value proposition by itself.
2. **Proof layer.** Surface a compact proof path before the exploratory
   workbench: one built system, one upstream contribution track, one writing
   archive. Each proof item should link to a deeper asset.
3. **Business inquiries / recruiter path.** Keep contact routing simple:
   business inquiries, recruiters, and public proof. Avoid duplicating contact
   CTAs in multiple bars.
4. **Unified search / discovery.** Promote the workbench from a scoped filter
   into site-level search across case studies, blog posts, open-source
   contributions, papers, and topics. Keep the UI to one search input plus
   results; avoid extra helper bars unless usage proves they are needed.
5. **Internationalization consistency.** Decide whether the root site remains
   intentionally English-only or gains Italian summaries for the homepage and
   case studies. The blog is already bilingual, so the root surface should make
   that language boundary deliberate.

Deferred for later evaluation: editorial curation beyond the proof layer and
automated Lighthouse/visual smoke testing.

---

## Phase B — Query UI on top of the existing engine ✅ Shipped

**Goal:** A typed query bar over the workbench. Visible flex (visitors *type
queries*), no Parquet, no Polars-WASM.

**Why now:** Phase A gave the graph a strong visual identity. A query bar is
the natural input layer for it — the user can intersect topics and tags
narratively, and the graph re-converges on the result set in real time.

**Rust changes** ([`rust/site_engine/src/lib.rs`](rust/site_engine/src/lib.rs)):

1. New module (or inline section) `query` — recursive-descent parser for a
   small DSL:
   ```
   tech:rust AND (topic:streaming OR topic:data-platforms) AND stars:>50
   ```
   Operators: `AND`, `OR`, `NOT`, parens, `field:value`, `field:>num`,
   `field:<num`, free text (matches title/summary).
2. Evaluator: walks the AST against the same in-memory `WorkItem` structs
   already used by `build_workbench`. No new data layer.
3. Errors: parser returns a structured `QueryError { offset, message }` so the
   UI can underline.
4. Wire into the `build_workbench` payload as an optional `query` field
   replacing the current free-text matcher when present.

**Frontend** ([`assets/main.js`](assets/main.js), [`index.html`](index.html)):

- Replace the current `#workbench-search` input with a query bar. Show inline
  syntax errors (red underline + tooltip).
- "Did you mean" suggestions for known fields/values, derived from the data
  itself (techs that exist, topics that exist).
- Bare words without `field:` keep working as free-text search — same
  behaviour as today.

**Verification:**

- New `query.rs` unit tests covering: precedence,
  parens, NOT, numeric comparisons, malformed input.
- Query bar updates the graph in real time (Phase A integration check).
- Empty/invalid queries don't crash; engine returns last valid result + error
  string.
- The overloaded `AI + FinOps` filter has been replaced with `ML systems`;
  FinOps/cost/DBU signals now classify under `Data platforms`, while TinyML,
  agent, robotics, and applied-ML signals classify under `ML systems`.

**Cost estimate:** ~1 weekend. Mostly parser + tests; the evaluator is small
because the data is already in memory.

---

## Phase C — Multi-source harvester + typed schema

**Goal:** Authentic ETL story without any WASM tax. Versioned schema, multiple
sources, validation gates in CI.

**Why this is real flex:** A single GitHub harvester is a script. Multiple
sources behind a typed boundary, with end-to-end schema validation between
producer and consumer, is a small data platform. The dataset stays JSON-on-the-
wire because that fits the actual volume.

**New sources:**

1. **Local Hugo blog index**: parse front matter from
   [`blog/content/posts/`](blog/content/posts/) and emit writing records with
   language, tags, dates, summaries, word counts, and related project links.
   This replaces Dev.to/Medium because the repo-hosted blog is the canonical
   writing archive.
2. **GitHub contributions + repositories**: keep the existing external merged
   PR tracking, then add owned-repository metadata: stars, forks, topics,
   primary language, pushed date, and releases for selected repos.
3. **Package registries**: enrich published OSS packages from **PyPI** and
   **crates.io**. Skip npm unless there is an actual package to track later.
4. **CI runtimes**: GitHub Actions API per repo — workflow run durations.
   Aggregate to median/p95 per workflow and expose recent build health.
5. **Research/publication metadata**: keep
   [`assets/data/papers.json`](assets/data/papers.json) as the curated source
   of truth, with optional DOI/ORCID/OpenAlex enrichment only when stable
   identifiers exist.

**Non-goals for this phase:**

- Dev.to and Medium mirrors — not used, so they would create fake surface area.
- LinkedIn, Google Scholar, or clap/view-count scraping — fragile and noisy.
- npm registry ingestion — no current package surface.
- Weather/uptime widgets — fun but not portfolio-relevant.

**Schema layer:**

1. Define Go structs in `internal/harvester/schema/` with version tags
   (e.g. `type ContributionV1 struct { ... }`).
2. Generate JSON Schema files (`schema/*.schema.json`) via
   `github.com/invopop/jsonschema` or equivalent.
3. Generate TypeScript types via `quicktype` or a small hand-written codegen
   into `assets/types/`.
4. CI gate: schema validation runs against committed JSON in
   [`.github/workflows/pages.yml`](.github/workflows/pages.yml) before deploy.
5. Schema version embedded in each JSON file as `"$schemaVersion": "v1"`.
   Bump on breaking changes.

**Harvester structural changes** ([`cmd/harvester/`](cmd/harvester/),
[`internal/harvester/`](internal/harvester/)):

- Each source becomes a `Source` interface implementation:
  `Fetch(ctx) (Records, error)`.
- Existing GitHub logic
  ([`internal/harvester/readme_contributions.go`](internal/harvester/readme_contributions.go))
  refactored to fit the interface — no behavioural change, just shape.
- Per-source rate-limiting, retry, and **idempotent caching** (write-through
  cache to `.harvester-cache/` so dev runs don't hammer APIs).
- New subcommands: `harvester ingest --source blog`,
  `harvester ingest --source packages`, `harvester ingest --source github`,
  `harvester ingest --source ci`, and `harvester ingest --all`.
  PyPI and crates.io are configured under the unified `packages` source so the
  generated package artifact cannot be accidentally replaced by a partial
  ecosystem-only run.
- Daily cron in
  [`.github/workflows/update-contributions.yml`](.github/workflows/update-contributions.yml)
  extended to run `--all`.

**Vercel migration ([`vercel.json`](vercel.json) → `vercel.ts`):**

- Install `@vercel/config`.
- Move route config + cache-control headers to typed `vercel.ts`.
- Keep behaviour identical; verify with `vercel deploy --prebuilt` preview
  before merging.

**Verification:**

- `harvester ingest --all` runs locally with cached responses; produces JSON
  files that validate against schemas.
- CI fails on schema mismatch (test by intentionally breaking a schema in a
  draft PR).
- Vercel preview from `vercel.ts` returns identical responses to the current
  `vercel.json`-based deployment for `/api/github/stats` and
  `/api/github/badge`.
- Frontend renders new blog, package-registry, GitHub, and CI-runtime data on
  the homepage and graph (some new tech/topic nodes appear).

**Cost estimate:** 2–3 weekends. The boring middle: schema codegen, source
interface, cache layer, CI gate.

---

## Phase D — Client-side polling polish

**Goal:** Make the graph feel alive at near-zero cost.

**Why polling, not SSE:** Discussed above. Vercel function cost + connection
limits make SSE the wrong primitive at this scale.

**Implementation** ([`assets/main.js`](assets/main.js)):

1. Every 30s while tab is visible
   (`document.visibilityState === 'visible'`), fetch
   `/api/github/stats`.
2. Diff against the last response. If new stars/repos/etc., briefly highlight
   the relevant node (CSS pulse on the canvas node + drop sparkle particles
   for ~1.5s).
3. Backoff to 5min when the tab is hidden.
4. Respect `prefers-reduced-motion` — silent state update, no pulse.

**No backend changes.** This is a frontend-only phase; Vercel function and
cache headers stay as-is.

**Verification:**

- Open site, wait 30s, see network call. Star one of the repos from another
  browser; within 30s, watch the matching node pulse.
- DevTools → throttle to "Offline" → no console errors, polling pauses
  gracefully.
- Lighthouse: no regression vs. Phase A.

**Cost estimate:** half a weekend. Mostly visual polish on the canvas
renderer.

---

## Phase E — `ssh cv.andreabozzo.com` (parallel project)

**Goal:** Terminal-native portfolio. Treated as a sibling project, not gated
on B–D.

**Stack:**

- `github.com/charmbracelet/wish` (SSH server) + `bubbletea` (TUI) +
  `lipgloss` (styling).
- New module under `cmd/sshtui/` reusing
  `internal/harvester/schema/` types from Phase C — same data, different
  surface.

**Hosting (locked: Hetzner CX11, ~€4.50/mo):**

- Ubuntu 24.04. Go binary as a systemd unit on port 2222 (or 22 if accepting
  the firewall risk).
- DNS: `cv.andreabozzo.com` A record → server IP. **Requires acquiring
  `andreabozzo.com`** if not yet owned.
- TLS not applicable — SSH has its own crypto. Generate a host key, commit the
  *public* fingerprint to the README so visitors can verify.
- Logs: `journalctl -u cv-tui` is fine.

**TUI structure:**

- Main menu: Case studies / Blog posts / Stats / About / Quit.
- Pages render markdown via `glamour`.
- Live stats page calls the same `/api/github/stats` endpoint over HTTPS —
  one source of truth across web + terminal.

**Verification:**

- `ssh -p 2222 cv.andreabozzo.com` from a clean machine drops into the menu.
- All four sections navigate cleanly with arrow keys + enter; `q` quits.
- Restart the systemd unit; reconnect within 5s.
- Cost-cap: confirm Hetzner billing dashboard shows < €5/mo after first
  month.

**Deferred decisions (don't block):**

- Domain acquisition timing.
- Whether to expose port 22 (more discoverable) vs. 2222 (safer default).
- Analytics — probably none, privacy-first.

**Cost estimate:** 1–2 weekends, dominated by infra setup and DNS rather than
code.

---

## Cross-cutting

**Don't break what works:**

- The DOM fallback in [`assets/main.js`](assets/main.js) for when WASM fails
  must stay functional through every phase. If WASM fails to load, render the
  list view; never a broken canvas.
- Service worker cache version
  ([`sw.js`](sw.js)) must bump on every assets-shape change or users will see
  stale builds.
- `npm run build:site` must continue to be the single command CI runs.

**Each phase ships independently.** Own branch, own PR, own deploy. No phase
depends on a future phase compiling first.

**Telemetry / measurement:** No analytics added in this roadmap. If we want
to know whether visitors *use* the graph or query bar, that is a separate,
opt-in conversation about privacy.

---

## Critical files

| File | Touched in |
| --- | --- |
| [`rust/site_engine/src/lib.rs`](rust/site_engine/src/lib.rs) | B |
| [`rust/site_engine/Cargo.toml`](rust/site_engine/Cargo.toml) | — (no new deps planned) |
| [`assets/main.js`](assets/main.js) | B, D |
| [`index.html`](index.html) | B (query bar markup) |
| [`assets/styles.css`](assets/styles.css) | B, D |
| [`cmd/harvester/main.go`](cmd/harvester/main.go) | C |
| [`internal/harvester/`](internal/harvester/) | C |
| [`pkg/githubstats/client.go`](pkg/githubstats/client.go) | — (unchanged) |
| [`api/github/stats/index.go`](api/github/stats/index.go) | C (config migration only) |
| [`assets/data/case-studies.json`](assets/data/case-studies.json) | C (schema-versioned) |
| [`assets/data/contributions.json`](assets/data/contributions.json) | C (schema-versioned) |
| [`assets/data/papers.json`](assets/data/papers.json) | C (schema-versioned) |
| [`.github/workflows/pages.yml`](.github/workflows/pages.yml) | C (schema-validation gate) |
| [`.github/workflows/update-contributions.yml`](.github/workflows/update-contributions.yml) | C (multi-source) |
| `vercel.json` → `vercel.ts` | C |
| [`sw.js`](sw.js) | every phase, bump version |
| `cmd/sshtui/` (new) | E |
| `internal/harvester/schema/` (new) | C |
