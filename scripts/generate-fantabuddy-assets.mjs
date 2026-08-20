import {Resvg} from '@resvg/resvg-js';
import opentype from 'opentype.js';
import sharp from 'sharp';
import {existsSync, readFileSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Figure for the Fantabuddy post: the boundary between the repeatable part of the
// system and the part that stays human. One layout, two languages, so the EN and IT
// diagrams cannot drift apart.
//
// Every label here restates something the repo does, not an aspiration:
//   01 SOURCES  listone snapshots + API-Football (fixtures, transfers, sidelined)
//   02 MEMORY   DuckDB warehouse, every source carrying its observation time
//   03 CHECK    availability gate 1% (availability.py MINIMUM_RELATIVE_IMPROVEMENT),
//               seasonal gate 3% walk-forward (analytics.py, baseline_mae * 0.97)
//   04 PRODUCT  self-contained report.html (prices, signals, reasons, filters)
//   HUMAN       auction calls and the weekly lineup, Andrea + Renato
//
// The first version of this figure was hand-written SVG rendered with a font stack the
// renderer did not have; it fell back to monospace and the longer Italian strings ran
// past their cards. So text here is measured against the exact font file used to
// render, shrunk to fit, and the build throws if a line still overflows its panel.

const outDir = new URL('../blog/static/images/', import.meta.url);
const outPath = fileURLToPath(outDir);

// Render with an explicit font file rather than system fonts: measurement and
// rendering then use identical metrics, and the output is reproducible.
// The font stack names only faces the renderer is actually given: scripts/validate-svg.mjs
// rejects "IBM Plex Sans" in generated SVGs for exactly this reason.
const FONT_CANDIDATES = [
  {
    regular: 'C:/Windows/Fonts/arial.ttf',
    bold: 'C:/Windows/Fonts/arialbd.ttf',
    family: 'Arial',
    stack: 'Arial, Helvetica, sans-serif',
  },
  {
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    family: 'Liberation Sans',
    stack: 'Liberation Sans, Arial, Helvetica, sans-serif',
  },
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    family: 'DejaVu Sans',
    stack: 'DejaVu Sans, Arial, Helvetica, sans-serif',
  },
];

const font = FONT_CANDIDATES.find((entry) => existsSync(entry.regular) && existsSync(entry.bold));
if (!font) {
  throw new Error('no usable sans font found; add one to FONT_CANDIDATES');
}
function loadMetrics(filePath) {
  const buffer = readFileSync(filePath);
  return opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

const metrics = {
  regular: loadMetrics(font.regular),
  bold: loadMetrics(font.bold),
};

const colors = {
  bgFrom: '#071523',
  bgTo: '#102a43',
  card: '#13283f',
  cardStroke: '#294662',
  accent: '#56e6b0',
  human: '#ffb08a',
  ink: '#f6f8fb',
  muted: '#aabbd0',
  footer: '#0a1b2d',
  footerInk: '#e5edf5',
  humanEyebrow: '#8d351f',
  humanInk: '#17202b',
  humanBody: '#5f4034',
};

const WIDTH = 1600;
const HEIGHT = 560;
const CARDS = [
  {x: 70, y: 145, w: 250, h: 235},
  {x: 355, y: 145, w: 250, h: 235},
  {x: 640, y: 145, w: 250, h: 235},
  {x: 925, y: 145, w: 250, h: 235},
];
const HUMAN = {x: 1240, y: 120, w: 290, h: 285};
const PAD = 30;

const COPY = {
  en: {
    file: 'fantabuddy-human-loop-en',
    title: 'The useful boundary in Fantabuddy',
    desc:
      'Player lists and APIs feed DuckDB, validated models and the HTML report; ' +
      'Andrea and Renato make the auction calls and set the lineup.',
    repeatable: 'REPEATABLE',
    humanLabel: 'HUMAN',
    cards: [
      {eyebrow: '01 · SOURCES', title: ['Player list', '+ APIs'], lines: ['snapshots · fixtures', 'transfers · alerts']},
      {eyebrow: '02 · MEMORY', title: ['DuckDB'], lines: ['identity · history', 'declared freshness']},
      {eyebrow: '03 · CHECK', title: ['Model gate'], lines: ['ML only if it beats', 'a temporal baseline']},
      {eyebrow: '04 · PRODUCT', title: ['HTML report'], lines: ['prices · signals', 'reasons · filters']},
    ],
    human: {
      eyebrow: 'JUDGMENT & CARE',
      title: 'Andrea + Renato',
      lines: ['auction choices', 'weekly lineup', 'limited gambles'],
    },
    footer: 'The system preserves what we knew. People decide what to do with it.',
  },
  it: {
    file: 'fantabuddy-human-loop-it',
    title: 'Il confine utile di Fantabuddy',
    desc:
      "Il listone e le API alimentano DuckDB, i modelli validati e il report HTML; " +
      "Andrea e Renato prendono le decisioni d'asta e gestiscono la formazione.",
    repeatable: 'PARTE RIPETIBILE',
    humanLabel: 'PARTE UMANA',
    cards: [
      {eyebrow: '01 · FONTI', title: ['Listone + API'], lines: ['snapshot · fixture', 'trasferimenti · alert']},
      {eyebrow: '02 · MEMORIA', title: ['DuckDB'], lines: ['identità · storico', 'freschezza dichiarata']},
      {eyebrow: '03 · CONTROLLO', title: ['Gate modello'], lines: ['ML soltanto se batte', 'una baseline temporale']},
      {eyebrow: '04 · PRODOTTO', title: ['Report HTML'], lines: ['prezzi · segnali', 'spiegazioni · filtri']},
    ],
    human: {
      eyebrow: 'GIUDIZIO E CURA',
      title: 'Andrea + Renato',
      lines: ["scelte d'asta", 'formazione settimanale', 'poche scommesse'],
    },
    footer: 'Il sistema conserva ciò che sapevamo. Le persone decidono cosa farne.',
  },
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function width(text, size, {bold = false, tracking = 0} = {}) {
  const face = bold ? metrics.bold : metrics.regular;
  const glyphs = [...text].length;
  return face.getAdvanceWidth(text, size) + Math.max(0, glyphs - 1) * tracking;
}

// Largest size at or below `start` (never below `min`) at which every line fits.
function fitSize(lines, maxWidth, start, min, options = {}) {
  for (let size = start; size >= min; size -= 0.5) {
    if (lines.every((line) => width(line, size, options) <= maxWidth)) return size;
  }
  return min;
}

const overflows = [];
function assertFits(label, text, size, maxWidth, options = {}) {
  const measured = width(text, size, options);
  if (measured > maxWidth + 0.5) {
    overflows.push(`${label}: "${text}" is ${measured.toFixed(1)}px, ${maxWidth}px available`);
  }
}

function text(x, y, value, size, {bold = false, fill = colors.ink, tracking = 0, anchor} = {}) {
  const weight = bold ? ' font-weight="700"' : '';
  const track = tracking ? ` letter-spacing="${tracking}"` : '';
  const align = anchor ? ` text-anchor="${anchor}"` : '';
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}"${weight}${track}${align}>${esc(value)}</text>`;
}

function buildSvg(copy) {
  overflows.length = 0;
  const parts = [];
  const boxWidth = CARDS[0].w - PAD * 2;

  // Sub-labels share one size across all four cards so the row reads as a set.
  const allLines = copy.cards.flatMap((card) => card.lines);
  const lineSize = fitSize(allLines, boxWidth, 18, 13);
  const titleSize = fitSize(
    copy.cards.flatMap((card) => card.title),
    boxWidth,
    27,
    18,
    {bold: true},
  );
  const eyebrowSize = fitSize(
    copy.cards.map((card) => card.eyebrow),
    boxWidth,
    18,
    12,
    {bold: true, tracking: 1.4},
  );

  for (const [index, card] of copy.cards.entries()) {
    const {eyebrow, title, lines} = card;
    const box = CARDS[index];
    const left = box.x + PAD;
    parts.push(text(left, 190, eyebrow, eyebrowSize, {bold: true, fill: colors.accent, tracking: 1.4}));
    assertFits(`card ${index + 1} eyebrow`, eyebrow, eyebrowSize, boxWidth, {bold: true, tracking: 1.4});

    // A two-line title starts higher so the block stays vertically centred.
    let titleY = title.length > 1 ? 232 : 240;
    for (const row of title) {
      parts.push(text(left, titleY, row, titleSize, {bold: true}));
      assertFits(`card ${index + 1} title`, row, titleSize, boxWidth, {bold: true});
      titleY += titleSize * 1.28;
    }

    let lineY = title.length > 1 ? 305 : 285;
    for (const row of lines) {
      parts.push(text(left, lineY, row, lineSize, {fill: colors.muted}));
      assertFits(`card ${index + 1} line`, row, lineSize, boxWidth);
      lineY += 32;
    }
  }

  const humanBox = HUMAN.w - PAD * 2 - 10;
  const humanLeft = HUMAN.x + PAD + 5;
  const humanEyebrow = fitSize([copy.human.eyebrow], humanBox, 18, 12, {bold: true, tracking: 1.2});
  const humanTitle = fitSize([copy.human.title], humanBox, 27, 20, {bold: true});
  const humanLine = fitSize(copy.human.lines, humanBox, 20, 14);
  parts.push(
    text(humanLeft, 185, copy.human.eyebrow, humanEyebrow, {
      bold: true,
      fill: colors.humanEyebrow,
      tracking: 1.2,
    }),
    text(humanLeft, 238, copy.human.title, humanTitle, {bold: true, fill: colors.humanInk}),
  );
  assertFits('human eyebrow', copy.human.eyebrow, humanEyebrow, humanBox, {bold: true, tracking: 1.2});
  assertFits('human title', copy.human.title, humanTitle, humanBox, {bold: true});
  let humanY = 286;
  for (const row of copy.human.lines) {
    parts.push(text(humanLeft, humanY, row, humanLine, {fill: colors.humanBody}));
    assertFits('human line', row, humanLine, humanBox);
    humanY += 34;
  }

  const footerSize = fitSize([copy.footer], 1460 - 80, 24, 17);
  assertFits('footer', copy.footer, footerSize, 1460 - 80);
  const repeatableSize = fitSize([copy.repeatable], 400, 22, 16, {bold: true, tracking: 3});
  const humanLabelSize = fitSize([copy.humanLabel], HUMAN.w, 22, 16, {bold: true, tracking: 3});

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc" font-family="${font.stack}">
  <title id="title">${esc(copy.title)}</title>
  <desc id="desc">${esc(copy.desc)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors.bgFrom}"/>
      <stop offset="1" stop-color="${colors.bgTo}"/>
    </linearGradient>
    <linearGradient id="human" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff3d6"/>
      <stop offset="1" stop-color="#ffd6b8"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000814" flood-opacity="0.28"/>
    </filter>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
      <path d="M0 0L10 5L0 10Z" fill="${colors.accent}"/>
    </marker>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="30" fill="url(#bg)"/>
  <path d="M80 102H1180" stroke="${colors.accent}" stroke-width="2" stroke-dasharray="6 10" opacity="0.35"/>
  ${text(80, 70, copy.repeatable, repeatableSize, {bold: true, fill: colors.accent, tracking: 3})}
  ${text(HUMAN.x + HUMAN.w, 70, copy.humanLabel, humanLabelSize, {
    bold: true,
    fill: colors.human,
    tracking: 3,
    anchor: 'end',
  })}

  <g filter="url(#shadow)">
    ${CARDS.map(
      (box) =>
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="24" fill="${colors.card}" stroke="${colors.cardStroke}"/>`,
    ).join('\n    ')}
    <rect x="${HUMAN.x}" y="${HUMAN.y}" width="${HUMAN.w}" height="${HUMAN.h}" rx="30" fill="url(#human)"/>
  </g>

  ${parts.join('\n  ')}

  <g stroke="${colors.accent}" stroke-width="4" fill="none" marker-end="url(#arrow)">
    <path d="M320 262H345"/>
    <path d="M605 262H630"/>
    <path d="M890 262H915"/>
    <path d="M1175 262H1228"/>
  </g>

  <rect x="70" y="438" width="1460" height="72" rx="18" fill="${colors.footer}" stroke="${colors.cardStroke}"/>
  ${text(800, 483, copy.footer, footerSize, {fill: colors.footerInk, anchor: 'middle'})}
</svg>
`;
}

async function render(copy) {
  const svg = buildSvg(copy);
  if (overflows.length > 0) {
    throw new Error(`text overflows its panel in ${copy.file}:\n  ${overflows.join('\n  ')}`);
  }
  await writeFile(join(outPath, `${copy.file}.svg`), svg, 'utf8');
  const png = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [font.regular, font.bold],
      defaultFontFamily: font.family,
      sansSerifFamily: font.family,
    },
  })
    .render()
    .asPng();
  await sharp(png).webp({quality: 92}).toFile(join(outPath, `${copy.file}.webp`));
  console.log(`wrote ${copy.file}.svg and ${copy.file}.webp (${font.family})`);
}

await mkdir(outDir, {recursive: true});
for (const copy of Object.values(COPY)) {
  await render(copy);
}
