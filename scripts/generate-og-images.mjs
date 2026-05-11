import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASE_STUDIES_PATH = join(ROOT_DIR, 'assets/data/case-studies.json');
const OUTPUT_DIR = join(ROOT_DIR, 'assets/images/og');
const BLOG_POSTS_DIR = join(ROOT_DIR, 'blog/content/posts');
const BLOG_OG_DIR = join(ROOT_DIR, 'blog/static/images/og-posts');
const WIDTH = 1200;
const HEIGHT = 630;
const PANEL_X = 822;
const PALETTES = [
  { panel: '#21345A', accent: '#89B0C6', ink: '#F7F2E8', chipFill: '#EDF3F7' },
  { panel: '#29443A', accent: '#9FC6AA', ink: '#F6F2E7', chipFill: '#EFF6F1' },
  { panel: '#5A3A2C', accent: '#E0B28E', ink: '#FFF6ED', chipFill: '#FBF1E8' },
  { panel: '#4B495C', accent: '#C5C3D9', ink: '#F7F5FA', chipFill: '#F1F0F8' },
  { panel: '#5A3946', accent: '#E1AFC2', ink: '#FFF6FA', chipFill: '#FBEFF4' },
];

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

function truncateToLength(text, maxLength) {
  const normalized = String(text).trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function wrapText(text, maxCharsPerLine, maxLines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    } else {
      lines.push(truncateToLength(word, maxCharsPerLine));
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
    lines[lines.length - 1] = truncateToLength(lines[lines.length - 1], maxCharsPerLine - 1) + '…';
  }

  return lines.slice(0, maxLines);
}

function renderTitleLines(lines) {
  return lines.map((line, index) => {
    const y = 206 + (index * 84);
    return `<text x="88" y="${y}" fill="#182035" font-size="72" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(line)}</text>`;
  }).join('\n');
}

function renderBodyLines(lines) {
  return lines.map((line, index) => {
    const y = 386 + (index * 38);
    return `<text x="88" y="${y}" fill="#4C5568" font-size="30" font-weight="400" font-family="Segoe UI, Arial, sans-serif">${escapeXml(line)}</text>`;
  }).join('\n');
}

function renderTags(tags, palette) {
  let x = 88;
  const y = 500;
  return tags.slice(0, 4).map((tag) => {
    const text = truncateToLength(tag, 20);
    const width = Math.max(104, (text.length * 14) + 34);
    const chip = [
      `<rect x="${x}" y="${y}" width="${width}" height="44" rx="18" fill="${palette.chipFill}" stroke="#DCCDB8"/>`,
      `<text x="${x + 18}" y="${y + 29}" fill="#22304D" font-size="21" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escapeXml(text)}</text>`,
    ].join('\n');
    x += width + 14;
    return chip;
  }).join('\n');
}

function huskyMark(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <path d="M28 31L38 17L44 36L28 31Z" fill="#F1ECE2" fill-opacity="0.92"/>
    <path d="M68 31L58 17L52 36L68 31Z" fill="#F1ECE2" fill-opacity="0.92"/>
    <path d="M48 27C33.6 27 22 38.1 22 51.8C22 65.5 33.6 76 48 76C62.4 76 74 65.5 74 51.8C74 38.1 62.4 27 48 27Z" fill="#E4DED1" fill-opacity="0.98"/>
    <path d="M48 31C38.4 31 29.7 37.2 26 46.4C31 43.3 36.8 41.4 43 41H53C59.2 41.4 65 43.3 70 46.4C66.3 37.2 57.6 31 48 31Z" fill="#FFFFFF" fill-opacity="0.88"/>
    <path d="M31 44C34.4 41.8 38.4 40.6 42.6 40.6H43.5L39.8 57.4L28.3 49.6C28.6 47.4 29.5 45.5 31 44Z" fill="#FFFFFF" fill-opacity="0.9"/>
    <path d="M65 44C61.6 41.8 57.6 40.6 53.4 40.6H52.5L56.2 57.4L67.7 49.6C67.4 47.4 66.5 45.5 65 44Z" fill="#FFFFFF" fill-opacity="0.9"/>
    <path d="M48 44L58 59.2L52.2 68H43.8L38 59.2L48 44Z" fill="#F7F5EF"/>
    <circle cx="39.5" cy="51" r="3" fill="#19213A"/>
    <circle cx="56.5" cy="51" r="3" fill="#19213A"/>
    <path d="M42.8 61.4C45.6 59.3 50.4 59.3 53.2 61.4L48 66.4L42.8 61.4Z" fill="#19213A"/>
    <path d="M40.8 68.2C43 70.1 45.4 71 48 71C50.6 71 53 70.1 55.2 68.2" stroke="#19213A" stroke-width="2.8" stroke-linecap="round"/>
  </g>`;
}

function createCardSvg({ eyebrow, title, body, tags, slug, sectionLabel }) {
  const palette = paletteFor(slug);
  const titleLines = wrapText(title, 22, 2);
  const bodyLines = wrapText(body, 46, 3);
  const safeTags = tags.length > 0 ? tags : ['Andrea Bozzo'];

  return `<!-- Generated by scripts/generate-og-images.mjs -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="42" fill="#F5EFE2"/>
  <rect x="28" y="28" width="1144" height="574" rx="34" fill="#FFF9EF" stroke="#E0D0B4" stroke-width="2"/>
  <rect x="${PANEL_X}" y="56" width="320" height="518" rx="30" fill="${palette.panel}"/>
  <circle cx="982" cy="210" r="114" fill="${palette.accent}" fill-opacity="0.18"/>
  <path d="M0 0H340V160C278 188 242 246 222 320C204 384 174 446 118 498H0V0Z" transform="translate(822 56)" fill="${palette.accent}" fill-opacity="0.16"/>
  ${huskyMark(882, 124, 2.5)}
  <text x="88" y="112" fill="${palette.panel}" font-size="22" font-weight="700" font-family="Segoe UI, Arial, sans-serif" letter-spacing="4">${escapeXml(eyebrow.toUpperCase())}</text>
  ${renderTitleLines(titleLines)}
  ${renderBodyLines(bodyLines)}
  ${renderTags(safeTags, palette)}
  <text x="88" y="570" fill="#6A7284" font-size="22" font-weight="500" font-family="Segoe UI, Arial, sans-serif">andreabozzo.github.io/AndreaBozzo</text>
  <text x="860" y="458" fill="${palette.ink}" font-size="20" font-weight="700" font-family="Segoe UI, Arial, sans-serif" letter-spacing="3">${escapeXml(sectionLabel.toUpperCase())}</text>
  <text x="860" y="494" fill="${palette.ink}" font-size="34" font-weight="700" font-family="Segoe UI, Arial, sans-serif">Andrea</text>
  <text x="860" y="532" fill="${palette.ink}" font-size="34" font-weight="700" font-family="Segoe UI, Arial, sans-serif">Bozzo</text>
</svg>`;
}

function writeCard(outputDir, fileBaseName, card) {
  const svgPath = join(outputDir, `${fileBaseName}.svg`);
  const pngPath = join(outputDir, `${fileBaseName}.png`);
  const svg = createCardSvg(card);

  writeFileSync(svgPath, svg);
  const png = new Resvg(svg).render().asPng();
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