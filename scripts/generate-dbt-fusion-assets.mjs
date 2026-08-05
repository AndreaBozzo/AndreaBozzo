import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Figures for the "dbt rewrote itself in Rust" post. Same canvas, palette and helper
// vocabulary as generate-nephtys-assets.mjs / generate-zerobus-assets.mjs so the visual
// language stays consistent across posts.
//
// Every claim rendered below is derived from the dbt-core checkout at c:\dev\dbt-core:
//   - 77 crates          -> `members = [...]` in Cargo.toml, entries under crates/
//   - 18 .py files       -> git ls-files '*.py'
//   - 14 adapters        -> crates/dbt-loader/src/dbt_macro_assets/
//   - 181 previews       -> grep -c '^## 2.0.0-preview' CHANGELOG-fusion.md
//   - the timeline       -> docs/roadmap/2025-05-new-engine-same-language.md
//                           and docs/roadmap/2026-06-announcing-v2.md
//   - the fixed ATTACH   -> crates/dbt-adapter/tests/duckdb_attach_fixtures/
//                           iceberg_rest_endpoint_type_glue/output.snap on the fix branch
//   - the broken ATTACH  -> derived from build_duckdb_catalog_attach_stmt on origin/main,
//                           where catalog_attach_defaults(IcebergRest) is `_ => &[]`, so
//                           the emitted options are exactly TYPE ICEBERG, SECRET, READ_ONLY
// Do not edit a value here without re-deriving it from those sources.

const outDir = new URL('../blog/static/images/', import.meta.url);
const outPath = fileURLToPath(outDir);

const colors = {
  bg: '#101417',
  panel: '#f8fafc',
  panel2: '#eef2f7',
  ink: '#111827',
  muted: '#64748b',
  line: '#d7dee9',
  red: '#ff5f57',
  green: '#16a34a',
  blue: '#2563eb',
  cyan: '#0891b2',
  amber: '#d97706',
  purple: '#7c3aed',
  // The two engines, used consistently across all four figures: Python/v1 in amber,
  // Rust/v2 in blue. Same categorical pair the Nephtys post validated against the
  // light panel surface (CVD separation dE 32.3 protan / 29.3 tritan, contrast >= 3:1).
  python: '#d97706',
  rust: '#2563eb',
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function baseSvg(width, height, body) {
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${colors.bg}"/>
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#020617" flood-opacity="0.22"/>
    </filter>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${colors.muted}"/>
    </marker>
    <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${colors.red}"/>
    </marker>
    <style>
      .sans { font-family: Inter, "IBM Plex Sans", Arial, sans-serif; }
      .mono { font-family: "IBM Plex Mono", Consolas, monospace; }
      .label { fill: ${colors.muted}; font-size: 24px; font-weight: 600; }
      .body { fill: ${colors.ink}; font-size: 30px; font-weight: 600; }
      .small { fill: ${colors.muted}; font-size: 20px; }
      .tiny { fill: ${colors.muted}; font-size: 17px; }
      .title { fill: #f8fafc; font-size: 70px; font-weight: 760; letter-spacing: 0; }
      .subtitle { fill: #cbd5e1; font-size: 28px; font-weight: 500; }
    </style>
  </defs>
  ${body}
</svg>`;
}

function roundedRect(x, y, w, h, fill = colors.panel, stroke = colors.line, r = 18) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#shadow)"/>`;
}

function pillWidth(text) {
  return Math.max(110, text.length * 12 + 34);
}

function pill(x, y, text, fill, ink = '#fff') {
  const width = pillWidth(text);
  return `
    <rect x="${x}" y="${y}" width="${width}" height="40" rx="20" fill="${fill}"/>
    <text x="${x + width / 2}" y="${y + 27}" text-anchor="middle" class="sans" fill="${ink}" font-size="18" font-weight="700">${esc(text)}</text>`;
}

// Anchor a pill to a panel's right edge. Self-sizing pills at a fixed x collide with
// the panel label as soon as the label or the pill text grows, so derive x instead.
function pillRight(panelX, panelW, y, text, fill) {
  return pill(panelX + panelW - 24 - pillWidth(text), y, text, fill);
}

// A layer row: accent spine, layer name on the left, the crates that implement it on
// the right. Sized for a 64px row so seven of them fit one canvas.
function layerRow(x, y, w, h, name, crates, accent, emphasis = false) {
  return `
    ${roundedRect(x, y, w, h, emphasis ? '#fff7ed' : colors.panel, emphasis ? '#fdba74' : colors.line)}
    <rect x="${x}" y="${y}" width="10" height="${h}" rx="5" fill="${accent}"/>
    <text x="${x + 30}" y="${y + 40}" class="sans" fill="${colors.ink}" font-size="23" font-weight="700">${esc(name)}</text>
    <text x="${x + 330}" y="${y + 40}" class="mono" fill="${emphasis ? '#9a3412' : colors.muted}" font-size="17">${esc(crates)}</text>`;
}

// A milestone marker on a timeline lane.
function milestone(cx, cy, fill) {
  return `
    <circle cx="${cx}" cy="${cy}" r="15" fill="${colors.bg}" stroke="${fill}" stroke-width="6"/>`;
}

async function renderPng(name, svg, width = 1600, height = 900) {
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png({compressionLevel: 9})
    .toFile(join(outPath, name));
}

function cover() {
  const body = `
    <text x="92" y="120" class="sans subtitle">dbt Core v2.0 · alpha since June 2026 · Apache 2.0</text>
    <text x="92" y="216" class="sans title">dbt rewrote itself in Rust</text>
    <text x="92" y="282" class="sans subtitle">The speed is the boring part</text>

    ${roundedRect(92, 370, 440, 210)}
    <text x="132" y="428" class="sans label" font-size="19">THE WORKSPACE</text>
    <text x="132" y="486" class="sans" fill="${colors.rust}" font-size="44" font-weight="760">77 crates</text>
    <text x="132" y="534" class="sans small">plus 14 adapters, same repo</text>
    ${pillRight(92, 440, 396, 'Rust', colors.rust)}

    ${roundedRect(580, 370, 440, 210)}
    <text x="620" y="428" class="sans label" font-size="19">PYTHON RUNTIME</text>
    <text x="620" y="486" class="sans" fill="${colors.ink}" font-size="44" font-weight="760">none</text>
    <text x="620" y="534" class="sans small">18 stray .py files, not one a CLI</text>
    ${pillRight(580, 440, 396, 'one binary', colors.green)}

    ${roundedRect(1068, 370, 440, 210)}
    <text x="1108" y="428" class="sans label" font-size="19">SQL FRONT END</text>
    <text x="1108" y="486" class="sans" fill="${colors.ink}" font-size="44" font-weight="760">6 lexers</text>
    <text x="1108" y="534" class="sans small">one per warehouse dialect</text>
    ${pillRight(1068, 440, 396, 'not a string', colors.purple)}

    <line x1="92" y1="668" x2="1508" y2="668" stroke="#334155" stroke-width="2"/>
    <text x="92" y="736" class="sans subtitle">Nobody writes six lexers to go faster.</text>
    <text x="92" y="792" class="sans" fill="${colors.muted}" font-size="24">SDF Labs → Fusion under ELv2 (May 2025) → dbt Core v2.0 under Apache 2.0 (June 2026) · 181 preview releases</text>
  `;
  return baseSvg(1600, 900, body);
}

// The two lanes swap at June 2026: what was on `main` moves to `1.latest`, and what was
// the ELv2 engine becomes `main`. Drawing it as a crossing rather than a merge matters --
// the Python engine did not stop, it moved.
function timeline() {
  const laneTop = 360;
  const laneBottom = 620;
  const swapX = 1120;

  const body = `
    <text x="80" y="82" class="sans subtitle">From an acquisition to a major version</text>
    <text x="80" y="146" class="sans title">Two engines, then one</text>

    <text x="80" y="252" class="sans" fill="#94a3b8" font-size="21">early 2025</text>
    <text x="470" y="252" class="sans" fill="#94a3b8" font-size="21">May 2025</text>
    <text x="740" y="252" class="sans" fill="#94a3b8" font-size="21">the year in between</text>
    <text x="1240" y="252" class="sans" fill="#94a3b8" font-size="21">June 2026</text>

    <line x1="200" y1="${laneTop}" x2="${swapX}" y2="${laneTop}" stroke="${colors.python}" stroke-width="8" stroke-linecap="round"/>
    <path d="M ${swapX} ${laneTop} C ${swapX + 90} ${laneTop}, ${swapX + 90} ${laneBottom}, ${swapX + 180} ${laneBottom}" fill="none" stroke="${colors.python}" stroke-width="8" stroke-linecap="round"/>
    <line x1="${swapX + 180}" y1="${laneBottom}" x2="1520" y2="${laneBottom}" stroke="${colors.python}" stroke-width="8" stroke-linecap="round"/>

    <line x1="530" y1="${laneBottom}" x2="${swapX}" y2="${laneBottom}" stroke="${colors.rust}" stroke-width="8" stroke-linecap="round" stroke-dasharray="18 12"/>
    <path d="M ${swapX} ${laneBottom} C ${swapX + 90} ${laneBottom}, ${swapX + 90} ${laneTop}, ${swapX + 180} ${laneTop}" fill="none" stroke="${colors.rust}" stroke-width="8" stroke-linecap="round"/>
    <line x1="${swapX + 180}" y1="${laneTop}" x2="1520" y2="${laneTop}" stroke="${colors.rust}" stroke-width="8" stroke-linecap="round"/>

    ${milestone(200, laneTop, colors.python)}
    ${milestone(530, laneBottom, colors.rust)}
    ${milestone(1520, laneTop, colors.rust)}
    ${milestone(1520, laneBottom, colors.python)}

    ${roundedRect(120, 274, 330, 62)}
    <text x="150" y="313" class="sans" fill="${colors.ink}" font-size="22" font-weight="700">dbt Core v1 — Python</text>

    ${roundedRect(452, 646, 400, 92)}
    <rect x="452" y="646" width="10" height="92" rx="5" fill="${colors.rust}"/>
    <text x="482" y="684" class="sans" fill="${colors.ink}" font-size="22" font-weight="700">dbt Fusion engine — Rust</text>
    <text x="482" y="716" class="sans" fill="${colors.muted}" font-size="18">from the SDF Labs team · ELv2</text>

    ${roundedRect(740, 424, 360, 132, colors.panel2, colors.line)}
    <text x="770" y="466" class="sans" fill="${colors.ink}" font-size="22" font-weight="700">Every bug, fixed twice</text>
    <text x="770" y="498" class="sans" fill="${colors.muted}" font-size="18">two languages, two test frameworks</text>
    <text x="770" y="526" class="sans" fill="${colors.muted}" font-size="18">“risks divergence of behavior”</text>

    ${roundedRect(1230, 262, 300, 84)}
    <rect x="1230" y="262" width="10" height="84" rx="5" fill="${colors.rust}"/>
    <text x="1260" y="298" class="sans" fill="${colors.ink}" font-size="22" font-weight="700">main → v2.0</text>
    <text x="1260" y="328" class="sans" fill="${colors.muted}" font-size="18">Rust · Apache 2.0 · alpha</text>

    ${roundedRect(1230, 664, 300, 84)}
    <rect x="1230" y="664" width="10" height="84" rx="5" fill="${colors.python}"/>
    <text x="1260" y="700" class="sans" fill="${colors.ink}" font-size="22" font-weight="700">1.latest</text>
    <text x="1260" y="730" class="sans" fill="${colors.muted}" font-size="18">v1.12, still shipping</text>

    <text x="80" y="${laneTop + 8}" class="sans" fill="#cbd5e1" font-size="21" font-weight="600">main</text>
    <text x="80" y="${laneBottom + 8}" class="sans" fill="#cbd5e1" font-size="21" font-weight="600">not main</text>

    ${pill(120, 786, 'dbt-fusion repo archived', colors.muted)}
    ${pill(120 + pillWidth('dbt-fusion repo archived') + 22, 786, '14 adapters into the monorepo', colors.muted)}
    ${pill(120 + pillWidth('dbt-fusion repo archived') + pillWidth('14 adapters into the monorepo') + 44, 786, '181 preview releases of 2.0.0', colors.muted)}

    <text x="120" y="862" class="sans" fill="${colors.muted}" font-size="20">The Fusion releases had been numbered 2.0.0.xxx since the very first one, in May 2025.</text>
  `;
  return baseSvg(1600, 900, body);
}

function crateMap() {
  const rows = [
    ['DAG and traversal', 'dbt-dag · dbt-scheduler · dbt-selector-parser', colors.blue, false],
    ['Jinja runtime', 'dbt-jinja (minijinja fork) · dbt-jinja-ctx · dbt-jinja-filters', colors.purple, false],
    ['SQL front end', 'dbt-lexer-{bigquery,databricks,duckdb,redshift,snowflake,trino}', colors.amber, true],
    ['Adapters and catalogs', 'dbt-adapter · dbt-adapter-core · dbt-adapter-sql · dbt-adbc', colors.cyan, false],
    ['Schema and validation', 'dbt-schemas · dbt-schema-store', colors.green, false],
    ['Metadata and lineage', 'dbt-metadata · dbt-metadata-parquet · dbt-lineage-core', colors.blue, false],
    ['Query over metadata', 'dbt-df-providers  (DataFusion catalog provider)', colors.purple, false],
  ];

  const rowsSvg = rows
    .map(([name, crates, accent, emphasis], i) =>
      layerRow(80, 236 + i * 76, 960, 64, name, crates, accent, emphasis)
    )
    .join('');

  const adapters = [
    'bigquery', 'databricks', 'snowflake', 'redshift',
    'postgres', 'duckdb', 'spark', 'fabric',
    'fabricspark', 'clickhouse', 'exasol', 'salesforce',
    'alt', 'adapters',
  ];
  const adaptersSvg = adapters
    .map((a, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return `<text x="${1130 + col * 190}" y="${344 + row * 42}" class="mono" fill="${colors.muted}" font-size="19">${esc(a)}</text>`;
    })
    .join('');

  const body = `
    <text x="80" y="82" class="sans subtitle">dbt-core · main · one Cargo workspace</text>
    <text x="80" y="146" class="sans title">What got rewritten</text>

    ${rowsSvg}

    ${roundedRect(1080, 236, 440, 380, colors.panel2, colors.line)}
    <text x="1130" y="292" class="sans label" font-size="21">BUNDLED ADAPTERS</text>
    ${adaptersSvg}

    ${roundedRect(1080, 640, 440, 128)}
    <text x="1130" y="692" class="sans" fill="${colors.ink}" font-size="22" font-weight="700">Separate repos before</text>
    <text x="1130" y="726" class="sans" fill="${colors.muted}" font-size="18">separate release cycles,</text>
    <text x="1130" y="752" class="sans" fill="${colors.muted}" font-size="18">separate maintainer bandwidth</text>

    <text x="80" y="812" class="sans subtitle">Six lexers is not a performance optimisation.</text>
    <text x="80" y="856" class="sans" fill="${colors.muted}" font-size="22">It is what linting, column-level lineage and a language server all need: SQL that is parsed, not substituted.</text>
  `;
  return baseSvg(1600, 900, body);
}

function endpointDrop() {
  const yaml = [
    'catalogs:',
    '  - name: glue_via_rest',
    '    type: iceberg_rest',
    '    table_format: iceberg',
    '    config:',
    '      duckdb:',
    '        endpoint_type: GLUE',
    '        attach_as: glue_rest_db',
    '        secret: glue_s3',
  ];
  const yamlSvg = yaml
    .map((l, i) => {
      const key = l.includes('endpoint_type');
      // xml:space="preserve" or SVG collapses the leading indentation, which is the
      // one thing a YAML snippet cannot afford to lose.
      return `<text x="120" y="${292 + i * 30}" xml:space="preserve" class="mono" fill="${key ? '#9a3412' : colors.ink}" font-size="19" ${key ? 'font-weight="700"' : ''}>${esc(l)}</text>`;
    })
    .join('');

  const rules = [
    'enumerated to GLUE | S3_TABLES',
    'mutually exclusive with endpoint',
    'S3_TABLES also requires warehouse',
    'cannot combine with authorization_type',
  ];
  const rulesSvg = rules
    .map((r, i) => pill(840, 296 + i * 58, r, colors.green))
    .join('');

  const before =
    "ATTACH IF NOT EXISTS 'glue_via_rest' AS glue_rest_db (TYPE ICEBERG, SECRET glue_s3, READ_ONLY false)";
  const after =
    "ATTACH IF NOT EXISTS ':' AS glue_rest_db (TYPE ICEBERG, SECRET glue_s3, ENDPOINT_TYPE 'GLUE', READ_ONLY false)";

  const body = `
    <text x="80" y="82" class="sans subtitle">catalogs.yml v2 · DuckDB · Iceberg REST</text>
    <text x="80" y="146" class="sans title">Valid config in, half a statement out</text>

    ${roundedRect(80, 208, 700, 330)}
    <rect x="80" y="208" width="10" height="330" rx="5" fill="${colors.amber}"/>
    <text x="120" y="256" class="sans" fill="${colors.ink}" font-size="23" font-weight="700">What you wrote</text>
    ${yamlSvg}

    ${roundedRect(810, 208, 710, 330)}
    <rect x="810" y="208" width="10" height="330" rx="5" fill="${colors.green}"/>
    <text x="850" y="256" class="sans" fill="${colors.ink}" font-size="23" font-weight="700">Every schema rule passed</text>
    ${rulesSvg}

    ${roundedRect(80, 566, 1440, 140)}
    <rect x="80" y="566" width="10" height="140" rx="5" fill="${colors.red}"/>
    <text x="120" y="610" class="sans" fill="${colors.ink}" font-size="23" font-weight="700">What DuckDB received</text>
    <text x="120" y="654" class="mono" fill="${colors.ink}" font-size="19">${esc(before)}</text>
    <text x="120" y="688" class="sans" fill="${colors.red}" font-size="19" font-weight="600">no ENDPOINT · no ENDPOINT_TYPE · no AUTHORIZATION_TYPE — DuckDB falls back to oauth2, and the schema forbids the workaround</text>

    ${roundedRect(80, 726, 1440, 118)}
    <rect x="80" y="726" width="10" height="118" rx="5" fill="${colors.green}"/>
    <text x="120" y="770" class="sans" fill="${colors.ink}" font-size="23" font-weight="700">After the fix</text>
    <text x="120" y="814" class="mono" fill="${colors.ink}" font-size="19">${esc(after)}</text>
    ${pill(1330, 748, 'PR #15764', colors.green)}
  `;
  return baseSvg(1600, 900, body);
}

await mkdir(outDir, {recursive: true});
await renderPng('dbt-fusion-cover.png', cover());
await renderPng('dbt-two-engines-timeline.png', timeline());
await renderPng('dbt-fusion-crates.png', crateMap());
await renderPng('dbt-endpoint-type-drop.png', endpointDrop());
