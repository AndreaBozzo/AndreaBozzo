import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Figures for the "Nephtys on a Raspberry Pi" post. Same canvas, palette and helper
// vocabulary as generate-zerobus-assets.mjs so the visual language stays consistent
// across posts.
//
// Every number below comes from the retained benchmark directory
// uic2026-nephtys/demo/comparison/results/pi-20260725T075732Z/ (runs.csv + summary.md),
// three valid trials per system, mean +/- sample SD. Do not edit a value here without
// re-deriving it from that data.

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
  // Categorical pair for the two systems under test. Validated with the dataviz
  // validator against the light panel surface: CVD separation dE 32.3 (protan) /
  // 29.3 (tritan), normal-vision dE 38.3, contrast >= 3:1 — all checks pass.
  nephtys: '#2563eb',
  nodered: '#d97706',
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

// A bar anchored to the baseline with only its data-end rounded (4px), per the mark
// spec. A fully rounded rect would detach the bar from its own zero line.
function bar(x, y, w, h, fill, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `<path d="M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z" fill="${fill}"/>`;
}

async function renderPng(name, svg, width = 1600, height = 900) {
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png({compressionLevel: 9})
    .toFile(join(outPath, name));
}

function cover() {
  const body = `
    <text x="92" y="120" class="sans subtitle">Go • NATS JetStream • Raspberry Pi 5</text>
    <text x="92" y="216" class="sans title">Nephtys on a Raspberry Pi</text>
    <text x="92" y="282" class="sans subtitle">6.6× less memory, exactly the same watts</text>

    ${roundedRect(92, 370, 440, 210)}
    <text x="132" y="428" class="sans label" font-size="21">RESIDENT MEMORY</text>
    <text x="132" y="486" class="sans" fill="${colors.nephtys}" font-size="44" font-weight="760">19.51 MB</text>
    <text x="132" y="534" class="sans small">against 128.47 MB — a 6.59× gap</text>
    ${pill(392, 396, 'measured', colors.green)}

    ${roundedRect(580, 370, 440, 210)}
    <text x="620" y="428" class="sans label" font-size="21">WALL POWER</text>
    <text x="620" y="486" class="sans" fill="${colors.ink}" font-size="44" font-weight="760">3.610 W</text>
    <text x="620" y="534" class="sans small">against 3.584 W — no difference</text>
    ${pill(880, 396, 'null result', colors.amber)}

    ${roundedRect(1068, 370, 440, 210)}
    <text x="1108" y="428" class="sans label" font-size="21">OUTPUT</text>
    <text x="1108" y="486" class="sans" fill="${colors.ink}" font-size="44" font-weight="760">identical</text>
    <text x="1108" y="534" class="sans small">matched sequence hashes</text>
    ${pill(1368, 396, 'gated', colors.blue)}

    <line x1="92" y1="668" x2="1508" y2="668" stroke="#334155" stroke-width="2"/>
    <text x="92" y="736" class="sans subtitle">The footprint win was real. The energy win never existed.</text>
    <text x="92" y="792" class="sans" fill="${colors.muted}" font-size="24">Three interleaved trials per system • 12,000 deterministic events per slot • power measured at the socket</text>
  `;
  return baseSvg(1600, 900, body);
}

// Two space-constrained variants of node(): the shared helper puts its detail line at
// y+76, so it needs ~96px of height. These fit the same information into 76px and 58px.
function nodeTight(x, y, w, h, title, detail, accent) {
  return `
    ${roundedRect(x, y, w, h)}
    <rect x="${x}" y="${y}" width="10" height="${h}" rx="5" fill="${accent}"/>
    <text x="${x + 30}" y="${y + 34}" class="sans" fill="${colors.ink}" font-size="26" font-weight="700">${esc(title)}</text>
    <text x="${x + 30}" y="${y + 61}" class="sans" fill="${colors.muted}" font-size="17">${esc(detail)}</text>`;
}

function stage(x, y, w, h, title, detail, accent) {
  return `
    ${roundedRect(x, y, w, h)}
    <rect x="${x}" y="${y}" width="10" height="${h}" rx="5" fill="${accent}"/>
    <text x="${x + 30}" y="${y + 38}" class="sans" fill="${colors.ink}" font-size="25" font-weight="700">${esc(title)}</text>
    <text x="${x + w - 28}" y="${y + 38}" text-anchor="end" class="sans" fill="${colors.muted}" font-size="18">${esc(detail)}</text>`;
}

function architecture() {
  const body = `
    <text x="80" y="82" class="sans subtitle">What is being measured</text>
    <text x="80" y="146" class="sans title">One binary, one pipeline, one broker</text>

    <text x="104" y="232" class="sans label">SOURCES</text>
    ${nodeTight(80, 256, 300, 76, 'WebSocket', 'self-reconnecting', colors.blue)}
    ${nodeTight(80, 344, 300, 76, 'SSE', 'self-reconnecting', colors.blue)}
    ${nodeTight(80, 432, 300, 76, 'REST poller', 'retries next tick', colors.blue)}
    ${nodeTight(80, 520, 300, 76, 'Webhook', 'client retries', colors.cyan)}
    ${nodeTight(80, 608, 300, 76, 'gRPC', 'client retries', colors.cyan)}

    ${roundedRect(440, 256, 660, 442, colors.panel2, colors.line)}
    <text x="470" y="308" class="sans label">MIDDLEWARE PIPELINE — per stream, JSON</text>
    ${stage(470, 336, 600, 58, 'Filter', 'drop by type', colors.purple)}
    ${stage(470, 410, 600, 58, 'Transform', 'field mapping', colors.purple)}
    ${stage(470, 484, 600, 58, 'Dedup', 'FNV-64a, TTL window', colors.purple)}
    ${stage(470, 558, 600, 58, 'Threshold', 'delta on a field', colors.purple)}
    ${stage(470, 632, 600, 58, 'Batch', 'size or interval', colors.purple)}

    ${node(1160, 300, 360, 100, 'NATS JetStream', 'durable event stream', colors.green)}
    ${node(1160, 430, 360, 100, 'KV bucket', 'stream registrations', colors.green)}

    <line x1="380" y1="470" x2="440" y2="470" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>
    <line x1="1100" y1="400" x2="1160" y2="380" stroke="${colors.muted}" stroke-width="5" marker-end="url(#arrow)"/>

    ${roundedRect(1160, 578, 360, 120, colors.panel, colors.line)}
    <text x="1190" y="626" class="sans body">REST API</text>
    <text x="1190" y="664" class="mono small">PUT /v1/streams/{id}/pipeline</text>
    <path d="M 1340 578 C 1300 540, 1150 520, 1070 560" fill="none" stroke="${colors.red}" stroke-width="3" stroke-dasharray="8 10"/>
    ${pill(1150, 730, 'hot-swap, source stays up', colors.red)}

    <text x="80" y="790" class="sans" fill="${colors.muted}" font-size="24">No separate database: JetStream carries both the events and the stream configuration.</text>
  `;
  return baseSvg(1600, 900, body);
}

function rig() {
  // Kept short on purpose: five self-sizing pills at full label length overflow the
  // 1440px panel. The two most informative labels stay long, the rest abbreviate.
  const gates = [
    'exactly 12,000 events',
    'one WS client',
    'no throttling',
    'positive energy delta',
    'matching hashes',
  ];
  // Lay the pills out cumulatively rather than on a fixed stride: pill() sizes itself
  // from its label, so a fixed stride overflows the panel on the longer labels.
  let gx = 120;
  const gateSvg = gates
    .map((g, i) => {
      const svg = pill(gx, 742, g, i === gates.length - 1 ? colors.green : colors.blue);
      gx += Math.max(110, g.length * 12 + 34) + 22;
      return svg;
    })
    .join('');

  const body = `
    <text x="80" y="82" class="sans subtitle">The rig, and what could invalidate a run</text>
    <text x="80" y="146" class="sans title">Measuring at the socket</text>

    ${node(80, 250, 300, 108, 'Mains socket', '229.9 V during the run', colors.muted)}
    ${node(80, 400, 300, 108, 'Smart meter', 'polled from the host', colors.amber)}

    ${roundedRect(440, 232, 620, 300)}
    ${pill(470, 262, 'device under test', colors.green)}
    <text x="470" y="358" class="sans body">Raspberry Pi 5 · 4 GB</text>
    <text x="470" y="398" class="sans small">Nephtys or Node-RED, plus NATS, both native</text>
    <text x="470" y="434" class="sans small">active cooler · default governor · no overclock</text>
    <text x="470" y="470" class="mono small">45–51 °C · throttled=0x0 across 1,316 samples</text>
    <text x="470" y="506" class="sans small">wired Ethernet</text>

    ${roundedRect(1120, 232, 400, 300)}
    ${pill(1150, 262, 'orchestrator host', colors.blue)}
    <text x="1150" y="352" class="sans body">Simulator</text>
    <text x="1150" y="388" class="sans small">12,000 events, fixed seed</text>
    <text x="1150" y="440" class="sans body">Neutral subscriber</text>
    <text x="1150" y="476" class="sans small">hashes the retained sequence</text>

    <line x1="380" y1="304" x2="440" y2="304" stroke="${colors.muted}" stroke-width="4" marker-end="url(#arrow)"/>
    <line x1="380" y1="454" x2="440" y2="420" stroke="${colors.amber}" stroke-width="4" marker-end="url(#arrow)"/>
    <line x1="1060" y1="382" x2="1120" y2="382" stroke="${colors.muted}" stroke-width="4" marker-end="url(#arrow)"/>
    <text x="80" y="534" class="sans" fill="#94a3b8" font-size="21">The meter is polled from the host, never from the Pi — sampling the</text>
    <text x="80" y="560" class="sans" fill="#94a3b8" font-size="21">device under test would add load to the thing being measured.</text>

    ${roundedRect(80, 580, 1440, 230, colors.panel2, colors.line)}
    <text x="120" y="640" class="sans body">Five gates. Any one of them fails a slot.</text>
    <text x="120" y="682" class="sans small">Three trials per system, interleaved against thermal and background drift. All six slots passed on the first attempt.</text>
    ${gateSvg}
  `;
  return baseSvg(1600, 900, body);
}

// Two measures on different scales, so two panels with their own zero-based axis --
// never one chart with two y-scales. Both panels start at zero on purpose: a
// truncated power axis would manufacture exactly the difference this figure exists
// to deny.
function results() {
  const panel = (x, heading, unit, axisMax, ticks, series, note) => {
    const px = x;
    const py = 300;
    const pw = 700;
    const ph = 430;
    // Headroom matters: the tallest bar's value label sits 44px above its data-end, so
    // the plot has to start well below the panel heading or the two collide.
    const plotTop = py + 156;
    const plotH = 196;
    const baseline = plotTop + plotH;
    const barW = 132;
    const slots = [px + 178, px + 420];

    const gridSvg = ticks
      .map((t) => {
        const gy = baseline - (t / axisMax) * plotH;
        return `
    <line x1="${px + 116}" y1="${gy}" x2="${px + pw - 40}" y2="${gy}" stroke="${colors.line}" stroke-width="1"/>
    <text x="${px + 104}" y="${gy + 7}" text-anchor="end" class="sans tiny">${esc(t)}</text>`;
      })
      .join('');

    const barsSvg = series
      .map((s, i) => {
        const h = (s.value / axisMax) * plotH;
        const bx = slots[i];
        return `
    ${bar(bx, baseline - h, barW, h, s.fill)}
    <text x="${bx + barW / 2}" y="${baseline - h - 44}" text-anchor="middle" class="sans" fill="${colors.ink}" font-size="30" font-weight="760">${esc(s.display)}</text>
    <text x="${bx + barW / 2}" y="${baseline - h - 18}" text-anchor="middle" class="sans tiny">± ${esc(s.sd)}</text>
    <text x="${bx + barW / 2}" y="${baseline + 34}" text-anchor="middle" class="sans small">${esc(s.name)}</text>`;
      })
      .join('');

    return `
    ${roundedRect(px, py, pw, ph)}
    <text x="${px + 40}" y="${py + 54}" class="sans body">${esc(heading)}</text>
    <text x="${px + 40}" y="${py + 86}" class="sans small">${esc(unit)}</text>
    ${gridSvg}
    <line x1="${px + 116}" y1="${baseline}" x2="${px + pw - 40}" y2="${baseline}" stroke="${colors.muted}" stroke-width="2"/>
    ${barsSvg}
    <text x="${px + 40}" y="${py + ph - 18}" class="sans small" fill="${colors.ink}">${esc(note)}</text>`;
  };

  const memory = panel(
    80,
    'Resident memory, connector only',
    'megabytes — axis starts at zero',
    140,
    [0, 35, 70, 105, 140],
    [
      {name: 'Nephtys', value: 19.51, display: '19.51', sd: '0.07', fill: colors.nephtys},
      {name: 'Node-RED', value: 128.47, display: '128.47', sd: '0.44', fill: colors.nodered},
    ],
    'Node-RED needs 6.59× more.'
  );

  const power = panel(
    820,
    'Wall power, whole board',
    'watts — axis starts at zero',
    4,
    [0, 1, 2, 3, 4],
    [
      {name: 'Nephtys', value: 3.61, display: '3.610', sd: '0.005', fill: colors.nephtys},
      {name: 'Node-RED', value: 3.584, display: '3.584', sd: '0.014', fill: colors.nodered},
    ],
    'Nephtys is 0.7 % higher. That is noise.'
  );

  const body = `
    <text x="80" y="82" class="sans subtitle">Raspberry Pi 5 · three interleaved trials per system · mean ± sample SD</text>
    <text x="80" y="146" class="sans title">The gap that did not transfer</text>

    <rect x="80" y="196" width="26" height="26" rx="5" fill="${colors.nephtys}"/>
    <text x="118" y="217" class="sans" fill="#cbd5e1" font-size="24" font-weight="600">Nephtys</text>
    <rect x="250" y="196" width="26" height="26" rx="5" fill="${colors.nodered}"/>
    <text x="288" y="217" class="sans" fill="#cbd5e1" font-size="24" font-weight="600">Node-RED 5.0.1</text>

    ${memory}
    ${power}

    <text x="80" y="800" class="sans subtitle">Same board, same 12,000 events, byte-identical output.</text>
    <text x="80" y="850" class="sans" fill="${colors.muted}" font-size="24">The board draws ≈3.0 W just powered on, so at 40 events/s neither tool moves the meter.</text>
  `;
  return baseSvg(1600, 900, body);
}

await mkdir(outDir, {recursive: true});
await renderPng('nephtys-cover.png', cover());
await renderPng('nephtys-architecture.png', architecture());
await renderPng('nephtys-measurement-rig.png', rig());
await renderPng('nephtys-pi-results.png', results());
