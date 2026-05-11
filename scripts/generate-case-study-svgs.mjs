import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import opentype from 'opentype.js';

const SIZE = { width: 1200, height: 900 };
const FONT = {
  sans: 'AB Sans',
  display: 'AB Sans',
  mono: 'AB Mono',
};

const FONT_FILES = {
  sansRegular: resolve('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff'),
  sansBold: resolve('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff'),
  monoRegular: resolve('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff'),
  monoBold: resolve('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff'),
};

const FONT_ASSETS = Object.fromEntries(
  Object.entries(FONT_FILES).map(([key, filePath]) => {
    const buffer = readFileSync(filePath);
    return [key, {
      buffer,
      base64: buffer.toString('base64'),
    }];
  }),
);

function parseFont(filePath) {
  const buffer = readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return opentype.parse(arrayBuffer);
}

const FONT_METRICS = Object.fromEntries(
  Object.entries(FONT_FILES).map(([key, filePath]) => [key, parseFont(filePath)]),
);

const COLORS = {
  page: '#F4ECE0',
  frame: '#FBF7F1',
  frameStroke: '#DCCDB8',
  ink: '#1A2340',
  muted: '#5F6576',
  eyebrow: '#1E2B4A',
  amberBg: '#FFF9F0',
  amberStroke: '#E0CBA7',
  amberInk: '#A56A24',
  blueBg: '#F5F8FB',
  blueStroke: '#C9D8E6',
  blueInk: '#2F6E95',
  greenBg: '#F7FBF6',
  greenStroke: '#C6D8C9',
  greenInk: '#3A6C49',
  roseBg: '#FFF3EE',
  roseStroke: '#E0C0B5',
  roseInk: '#9C5E49',
  purpleBg: '#F1F0FB',
  purpleStroke: '#CEC9E7',
  purpleInk: '#57518D',
  darkPanel: '#1E2B4A',
  darkInk: '#F7F3EA',
  darkMuted: '#DCE4EE',
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fontMetricKey(options = {}) {
  const bold = Number(options.fontWeight ?? 400) >= 700;
  if (options.kind === 'mono') {
    return bold ? 'monoBold' : 'monoRegular';
  }
  return bold ? 'sansBold' : 'sansRegular';
}

function measureText(text, options = {}) {
  const fontSize = options.fontSize ?? 16;
  const letterSpacing = options.letterSpacing ?? 0;
  const metricKey = fontMetricKey(options);
  const font = FONT_METRICS[metricKey];
  if (!font) {
    throw new Error(`Missing font metrics for ${metricKey}`);
  }

  const normalized = String(text);
  const advanceWidth = font.stringToGlyphs(normalized).reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
  let width = (advanceWidth / font.unitsPerEm) * fontSize;
  if (normalized.length > 1) {
    width += (normalized.length - 1) * letterSpacing;
  }
  return width;
}

const TOKEN_BREAK_DELIMITERS = new Set(['/', '-', '.']);

function breakTokenByCharacter(token, maxWidth, options) {
  const parts = [];
  let current = '';
  for (const character of token) {
    const next = current + character;
    if (current && measureText(next, options) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function splitTokenAtPreferredBoundaries(token) {
  const parts = [];
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    if (TOKEN_BREAK_DELIMITERS.has(token[index])) {
      parts.push(token.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < token.length) {
    parts.push(token.slice(start));
  }
  return parts.filter(Boolean);
}

function breakToken(token, maxWidth, options) {
  const preferredParts = splitTokenAtPreferredBoundaries(token);
  if (preferredParts.length > 1) {
    return preferredParts.flatMap((part) => (
      measureText(part, options) > maxWidth
        ? breakTokenByCharacter(part, maxWidth, options)
        : [part]
    ));
  }

  return breakTokenByCharacter(token, maxWidth, options);
}

function wrapText(text, maxWidth, options = {}) {
  const normalized = String(text).trim();
  if (!normalized) {
    return [''];
  }

  const words = normalized.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, options) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (measureText(word, options) <= maxWidth) {
      if (current) {
        lines.push(current);
      }
      current = word;
      continue;
    }

    const pieces = breakToken(word, maxWidth, options);
    let firstPiece = true;
    for (const piece of pieces) {
      const separator = current && firstPiece ? ' ' : '';
      const pieceCandidate = current ? `${current}${separator}${piece}` : piece;
      if (current && measureText(pieceCandidate, options) > maxWidth) {
        lines.push(current);
        current = piece;
      } else {
        current = pieceCandidate;
      }
      firstPiece = false;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function fitLines(text, maxWidth, config) {
  let fontSize = config.fontSize;
  while (fontSize >= (config.minFontSize ?? fontSize)) {
    const lines = wrapText(text, maxWidth, { ...config, fontSize });
    const computedLineHeight = config.lineHeight
      ? Math.round(config.lineHeight * (fontSize / config.fontSize))
      : Math.round(fontSize * 1.28);
    const withinLineLimit = !config.maxLines || lines.length <= config.maxLines;
    const withinHeightLimit = !config.maxHeight || (lines.length * computedLineHeight) <= config.maxHeight;
    if (withinLineLimit && withinHeightLimit) {
      return { lines, fontSize };
    }
    fontSize -= 1;
  }

  return {
    lines: wrapText(text, maxWidth, { ...config, fontSize: config.minFontSize ?? config.fontSize }),
    fontSize: config.minFontSize ?? config.fontSize,
  };
}

function rect(x, y, width, height, fill, stroke, radius = 28) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

function line(x1, y1, x2, y2, stroke, strokeWidth = 8) {
  return `<path d="M${x1} ${y1}H${x2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
}

function arrowHead(x, y, fill) {
  return `<polygon points="${x},${y} ${x - 26},${y - 16} ${x - 26},${y + 16}" fill="${fill}"/>`;
}

function textBlock({
  x,
  y,
  width,
  text,
  fontSize,
  minFontSize = fontSize,
  lineHeight,
  fill,
  fontFamily = FONT.sans,
  fontWeight = 400,
  letterSpacing = 0,
  kind = 'sans',
  maxLines,
  maxHeight,
  align = 'left',
}) {
  const { lines, fontSize: fittedFontSize } = fitLines(text, width, {
    fontSize,
    minFontSize,
    fontWeight,
    maxLines,
    maxHeight,
    lineHeight,
    letterSpacing,
    kind,
  });
  const computedLineHeight = lineHeight
    ? Math.round(lineHeight * (fittedFontSize / fontSize))
    : Math.round(fittedFontSize * 1.28);
  const letterSpacingAttr = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
  const tspans = lines
    .map((lineText, index) => {
      let lineX = x;
      if (align === 'center') {
        lineX = x + (width - measureText(lineText, {
          fontSize: fittedFontSize,
          fontWeight,
          letterSpacing,
          kind,
        })) / 2;
      } else if (align === 'right') {
        lineX = x + width - measureText(lineText, {
          fontSize: fittedFontSize,
          fontWeight,
          letterSpacing,
          kind,
        });
      }
      const dy = index === 0 ? 0 : computedLineHeight;
      return `<tspan x="${lineX.toFixed(1)}" dy="${dy}">${escapeXml(lineText)}</tspan>`;
    })
    .join('');

  const metadata = [
    `data-ab-max-width="${width}"`,
    `data-ab-font-size="${fittedFontSize}"`,
    `data-ab-font-weight="${fontWeight}"`,
    `data-ab-letter-spacing="${letterSpacing}"`,
    `data-ab-kind="${kind}"`,
  ].join(' ');

  return {
    svg: `<text x="${x}" y="${y}" fill="${fill}" font-size="${fittedFontSize}" font-weight="${fontWeight}" font-family="${fontFamily}" ${metadata}${letterSpacingAttr}>${tspans}</text>`,
    height: lines.length * computedLineHeight,
    fontSize: fittedFontSize,
  };
}

function pageStart() {
  return [
    '<!-- Generated by scripts/generate-case-study-svgs.mjs. Do not edit directly. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.width}" height="${SIZE.height}" viewBox="0 0 ${SIZE.width} ${SIZE.height}" fill="none">`,
    fontStyleBlock(),
    `<rect width="${SIZE.width}" height="${SIZE.height}" rx="40" fill="${COLORS.page}"/>`,
    `<rect x="48" y="48" width="1104" height="804" rx="34" fill="${COLORS.frame}" stroke="${COLORS.frameStroke}" stroke-width="2"/>`,
  ];
}

function fontStyleBlock() {
  return [
    '<style>',
    '@font-face {',
    `  font-family: "${FONT.sans}";`,
    `  src: url(data:font/woff;base64,${FONT_ASSETS.sansRegular.base64}) format("woff");`,
    '  font-style: normal;',
    '  font-weight: 400;',
    '}',
    '@font-face {',
    `  font-family: "${FONT.sans}";`,
    `  src: url(data:font/woff;base64,${FONT_ASSETS.sansBold.base64}) format("woff");`,
    '  font-style: normal;',
    '  font-weight: 700;',
    '}',
    '@font-face {',
    `  font-family: "${FONT.mono}";`,
    `  src: url(data:font/woff;base64,${FONT_ASSETS.monoRegular.base64}) format("woff");`,
    '  font-style: normal;',
    '  font-weight: 400;',
    '}',
    '@font-face {',
    `  font-family: "${FONT.mono}";`,
    `  src: url(data:font/woff;base64,${FONT_ASSETS.monoBold.base64}) format("woff");`,
    '  font-style: normal;',
    '  font-weight: 700;',
    '}',
    '</style>',
  ].join('\n');
}

function eyebrow(label) {
  return textBlock({
    x: 84,
    y: 110,
    width: 900,
    text: label,
    fontSize: 24,
    fill: COLORS.eyebrow,
    fontFamily: FONT.sans,
    fontWeight: 700,
    letterSpacing: 4,
    kind: 'sans',
  }).svg;
}

function title(text, maxWidth = 1032, y = 178, fontSize = 56) {
  return textBlock({
    x: 84,
    y,
    width: maxWidth,
    text,
    fontSize,
    minFontSize: fontSize - 8,
    lineHeight: Math.round(fontSize * 1.08),
    fill: COLORS.ink,
    fontFamily: FONT.display,
    fontWeight: 700,
    kind: 'sans',
    maxLines: 3,
  }).svg;
}

function renderDceCliValidate() {
  const parts = pageStart();
  parts.push(eyebrow('CLI PATH'));
  parts.push(title('Three public command surfaces', 1032, 178, 54));

  const rows = [
    {
      y: 246,
      fill: COLORS.amberBg,
      stroke: COLORS.amberStroke,
      label: 'VALIDATE',
      labelFill: COLORS.amberInk,
      command: 'dce validate contract.yml',
      meta: 'schema-only · sample-size · strict · json',
    },
    {
      y: 420,
      fill: COLORS.blueBg,
      stroke: COLORS.blueStroke,
      label: 'INIT',
      labelFill: COLORS.blueInk,
      command: 'dce init <catalog> --namespace analytics --table events',
      meta: '',
    },
    {
      y: 594,
      fill: COLORS.greenBg,
      stroke: COLORS.greenStroke,
      label: 'CHECK',
      labelFill: COLORS.greenInk,
      command: 'dce check contract.yml',
      meta: '',
    },
  ];

  for (const row of rows) {
    parts.push(rect(84, row.y, 1032, 128, row.fill, row.stroke, 30));
    parts.push(textBlock({
      x: 118,
      y: row.y + 52,
      width: 260,
      text: row.label,
      fontSize: 20,
      fill: row.labelFill,
      fontFamily: FONT.sans,
      fontWeight: 700,
      letterSpacing: 3,
      kind: 'sans',
      maxLines: 1,
    }).svg);
    parts.push(textBlock({
      x: 118,
      y: row.y + 88,
      width: row.meta ? 580 : 820,
      text: row.command,
      fontSize: 30,
      minFontSize: 24,
      lineHeight: 32,
      fill: '#1B2746',
      fontFamily: FONT.mono,
      fontWeight: 700,
      kind: 'mono',
      maxLines: 2,
    }).svg);
    if (row.meta) {
      parts.push(textBlock({
        x: 760,
        y: row.y + 78,
        width: 280,
        text: row.meta,
        fontSize: 20,
        minFontSize: 18,
        lineHeight: 22,
        fill: COLORS.muted,
        fontFamily: FONT.sans,
        kind: 'sans',
        maxLines: 2,
      }).svg);
    }
  }

  parts.push(textBlock({
    x: 84,
    y: 776,
    width: 900,
    text: 'The public CLI already covers validation, generation, and syntax checks without hiding the workflow behind a separate UI.',
    fontSize: 24,
    minFontSize: 22,
    lineHeight: 28,
    fill: COLORS.muted,
    fontFamily: FONT.sans,
    kind: 'sans',
    maxLines: 3,
  }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderDceContractExample() {
  const parts = pageStart();
  parts.push(eyebrow('CONTRACT SHAPE'));
  parts.push(title('A data contract as a public artifact', 1032, 178, 54));
  parts.push(rect(84, 246, 566, 520, COLORS.amberBg, COLORS.amberStroke, 34));
  parts.push(rect(704, 246, 412, 520, COLORS.blueBg, COLORS.blueStroke, 34));
  parts.push(textBlock({ x: 122, y: 304, width: 200, text: 'SCHEMA', fontSize: 20, fill: COLORS.amberInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
  parts.push(textBlock({ x: 122, y: 362, width: 320, text: 'user_events', fontSize: 34, minFontSize: 30, fill: '#1B2746', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  parts.push(rect(122, 404, 198, 56, COLORS.blueBg, COLORS.blueStroke, 18));
  parts.push(rect(336, 404, 240, 56, COLORS.greenBg, COLORS.greenStroke, 18));
  parts.push(textBlock({ x: 144, y: 439, width: 154, text: 'format: iceberg', fontSize: 20, minFontSize: 18, fill: COLORS.blueInk, fontFamily: FONT.sans, kind: 'sans', maxLines: 1 }).svg);
  parts.push(textBlock({ x: 356, y: 439, width: 200, text: 'owner: analytics-team', fontSize: 20, minFontSize: 18, fill: COLORS.greenInk, fontFamily: FONT.sans, kind: 'sans', maxLines: 1 }).svg);
  parts.push(rect(122, 492, 454, 76, COLORS.frame, COLORS.frameStroke, 24));
  parts.push(textBlock({ x: 148, y: 538, width: 180, text: 'user_id', fontSize: 26, fill: '#1B2746', fontFamily: FONT.sans, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  parts.push(textBlock({ x: 332, y: 538, width: 210, text: 'string · required', fontSize: 22, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 1 }).svg);
  parts.push(rect(122, 588, 454, 118, COLORS.frame, COLORS.frameStroke, 24));
  parts.push(textBlock({ x: 148, y: 634, width: 180, text: 'event_type', fontSize: 26, fill: '#1B2746', fontFamily: FONT.sans, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  parts.push(textBlock({ x: 148, y: 674, width: 390, text: 'allowed values: click · view · purchase', fontSize: 22, minFontSize: 20, lineHeight: 26, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 2 }).svg);
  parts.push(textBlock({ x: 742, y: 304, width: 220, text: 'QUALITY CHECKS', fontSize: 20, fill: COLORS.blueInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);

  const qualityCards = [
    ['Completeness', 'threshold: 0.99'],
    ['Freshness', 'max delay: 1h'],
    ['Execution target', 'Iceberg table with typed fields and rule checks'],
  ];
  for (const [index, [heading, body]] of qualityCards.entries()) {
    const y = 352 + index * 138;
    parts.push(rect(742, y, 336, 108, '#FFFFFF', '#D8E3EE', 28));
    parts.push(textBlock({ x: 774, y: y + 56, width: 260, text: heading, fontSize: 28, minFontSize: 24, fill: '#1B2746', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 2 }).svg);
    parts.push(textBlock({ x: 774, y: y + 92, width: 260, text: body, fontSize: 21, minFontSize: 19, lineHeight: 24, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function renderDruidQueryDemo() {
  const parts = pageStart();
  parts.push(eyebrow('QUERY PATH'));
  parts.push(title('Offline segment, live SQL', 1032, 178, 54));
  parts.push(rect(84, 256, 1032, 156, COLORS.blueBg, COLORS.blueStroke, 32));
  parts.push(textBlock({ x: 118, y: 314, width: 240, text: 'REGISTER', fontSize: 20, fill: COLORS.blueInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
  parts.push(textBlock({ x: 118, y: 350, width: 860, text: 'DruidTableProvider::try_new("path/to/segment/index.dr")', fontSize: 24, minFontSize: 20, lineHeight: 30, fill: '#1B2746', fontFamily: FONT.mono, fontWeight: 700, kind: 'mono', maxLines: 3 }).svg);
  parts.push(rect(84, 446, 1032, 256, COLORS.amberBg, COLORS.amberStroke, 32));
  parts.push(textBlock({ x: 118, y: 504, width: 220, text: 'QUERY', fontSize: 20, fill: COLORS.amberInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
  parts.push(textBlock({ x: 118, y: 562, width: 820, text: 'SELECT * FROM druid_table LIMIT 10;', fontSize: 34, minFontSize: 28, lineHeight: 38, fill: '#1B2746', fontFamily: FONT.mono, fontWeight: 700, kind: 'mono', maxLines: 2 }).svg);
  const chips = [
    [118, 606, 280, 'No running Druid cluster'],
    [420, 606, 280, 'Direct segment reader'],
    [722, 606, 320, 'Arrow-native execution path'],
  ];
  for (const [x, y, width, label] of chips) {
    parts.push(rect(x, y, width, 54, COLORS.frame, COLORS.frameStroke, 18));
    parts.push(textBlock({ x: x + 22, y: y + 35, width: width - 44, text: label, fontSize: 21, minFontSize: 19, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  }
  parts.push(textBlock({ x: 84, y: 770, width: 900, text: 'The public example is already enough to evaluate the core promise: segment-local data becomes a DataFusion table without spinning up the original serving system.', fontSize: 24, minFontSize: 22, lineHeight: 28, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderDruidSegmentAnatomy() {
  const parts = pageStart();
  parts.push(eyebrow('ANATOMY'));
  parts.push(title('How one offline segment becomes a queryable table', 940, 166, 48));

  const left = ['index.dr', 'metadata.dr', 'version.bin'];
  left.forEach((label, index) => {
    const y = 288 + index * 150;
    parts.push(rect(96, y, 244, 118, COLORS.amberBg, COLORS.amberStroke, 28));
    if (index === 0) {
      parts.push(textBlock({ x: 132, y: y + 52, width: 160, text: 'SEGMENT FILE', fontSize: 18, fill: COLORS.amberInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
    }
    parts.push(textBlock({ x: 132, y: y + 94, width: 170, text: label, fontSize: 28, minFontSize: 26, fill: '#1B2746', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  });

  const middle = ['Dictionaries', 'Metrics', 'Bitmaps'];
  middle.forEach((label, index) => {
    const y = 316 + index * 142;
    parts.push(rect(456, y, 280, 96, COLORS.blueBg, COLORS.blueStroke, 24));
    parts.push(textBlock({ x: 490, y: y + 58, width: 212, text: label, fontSize: 28, minFontSize: 24, fill: COLORS.blueInk, fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  });

  parts.push(rect(848, 390, 264, 214, COLORS.darkPanel, COLORS.darkPanel, 32));
  parts.push(textBlock({ x: 888, y: 472, width: 184, text: 'Arrow', fontSize: 40, minFontSize: 36, fill: COLORS.darkInk, fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  parts.push(textBlock({ x: 892, y: 514, width: 176, text: 'TableProvider + ExecutionPlan', fontSize: 20, minFontSize: 18, lineHeight: 24, fill: COLORS.darkMuted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3, align: 'center' }).svg);
  parts.push(line(340, 346, 432, 346, '#C79A57'));
  parts.push(line(340, 496, 432, 496, '#C79A57'));
  parts.push(line(340, 646, 432, 646, '#C79A57'));
  parts.push(line(736, 506, 818, 506, '#7BA3BF'));
  parts.push(textBlock({ x: 84, y: 792, width: 1020, text: 'The bridge is useful because storage internals become reusable query surfaces instead of data that only the original serving system understands.', fontSize: 23, minFontSize: 21, lineHeight: 27, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderLakehouseSetupFlow() {
  const parts = pageStart();
  parts.push(eyebrow('BOOTSTRAP FLOW'));
  parts.push(title('Small-team lakehouse, staged in four moves', 900, 172, 50));
  const steps = [
    [90, 220, 220, COLORS.amberBg, COLORS.amberStroke, COLORS.amberInk, 'STEP 1', 'python -m venv .venv', 24, 18],
    [336, 220, 264, COLORS.blueBg, COLORS.blueStroke, COLORS.blueInk, 'STEP 2', 'pip install -r requirements.txt', 21, 18],
    [626, 220, 264, COLORS.greenBg, COLORS.greenStroke, COLORS.greenInk, 'STEP 3', 'docker-compose up -d', 21, 18],
    [916, 220, 194, COLORS.roseBg, COLORS.roseStroke, COLORS.roseInk, 'STEP 4', 'dbt run', 24, 18],
  ];
  for (const [x, y, width, fill, stroke, ink, stepLabel, command, commandFontSize, commandMinFontSize] of steps) {
    parts.push(rect(x, y, width, 136, fill, stroke, 28));
    parts.push(textBlock({ x: x + 30, y: y + 54, width: width - 60, text: stepLabel, fontSize: 18, fill: ink, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
    parts.push(textBlock({ x: x + 30, y: y + 92, width: width - 60, text: command, fontSize: commandFontSize, minFontSize: commandMinFontSize, lineHeight: 28, fill: '#1B2746', fontFamily: FONT.mono, fontWeight: 700, kind: 'mono', maxLines: 3 }).svg);
  }
  parts.push(line(310, 288, 336, 288, '#C79A57'));
  parts.push(line(600, 288, 626, 288, '#7BA3BF'));
  parts.push(line(890, 288, 916, 288, '#8BB59A'));
  parts.push(rect(90, 470, 1020, 288, COLORS.amberBg, COLORS.amberStroke, 34));
  parts.push(textBlock({ x: 126, y: 532, width: 320, text: 'Service surface', fontSize: 36, fill: COLORS.ink, fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  const services = [
    [126, 592, 260, 'MinIO console', ':9001'],
    [406, 592, 190, 'Superset', ':8088'],
    [616, 592, 500, 'Example pipeline', 'python dlt/pipelines/example_api.py'],
  ];
  for (const [x, y, width, label, value] of services) {
    parts.push(rect(x, y, width, 116, COLORS.frame, COLORS.frameStroke, 24));
    parts.push(textBlock({ x: x + 28, y: y + 50, width: width - 56, text: label, fontSize: 28, minFontSize: 24, fill: '#1B2746', fontFamily: FONT.sans, fontWeight: 700, kind: 'sans', maxLines: 2 }).svg);
    parts.push(textBlock({ x: x + 28, y: y + 84, width: width - 56, text: value, fontSize: 21, minFontSize: 18, lineHeight: 24, fill: COLORS.muted, fontFamily: FONT.mono, kind: 'mono', maxLines: 3 }).svg);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function renderNephtysRestPoller() {
  const parts = [
    '<!-- Generated by scripts/generate-case-study-svgs.mjs. Do not edit directly. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.width}" height="${SIZE.height}" viewBox="0 0 ${SIZE.width} ${SIZE.height}" fill="none">`,
    '<defs>',
    '  <linearGradient id="nephtysFlow" x1="180" y1="236" x2="1016" y2="636" gradientUnits="userSpaceOnUse">',
    '    <stop stop-color="#2E6F95"/>',
    '    <stop offset="1" stop-color="#64A67D"/>',
    '  </linearGradient>',
    '</defs>',
    fontStyleBlock(),
    `<rect width="${SIZE.width}" height="${SIZE.height}" rx="40" fill="${COLORS.page}"/>`,
    '<circle cx="1042" cy="122" r="188" fill="#E7D8C3" fill-opacity="0.5"/>',
    '<circle cx="184" cy="784" r="220" fill="#E8E2D7"/>',
    `<rect x="44" y="44" width="1112" height="812" rx="34" fill="${COLORS.frame}" stroke="${COLORS.frameStroke}" stroke-width="2"/>`,
  ];
  parts.push(eyebrow('RUNNABLE FLOW'));
  parts.push(title('Nephtys REST poller', 760, 178, 56));
  parts.push(textBlock({ x: 84, y: 226, width: 760, text: 'A public weather source becomes a normalized JetStream subject without custom glue code.', fontSize: 24, minFontSize: 22, lineHeight: 28, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  const topCards = [
    [90, 306, 224, COLORS.amberBg, '#D7C09D', COLORS.amberInk, 'SOURCE', 'Open-Meteo'],
    [486, 306, 230, COLORS.blueBg, COLORS.blueStroke, COLORS.blueInk, 'NORMALIZE', 'REST poller'],
    [886, 306, 220, '#F2FAF4', '#BED7C1', '#5C8E63', 'DURABILITY', 'JetStream'],
  ];
  for (const [x, y, width, fill, stroke, ink, label, value] of topCards) {
    parts.push(rect(x, y, width, 126, fill, stroke, 28));
    parts.push(textBlock({ x: x + 32, y: y + 52, width: width - 64, text: label, fontSize: 20, fill: ink, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
    parts.push(textBlock({ x: x + 32, y: y + 96, width: width - 64, text: value, fontSize: 34, minFontSize: 28, fill: '#1B2746', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 2 }).svg);
  }
  parts.push('<path d="M314 369C388 369 398 369 486 369" stroke="url(#nephtysFlow)" stroke-width="10" stroke-linecap="round"/>');
  parts.push('<path d="M716 369C794 369 804 369 886 369" stroke="url(#nephtysFlow)" stroke-width="10" stroke-linecap="round"/>');
  parts.push('<polygon points="474,369 444,351 444,387" fill="#3B7B99"/>');
  parts.push('<polygon points="874,369 844,351 844,387" fill="#5C8E63"/>');
  parts.push(rect(90, 520, 1020, 150, '#FFF7EC', COLORS.amberStroke, 30));
  parts.push(textBlock({ x: 126, y: 576, width: 220, text: 'SUBJECT', fontSize: 22, fill: COLORS.amberInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
  parts.push(textBlock({ x: 126, y: 614, width: 620, text: 'nephtys.stream.sensors.weather.bologna', fontSize: 26, minFontSize: 21, lineHeight: 30, fill: COLORS.ink, fontFamily: FONT.mono, fontWeight: 700, kind: 'mono', maxLines: 3 }).svg);
  parts.push(rect(90, 704, 312, 96, COLORS.blueBg, COLORS.blueStroke, 24));
  parts.push(textBlock({ x: 122, y: 762, width: 248, text: '60s interval', fontSize: 28, fill: COLORS.blueInk, fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  parts.push(rect(428, 704, 682, 96, COLORS.greenBg, '#BED7C1', 24));
  parts.push(textBlock({ x: 460, y: 748, width: 618, text: 'Compatible with the documented Open-Meteo example and downstream nats sub tap.', fontSize: 22, minFontSize: 20, lineHeight: 26, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderNephtysConnectors() {
  const parts = pageStart();
  parts.push(eyebrow('CONNECTOR SURFACE'));
  parts.push(title('One ingress shape, five real-time entry points', 720, 166, 48));
  parts.push(textBlock({ x: 84, y: 258, width: 520, text: 'Nephtys keeps the connector edge diverse while preserving one durable event contract downstream.', fontSize: 22, minFontSize: 20, lineHeight: 24, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push(rect(466, 320, 268, 264, COLORS.darkPanel, COLORS.darkPanel, 36));
  parts.push(textBlock({ x: 496, y: 406, width: 208, text: 'JetStream', fontSize: 40, fill: COLORS.darkInk, fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  parts.push(textBlock({ x: 512, y: 446, width: 176, text: 'events + configs', fontSize: 22, fill: '#D5DCE7', fontFamily: FONT.sans, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  parts.push(textBlock({ x: 492, y: 518, width: 216, text: 'FILTER → TRANSFORM → DEDUP', fontSize: 16, minFontSize: 15, fill: '#E4B66C', fontFamily: FONT.sans, letterSpacing: 2, kind: 'sans', maxLines: 2, align: 'center' }).svg);

  const connectors = [
    [114, 320, COLORS.blueBg, COLORS.blueStroke, '#23476A', 'WebSocket'],
    [114, 446, COLORS.greenBg, COLORS.greenStroke, COLORS.greenInk, 'SSE'],
    [114, 572, COLORS.amberBg, COLORS.amberStroke, COLORS.amberInk, 'REST'],
    [876, 320, COLORS.roseBg, COLORS.roseStroke, COLORS.roseInk, 'Webhook'],
    [876, 446, COLORS.purpleBg, COLORS.purpleStroke, COLORS.purpleInk, 'gRPC'],
  ];
  for (const [x, y, fill, stroke, ink, label] of connectors) {
    parts.push(rect(x, y, 210, 86, fill, stroke, 24));
    parts.push(textBlock({ x: x + 22, y: y + 52, width: 166, text: label, fontSize: 28, minFontSize: 24, fill: ink, fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1, align: 'center' }).svg);
  }

  parts.push('<path d="M324 363C392 363 394 362 454 404" stroke="#7BA3BF" stroke-width="8" stroke-linecap="round"/>');
  parts.push('<path d="M324 489C392 489 394 488 454 444" stroke="#8BB59A" stroke-width="8" stroke-linecap="round"/>');
  parts.push('<path d="M324 615C392 615 394 614 454 484" stroke="#D19F59" stroke-width="8" stroke-linecap="round"/>');
  parts.push('<path d="M734 404C790 362 792 363 876 363" stroke="#D9B17A" stroke-width="8" stroke-linecap="round"/>');
  parts.push('<path d="M734 444C790 488 792 489 876 489" stroke="#9B87C8" stroke-width="8" stroke-linecap="round"/>');
  parts.push(rect(112, 720, 974, 92, COLORS.amberBg, COLORS.frameStroke, 24));
  parts.push(textBlock({ x: 148, y: 764, width: 900, text: 'Configurable through the REST API, with one pipeline shape regardless of whether the source is push- or pull-based.', fontSize: 22, minFontSize: 20, lineHeight: 26, fill: COLORS.muted, fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderPeekABooTooling() {
  const parts = pageStart();
  parts.push(eyebrow('TOOL SURFACE'));
  parts.push(title('A deliberately narrow agent toolkit', 720, 172, 50));
  const cards = [
    [92, 252, COLORS.amberBg, COLORS.amberStroke, COLORS.amberInk, 'ORIENT', 'ListFiles + FindFiles'],
    [652, 252, COLORS.blueBg, COLORS.blueStroke, COLORS.blueInk, 'UNDERSTAND', 'ReadPreview'],
    [92, 410, COLORS.greenBg, COLORS.greenStroke, COLORS.greenInk, 'TARGET', 'GrepSearch'],
    [652, 410, COLORS.roseBg, COLORS.roseStroke, COLORS.roseInk, 'ESCALATE', 'GrepRecursive'],
  ];
  for (const [x, y, fill, stroke, ink, label, value] of cards) {
    parts.push(rect(x, y, 456, 116, fill, stroke, 28));
    parts.push(textBlock({ x: x + 34, y: y + 54, width: 388, text: label, fontSize: 18, fill: ink, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
    parts.push(textBlock({ x: x + 34, y: y + 96, width: 388, text: value, fontSize: 30, minFontSize: 26, fill: '#1B2746', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 2 }).svg);
  }
  parts.push(line(548, 468, 630, 468, '#C79A57'));
  parts.push(arrowHead(630, 468, '#C79A57'));
  parts.push(rect(92, 606, 1016, 172, COLORS.darkPanel, COLORS.darkPanel, 30));
  parts.push(textBlock({ x: 132, y: 668, width: 200, text: 'LIMITS', fontSize: 22, fill: COLORS.darkInk, fontFamily: FONT.sans, fontWeight: 700, letterSpacing: 3, kind: 'sans' }).svg);
  parts.push(textBlock({ x: 132, y: 718, width: 940, text: '30 entries · 20 file results · 3 matches per file · 10 files total', fontSize: 26, minFontSize: 23, fill: '#E2E7F0', fontFamily: FONT.sans, kind: 'sans', maxLines: 2 }).svg);
  parts.push(textBlock({ x: 132, y: 754, width: 900, text: 'The strategy stays surgical by default and only widens scope when the first local question fails.', fontSize: 21, minFontSize: 19, lineHeight: 25, fill: '#C8CFDA', fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderApacheRustContribMap() {
  const parts = [
    '<!-- Generated by scripts/generate-case-study-svgs.mjs. Do not edit directly. -->',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" role="img" aria-labelledby="title desc">',
    fontStyleBlock(),
    '  <title id="title">Apache Rust contributions map</title>',
    '  <desc id="desc">A visual summary of contributions across Arrow RS, DataFusion, Iceberg Rust, and Fluss Rust.</desc>',
    `  <rect width="1200" height="760" fill="${COLORS.page}"/>`,
    '  <rect x="36" y="36" width="1128" height="688" rx="28" fill="#fbf7ef" stroke="#172033" stroke-width="3"/>',
    textBlock({ x: 72, y: 104, width: 440, text: 'Apache Rust Data Stack', fontSize: 24, fill: '#172033', fontFamily: FONT.sans, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg,
    textBlock({ x: 72, y: 138, width: 520, text: 'Upstream fixes, docs, and integration work driven by real downstream tools.', fontSize: 18, minFontSize: 17, lineHeight: 24, fill: '#42506b', fontFamily: FONT.sans, kind: 'sans', maxLines: 2 }).svg,
    '  <line x1="220" y1="246" x2="980" y2="246" stroke="#172033" stroke-width="4" stroke-linecap="round"/>',
    '  <line x1="220" y1="478" x2="980" y2="478" stroke="#172033" stroke-width="4" stroke-linecap="round"/>',
  ];
  const cards = [
    [76, '#d9ecff', 'arrow-rs', 'Parquet reader examples, dictionary-preserving docs.'],
    [346, '#e3f3d1', 'DataFusion', 'Arrow-native SQL execution and query-layer ergonomics.'],
    [616, '#fde7bf', 'iceberg-rust', 'Tables, metadata, commit behavior, interoperability.'],
    [886, '#f8d9e7', 'fluss-rust', 'Streaming client and integration surfaces.'],
  ];
  for (const [x, fill, heading, body] of cards) {
    parts.push(`  <rect x="${x}" y="182" width="248" height="128" rx="20" fill="${fill}" stroke="#172033" stroke-width="3"/>`);
    parts.push(textBlock({ x: x + 30, y: 226, width: 188, text: heading, fontSize: 28, minFontSize: 24, fill: '#172033', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
    parts.push(textBlock({ x: x + 30, y: 262, width: 188, text: body, fontSize: 17, minFontSize: 16, lineHeight: 22, fill: '#172033', fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  }
  parts.push('  <rect x="120" y="400" width="960" height="188" rx="26" fill="#fffdf8" stroke="#172033" stroke-width="3"/>');
  parts.push(textBlock({ x: 154, y: 446, width: 340, text: 'What ties them together', fontSize: 26, fill: '#172033', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  parts.push(textBlock({ x: 154, y: 488, width: 600, text: 'Downstream project pain becomes upstream improvement:', fontSize: 22, minFontSize: 20, lineHeight: 28, fill: '#172033', fontFamily: FONT.sans, kind: 'sans', maxLines: 2 }).svg);
  parts.push(textBlock({ x: 154, y: 548, width: 820, text: 'profilers need better Parquet behavior, query layers need cleaner Arrow plumbing, lakehouse stacks need stronger table semantics, and streaming stacks need usable Rust clients.', fontSize: 20, minFontSize: 18, lineHeight: 26, fill: '#42506b', fontFamily: FONT.sans, kind: 'sans', maxLines: 4 }).svg);
  parts.push(textBlock({ x: 72, y: 650, width: 920, text: 'The common thread is not logo collection. It is fixing recurring system constraints in the real upstream projects.', fontSize: 18, minFontSize: 17, lineHeight: 24, fill: '#42506b', fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

function renderApacheRustProofPoints() {
  const cardY = 182;
  const cardHeight = 208;
  const headingY = 224;
  const countY = 270;
  const bodyY = 308;
  const bodyBottomPadding = 18;
  const parts = [
    '<!-- Generated by scripts/generate-case-study-svgs.mjs. Do not edit directly. -->',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" role="img" aria-labelledby="title desc">',
    fontStyleBlock(),
    '  <title id="title">Apache Rust proof points</title>',
    '  <desc id="desc">Public proof points for Apache Arrow RS, DataFusion, Iceberg Rust, and Fluss Rust contributions.</desc>',
    `  <rect width="1200" height="760" fill="${COLORS.page}"/>`,
    '  <rect x="38" y="38" width="1124" height="684" rx="28" fill="#fbf7ef" stroke="#172033" stroke-width="3"/>',
    textBlock({ x: 72, y: 104, width: 360, text: 'Public Proof Points', fontSize: 24, fill: '#172033', fontFamily: FONT.sans, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg,
    textBlock({ x: 72, y: 138, width: 700, text: 'Counts below come from the public README contribution badges and the long-form writing already published in this repository.', fontSize: 18, minFontSize: 17, lineHeight: 24, fill: '#42506b', fontFamily: FONT.sans, kind: 'sans', maxLines: 3 }).svg,
  ];
  const cards = [
    [72, '#d9ecff', 'arrow-rs', '2 PRs', 'Documented in the dataprof article with PR #9116 and PR #9163 called out.'],
    [344, '#e3f3d1', 'DataFusion', '1 PR', 'Appears in the public badges and in the DataFusion-heavy technical writing on the site.'],
    [616, '#fde7bf', 'iceberg-rust', '3 PRs', 'Anchored by the RisingWave and Iceberg-Rust article plus the site-wide contribution data.'],
    [888, '#f8d9e7', 'fluss-rust', '2 PRs', 'Tracked in the public README and contributions generator as streaming client integration work.'],
  ];
  for (const [x, fill, heading, count, body] of cards) {
    const width = x === 888 ? 238 : 250;
    const bodyMaxHeight = cardY + cardHeight - bodyY - bodyBottomPadding;
    parts.push(`  <rect x="${x}" y="${cardY}" width="${width}" height="${cardHeight}" rx="20" fill="${fill}" stroke="#172033" stroke-width="3"/>`);
    parts.push(textBlock({ x: x + 30, y: headingY, width: width - 60, text: heading, fontSize: 26, minFontSize: 23, fill: '#172033', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
    parts.push(textBlock({ x: x + 30, y: countY, width: width - 60, text: count, fontSize: 40, minFontSize: 34, fill: '#172033', fontFamily: FONT.sans, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
    parts.push(textBlock({ x: x + 30, y: bodyY, width: width - 60, text: body, fontSize: x === 888 ? 15 : 16, minFontSize: 12, lineHeight: 18, maxHeight: bodyMaxHeight, fill: '#172033', fontFamily: FONT.sans, kind: 'sans', maxLines: 4 }).svg);
  }
  parts.push('  <rect x="72" y="430" width="1054" height="220" rx="24" fill="#fffdf8" stroke="#172033" stroke-width="3"/>');
  parts.push(textBlock({ x: 106, y: 480, width: 320, text: 'Narrative thread', fontSize: 26, fill: '#172033', fontFamily: FONT.display, fontWeight: 700, kind: 'sans', maxLines: 1 }).svg);
  parts.push(textBlock({ x: 106, y: 524, width: 760, text: 'The Apache work is best read as one loop:', fontSize: 22, fill: '#172033', fontFamily: FONT.sans, kind: 'sans', maxLines: 1 }).svg);
  parts.push(textBlock({ x: 106, y: 560, width: 900, text: 'build a real system, hit a limit in the underlying stack, push the fix or clarification upstream, then bring that improved substrate back into downstream tools.', fontSize: 20, minFontSize: 18, lineHeight: 28, fill: '#42506b', fontFamily: FONT.sans, kind: 'sans', maxLines: 4 }).svg);
  parts.push('</svg>');
  return parts.join('\n');
}

const outputs = new Map([
  ['assets/images/case-studies/dce-cli-validate.svg', renderDceCliValidate()],
  ['assets/images/case-studies/dce-contract-example.svg', renderDceContractExample()],
  ['assets/images/case-studies/druid-query-demo.svg', renderDruidQueryDemo()],
  ['assets/images/case-studies/druid-segment-anatomy.svg', renderDruidSegmentAnatomy()],
  ['assets/images/case-studies/lakehouse-setup-flow.svg', renderLakehouseSetupFlow()],
  ['assets/images/case-studies/nephtys-rest-poller.svg', renderNephtysRestPoller()],
  ['assets/images/case-studies/nephtys-connectors.svg', renderNephtysConnectors()],
  ['assets/images/case-studies/peek-a-boo-tooling.svg', renderPeekABooTooling()],
  ['assets/images/case-studies/apache-rust-contrib-map.svg', renderApacheRustContribMap()],
  ['assets/images/case-studies/apache-rust-proof-points.svg', renderApacheRustProofPoints()],
]);

for (const [relativePath, content] of outputs) {
  const outputPath = resolve(relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${content}\n`);
  console.log(`wrote ${relativePath}`);
}