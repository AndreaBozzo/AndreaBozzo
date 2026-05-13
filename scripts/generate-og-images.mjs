import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASE_STUDIES_PATH = join(ROOT_DIR, 'assets/data/case-studies.json');
const OUTPUT_DIR = join(ROOT_DIR, 'assets/images/og');
const BLOG_POSTS_DIR = join(ROOT_DIR, 'blog/content/posts');
const BLOG_OG_DIR = join(ROOT_DIR, 'blog/static/images/og-posts');
const WIDTH = 1200;
const HEIGHT = 630;
const PANEL_X = 822;
const TEXT_X = 88;
const TEXT_MAX_WIDTH = 690;
const TITLE_FONT_SIZE = 64;
const TITLE_LINE_HEIGHT = 76;
const FONT_FAMILY = 'Noto Sans';
const METRIC_FONT_FILES = {
  regular: join(ROOT_DIR, 'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff'),
  semibold: join(ROOT_DIR, 'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff'),
  bold: join(ROOT_DIR, 'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff'),
};
const RENDER_OPTIONS = {
  font: {
    loadSystemFonts: true,
    defaultFontFamily: FONT_FAMILY,
    sansSerifFamily: FONT_FAMILY,
  },
};
const COLORS = {
  page: '#f7faf6',
  frame: '#ffffff',
  frameStroke: '#d7e4dd',
  title: '#10201c',
  body: '#425e56',
  muted: '#6f8b82',
  grid: '#e7f0eb',
};
const PALETTES = [
  { panel: '#007f6d', accent: '#2dd4bf', ink: '#f6fffb', chipFill: '#e7f8f2', chipStroke: '#a7dbc7', chipInk: '#0b5f53' },
  { panel: '#17342d', accent: '#6fbf73', ink: '#edf7f3', chipFill: '#edf7ec', chipStroke: '#bddbbf', chipInk: '#386d3d' },
  { panel: '#0d3b32', accent: '#00a98f', ink: '#f6fffb', chipFill: '#e3f6f0', chipStroke: '#91d7c8', chipInk: '#006f61' },
  { panel: '#315947', accent: '#86efac', ink: '#f6fffb', chipFill: '#eef8e9', chipStroke: '#c6e0b9', chipInk: '#3f6d39' },
  { panel: '#5f4a2b', accent: '#f0b35a', ink: '#fff8e8', chipFill: '#fff4dc', chipStroke: '#e4c587', chipInk: '#7b5318' },
];

const FONT_METRICS = Object.fromEntries(
  Object.entries(METRIC_FONT_FILES).map(([key, filePath]) => {
    const buffer = readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return [key, opentype.parse(arrayBuffer)];
  }),
);

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashString(value) {
  let hash = 0;
  for (const character of value) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function paletteFor(key) {
  return PALETTES[hashString(key) % PALETTES.length];
}

function fontMetricFor(fontWeight) {
  if (Number(fontWeight ?? 400) >= 700) return FONT_METRICS.bold;
  if (Number(fontWeight ?? 400) >= 600) return FONT_METRICS.semibold;
  return FONT_METRICS.regular;
}

function measureText(text, options = {}) {
  const fontSize = options.fontSize ?? 16;
  const letterSpacing = options.letterSpacing ?? 0;
  const font = fontMetricFor(options.fontWeight);
  const normalized = String(text);
  const advanceWidth = font.stringToGlyphs(normalized).reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
  let width = (advanceWidth / font.unitsPerEm) * fontSize;
  if (normalized.length > 1) {
    width += (normalized.length - 1) * letterSpacing;
  }
  return width * 1.04;
}

function truncateToLength(text, maxLength) {
  const normalized = String(text).trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateToWidth(text, maxWidth, options) {
  const normalized = String(text).trim();
  if (measureText(normalized, options) <= maxWidth) {
    return normalized;
  }

  let candidate = normalized;
  while (candidate.length > 1 && measureText(`${candidate.trimEnd()}…`, options) > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return `${candidate.trimEnd()}…`;
}

function appendEllipsisToWidth(text, maxWidth, options) {
  const normalized = String(text).replace(/…$/, '').trimEnd();
  return truncateToWidth(`${normalized}…`, maxWidth, options);
}

function wrapText(text, maxWidth, maxLines, options) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, options) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    } else {
      lines.push(truncateToWidth(word, maxWidth, options));
    }

    current = current ? word : '';

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  const consumedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumedWords < words.length && lines.length > 0) {
    lines[lines.length - 1] = appendEllipsisToWidth(lines[lines.length - 1], maxWidth, options);
  }

  return lines.slice(0, maxLines);
}

function renderTitleLines(lines) {
  return lines.map((line, index) => {
    const y = 198 + (index * TITLE_LINE_HEIGHT);
    return `<text x="${TEXT_X}" y="${y}" fill="${COLORS.title}" font-size="${TITLE_FONT_SIZE}" font-weight="700" font-family="${FONT_FAMILY}">${escapeXml(line)}</text>`;
  }).join('\n');
}

function renderBodyLines(lines) {
  return lines.map((line, index) => {
    const y = 386 + (index * 38);
    return `<text x="${TEXT_X}" y="${y}" fill="${COLORS.body}" font-size="30" font-weight="400" font-family="${FONT_FAMILY}">${escapeXml(line)}</text>`;
  }).join('\n');
}

function renderTags(tags, palette) {
  let x = TEXT_X;
  const y = 500;
  const chips = [];
  for (const tag of tags.slice(0, 4)) {
    const text = truncateToLength(tag, 20);
    const width = Math.max(104, measureText(text, { fontSize: 21, fontWeight: 600 }) + 36);
    if (chips.length > 0 && x + width > TEXT_X + TEXT_MAX_WIDTH) {
      break;
    }
    chips.push([
      `<rect x="${x}" y="${y}" width="${width}" height="44" rx="18" fill="${palette.chipFill}" stroke="${palette.chipStroke}"/>`,
      `<text x="${x + 18}" y="${y + 29}" fill="${palette.chipInk}" font-size="21" font-weight="600" font-family="${FONT_FAMILY}">${escapeXml(text)}</text>`,
    ].join('\n'));
    x += width + 14;
  }

  return chips.join('\n');
}

function signatureMark(x, y, scale, palette) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect x="8" y="8" width="128" height="128" rx="34" fill="${palette.ink}" fill-opacity="0.1"/>
    <path d="M34 92L72 38L110 92" stroke="${palette.ink}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M52 92H98" stroke="${palette.accent}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="34" cy="92" r="10" fill="${palette.accent}"/>
    <circle cx="72" cy="38" r="10" fill="${palette.ink}"/>
    <circle cx="110" cy="92" r="10" fill="${palette.accent}"/>
    <text x="40" y="122" fill="${palette.ink}" fill-opacity="0.92" font-size="34" font-weight="700" font-family="${FONT_FAMILY}">AB</text>
  </g>`;
}

function createCardSvg({ eyebrow, title, body, tags, slug, sectionLabel }) {
  const palette = paletteFor(slug);
  const titleLines = wrapText(title, TEXT_MAX_WIDTH, 2, { fontSize: TITLE_FONT_SIZE, fontWeight: 700 });
  const bodyLines = wrapText(body, TEXT_MAX_WIDTH, 3, { fontSize: 30, fontWeight: 400 });
  const safeTags = tags.length > 0 ? tags : ['Andrea Bozzo'];

  return `<!-- Generated by scripts/generate-og-images.mjs -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="42" fill="${COLORS.page}"/>
  <circle cx="244" cy="82" r="156" fill="${palette.accent}" fill-opacity="0.13"/>
  <circle cx="1028" cy="560" r="180" fill="${palette.accent}" fill-opacity="0.11"/>
  <rect x="28" y="28" width="1144" height="574" rx="34" fill="${COLORS.frame}" stroke="${COLORS.frameStroke}" stroke-width="2"/>
  <path d="M72 150H732M72 310H732M72 470H732" stroke="${COLORS.grid}" stroke-width="2" stroke-linecap="round"/>
  <rect x="${PANEL_X}" y="56" width="320" height="518" rx="30" fill="${palette.panel}"/>
  <circle cx="982" cy="210" r="114" fill="${palette.accent}" fill-opacity="0.2"/>
  <path d="M0 0H340V160C278 188 242 246 222 320C204 384 174 446 118 498H0V0Z" transform="translate(822 56)" fill="${palette.accent}" fill-opacity="0.16"/>
  <path d="M862 366H1102" stroke="${palette.ink}" stroke-opacity="0.18" stroke-width="2"/>
  ${signatureMark(884, 118, 1.72, palette)}
  <text x="88" y="112" fill="${palette.panel}" font-size="22" font-weight="700" font-family="${FONT_FAMILY}" letter-spacing="4">${escapeXml(eyebrow.toUpperCase())}</text>
  ${renderTitleLines(titleLines)}
  ${renderBodyLines(bodyLines)}
  ${renderTags(safeTags, palette)}
  <text x="88" y="570" fill="${COLORS.muted}" font-size="22" font-weight="500" font-family="${FONT_FAMILY}">andreabozzo.github.io/AndreaBozzo</text>
  <text x="860" y="458" fill="${palette.ink}" font-size="20" font-weight="700" font-family="${FONT_FAMILY}" letter-spacing="3">${escapeXml(sectionLabel.toUpperCase())}</text>
  <text x="860" y="494" fill="${palette.ink}" font-size="34" font-weight="700" font-family="${FONT_FAMILY}">Andrea</text>
  <text x="860" y="532" fill="${palette.ink}" font-size="34" font-weight="700" font-family="${FONT_FAMILY}">Bozzo</text>
</svg>`;
}

function writeCard(outputDir, fileBaseName, card) {
  const svgPath = join(outputDir, `${fileBaseName}.svg`);
  const pngPath = join(outputDir, `${fileBaseName}.png`);
  const svg = createCardSvg(card);

  writeFileSync(svgPath, svg);
  const png = new Resvg(svg, RENDER_OPTIONS).render().asPng();
  writeFileSync(pngPath, png);
  console.log(`wrote ${svgPath}`);
  console.log(`wrote ${pngPath}`);
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const block = match[1];
  const readScalar = (key) => {
    const scalarMatch = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return scalarMatch ? stripQuotes(scalarMatch[1]) : '';
  };
  const tagsMatch = block.match(/^tags:\s*\[(.*)\]$/m);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map((tag) => stripQuotes(tag)).map((tag) => tag.trim()).filter(Boolean)
    : [];

  return {
    title: readScalar('title'),
    description: readScalar('description'),
    summary: readScalar('summary'),
    draft: readScalar('draft') === 'true',
    tags,
  };
}

function blogEyebrowForFile(fileBaseName) {
  return fileBaseName.endsWith('.it') ? 'Articolo' : 'Blog Post';
}

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(BLOG_OG_DIR, { recursive: true });

const payload = JSON.parse(readFileSync(CASE_STUDIES_PATH, 'utf8'));

writeCard(OUTPUT_DIR, 'homepage', {
  eyebrow: 'Andrea Bozzo',
  title: 'A living map of data infrastructure work.',
  body: 'Data platforms, open source, technical writing, and practical systems work across Rust, Python, and Go.',
  tags: ['Rust', 'Python', 'Go', 'Open Source'],
  slug: 'homepage',
  sectionLabel: 'Homepage',
});

for (const study of payload.items ?? []) {
  writeCard(OUTPUT_DIR, study.slug, {
    eyebrow: 'Case Study',
    title: study.displayTitle || study.title || study.slug,
    body: study.subtitle || study.summary || 'Work archive entry',
    tags: Array.isArray(study.stack) ? study.stack : [],
    slug: study.slug,
    sectionLabel: 'Work Page',
  });
}

for (const entry of readdirSync(BLOG_POSTS_DIR)) {
  if (!entry.endsWith('.md')) {
    continue;
  }

  const filePath = join(BLOG_POSTS_DIR, entry);
  const frontMatter = parseFrontMatter(filePath);
  if (!frontMatter || frontMatter.draft) {
    continue;
  }

  const fileBaseName = basename(entry, '.md');
  writeCard(BLOG_OG_DIR, fileBaseName, {
    eyebrow: blogEyebrowForFile(fileBaseName),
    title: frontMatter.title || fileBaseName,
    body: frontMatter.description || frontMatter.summary || 'Technical writing on data engineering, open systems, and infrastructure work.',
    tags: frontMatter.tags,
    slug: fileBaseName,
    sectionLabel: 'Blog',
  });
}
