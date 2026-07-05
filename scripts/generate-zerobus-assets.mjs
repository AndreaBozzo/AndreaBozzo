import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

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

function pill(x, y, text, fill, ink = '#fff') {
  const width = Math.max(110, text.length * 12 + 34);
  return `
    <rect x="${x}" y="${y}" width="${width}" height="40" rx="20" fill="${fill}"/>
    <text x="${x + width / 2}" y="${y + 27}" text-anchor="middle" class="sans" fill="${ink}" font-size="18" font-weight="700">${esc(text)}</text>`;
}

function node(x, y, w, h, title, detail, accent = colors.blue) {
  return `
    ${roundedRect(x, y, w, h)}
    <rect x="${x}" y="${y}" width="10" height="${h}" rx="5" fill="${accent}"/>
    <text x="${x + 30}" y="${y + 42}" class="sans body">${esc(title)}</text>
    <text x="${x + 30}" y="${y + 76}" class="sans small">${esc(detail)}</text>`;
}

async function renderPng(name, svg, width = 1600, height = 900) {
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png({compressionLevel: 9})
    .toFile(join(outPath, name));
}

function cover() {
  const body = `
    <text x="92" y="128" class="sans subtitle">Databricks • Rust • Apache Arrow</text>
    <text x="92" y="226" class="sans title">Zerobus Ingest</text>
    <text x="92" y="294" class="sans subtitle">when Unity Catalog becomes the sink</text>

    ${roundedRect(92, 392, 360, 150)}
    <text x="132" y="453" class="sans body">Rust Producer</text>
    <text x="132" y="493" class="sans small">JSON first, Arrow when needed</text>

    ${roundedRect(620, 350, 360, 230, '#fef2f2', '#fecaca')}
    <text x="800" y="430" text-anchor="middle" class="sans body">Zerobus</text>
    <text x="800" y="470" text-anchor="middle" class="sans small">managed endpoint</text>
    <text x="800" y="508" text-anchor="middle" class="sans small">no broker to operate</text>
    ${pill(713, 535, 'push API', colors.red)}

    ${roundedRect(1148, 392, 360, 150)}
    <text x="1188" y="453" class="sans body">Unity Catalog</text>
    <text x="1188" y="493" class="sans small">governed Delta table</text>

    <line x1="452" y1="467" x2="620" y2="467" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>
    <line x1="980" y1="467" x2="1148" y2="467" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>

    <path d="M 506 658 C 710 720, 914 720, 1094 658" fill="none" stroke="#475569" stroke-width="3" stroke-dasharray="8 12"/>
    <text x="800" y="744" text-anchor="middle" class="sans subtitle">The bus does not disappear. It stops being automatic.</text>
  `;
  return baseSvg(1600, 900, body);
}

function beforeAfter() {
  const body = `
    <text x="80" y="86" class="sans subtitle">The architecture question</text>
    <text x="80" y="145" class="sans title">When the lakehouse is the sink</text>

    ${roundedRect(80, 220, 1440, 230)}
    ${pill(110, 250, 'traditional default', colors.amber)}
    ${node(130, 310, 210, 82, 'Producer', 'app / edge / service', colors.blue)}
    ${node(410, 310, 210, 82, 'Kafka', 'broker + partitions', colors.amber)}
    ${node(690, 310, 210, 82, 'Registry', 'schema contract', colors.purple)}
    ${node(970, 310, 210, 82, 'Connector', 'sink ops', colors.cyan)}
    ${node(1250, 310, 210, 82, 'Delta', 'lakehouse table', colors.green)}
    <line x1="340" y1="351" x2="410" y2="351" stroke="${colors.muted}" stroke-width="4" marker-end="url(#arrow)"/>
    <line x1="620" y1="351" x2="690" y2="351" stroke="${colors.muted}" stroke-width="4" marker-end="url(#arrow)"/>
    <line x1="900" y1="351" x2="970" y2="351" stroke="${colors.muted}" stroke-width="4" marker-end="url(#arrow)"/>
    <line x1="1180" y1="351" x2="1250" y2="351" stroke="${colors.muted}" stroke-width="4" marker-end="url(#arrow)"/>

    ${roundedRect(80, 520, 1440, 250)}
    ${pill(110, 550, 'single-sink path', colors.red)}
    ${node(170, 622, 300, 92, 'Producer', 'Rust SDK / REST / OTLP', colors.blue)}
    ${node(650, 602, 300, 132, 'Zerobus Ingest', 'serverless ingest', colors.red)}
    ${node(1130, 622, 300, 92, 'UC Delta Table', 'governance at arrival', colors.green)}
    <line x1="470" y1="668" x2="650" y2="668" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>
    <line x1="950" y1="668" x2="1130" y2="668" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>
    <text x="800" y="815" text-anchor="middle" class="sans subtitle">Not “less Kafka”. A different default when the destination is already known.</text>
  `;
  return baseSvg(1600, 900, body);
}

function arrowFlight() {
  const body = `
    <text x="80" y="92" class="sans subtitle">Why this is also a Rust story</text>
    <text x="80" y="152" class="sans title">RecordBatch to Delta</text>

    ${node(100, 330, 260, 120, 'arrow_array', 'in-memory RecordBatch', colors.purple)}
    ${node(455, 330, 260, 120, 'Rust SDK', 'async stream + OAuth', colors.blue)}
    ${node(810, 330, 260, 120, 'Arrow Flight', 'DoPut over gRPC', colors.red)}
    ${node(1165, 330, 260, 120, 'Delta table', 'Unity Catalog governed', colors.green)}
    <line x1="360" y1="390" x2="455" y2="390" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>
    <line x1="715" y1="390" x2="810" y2="390" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>
    <line x1="1070" y1="390" x2="1165" y2="390" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>

    ${roundedRect(180, 585, 1240, 150, '#f8fafc', '#d7dee9')}
    <text x="220" y="645" class="sans body">The point is not “Databricks supports Rust”.</text>
    <text x="220" y="690" class="sans small">It is that a columnar producer can stay columnar all the way into ingestion when the workload earns it.</text>
    ${pill(1110, 625, 'Beta', colors.amber)}
  `;
  return baseSvg(1600, 900, body);
}

function catalogReceipt() {
  // Real values pulled from the workspace on 2026-07-05:
  // DESCRIBE HISTORY / DESCRIBE DETAIL on zerobus_demo.events.rust_telemetry_events
  const historyRows = [
    ['2', '2026-07-05 09:25:50', 'WRITE', 'Zerobus', 'true'],
    ['1', '2026-07-05 09:19:00', 'WRITE', 'Zerobus', 'true'],
    ['0', '2026-07-05 09:18:23', 'CREATE OR REPLACE TABLE', 'Databricks-Runtime/18.2.x-photon', 'true'],
  ];
  const historySvg = historyRows
    .map(([v, ts, op, engine, blind], i) => {
      const y = 505 + i * 44;
      const zerobus = engine === 'Zerobus';
      return `
    <text x="170" y="${y}" class="mono small" fill="${colors.ink}">${esc(v)}</text>
    <text x="260" y="${y}" class="mono small">${esc(ts)}</text>
    <text x="580" y="${y}" class="mono small" fill="${colors.ink}">${esc(op)}</text>
    <text x="950" y="${y}" class="mono small" fill="${zerobus ? colors.green : colors.muted}" font-weight="${zerobus ? '700' : '400'}">${esc(engine)}</text>
    <text x="1330" y="${y}" class="mono small">${esc(blind)}</text>`;
    })
    .join('');

  const body = `
    <text x="80" y="86" class="sans subtitle">Workspace receipt • DESCRIBE HISTORY, 2026-07-05</text>
    <text x="80" y="145" class="sans title">What the Delta log recorded</text>

    ${roundedRect(80, 210, 1440, 570)}
    <text x="125" y="275" class="sans body">zerobus_demo.events.rust_telemetry_events</text>
    <text x="125" y="318" class="mono small">MANAGED • DELTA • rows=128 • numFiles=2 • 8.9 KB • zstd • S3 managed location</text>

    <line x1="125" y1="355" x2="1475" y2="355" stroke="${colors.line}" stroke-width="2"/>

    ${roundedRect(125, 395, 1290, 250, '#f8fafc', '#d7dee9', 14)}
    <text x="170" y="450" class="sans label" font-size="19">ver</text>
    <text x="260" y="450" class="sans label" font-size="19">timestamp (UTC)</text>
    <text x="580" y="450" class="sans label" font-size="19">operation</text>
    <text x="950" y="450" class="sans label" font-size="19">engineInfo</text>
    <text x="1330" y="450" class="sans label" font-size="19">blind</text>
    <line x1="150" y1="465" x2="1390" y2="465" stroke="${colors.line}" stroke-width="2"/>
    ${historySvg}

    <text x="125" y="700" class="mono tiny">batch_id=rust-json-a43bcfa6-…  →  64 rows acked   •   batch_id=rust-arrow-a33a4215-…  →  64 rows acked</text>
    <text x="125" y="738" class="sans small">One producer run, one Delta commit. The Zerobus writes carry a service identity, not an interactive user.</text>
    ${pill(1290, 268, 'live table', colors.green)}
  `;
  return baseSvg(1600, 900, body);
}

await mkdir(outDir, {recursive: true});
await renderPng('zerobus-cover.png', cover());
await renderPng('zerobus-before-after.png', beforeAfter());
await renderPng('zerobus-rust-arrow-flight.png', arrowFlight());
await renderPng('zerobus-catalog-explorer.png', catalogReceipt());
