import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const caseStudiesPath = path.join(repoRoot, 'assets', 'data', 'case-studies.json');
const workDir = path.join(repoRoot, 'work');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (match) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[match]));
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url);
}

function resolveCoverImagePath(coverImage) {
  if (!coverImage) {
    return '';
  }

  if (isExternalUrl(coverImage) || coverImage.startsWith('../../')) {
    return coverImage;
  }

  if (coverImage.startsWith('../blog/')) {
    return `../${coverImage}`;
  }

  if (coverImage.startsWith('blog/')) {
    return `../../${coverImage}`;
  }

  return coverImage;
}

function resolveActions(study) {
  if (Array.isArray(study.actions) && study.actions.length > 0) {
    return study.actions;
  }

  const actions = [];
  if (study.repoUrl) {
    actions.push({ label: 'Repository', url: study.repoUrl, style: 'primary' });
  }

  if (Array.isArray(study.relatedPosts) && study.relatedPosts.length > 0) {
    actions.push({
      label: 'Related article',
      url: `../../blog/en/posts/${study.relatedPosts[0]}/`,
      style: actions.length === 0 ? 'primary' : 'secondary'
    });
  }

  return actions;
}

function renderActions(study) {
  return resolveActions(study)
    .map((action, index) => {
      const style = action.style === 'secondary' ? 'secondary' : (index === 0 ? 'primary' : 'secondary');
      const target = isExternalUrl(action.url) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `                <a class="btn btn-${style}" href="${escapeHtml(action.url)}"${target}>${escapeHtml(action.label || 'Open')}</a>`;
    })
    .join('\n');
}

function renderMediaSlots(study) {
  const slots = Array.isArray(study.mediaSlots) ? study.mediaSlots : [];
  if (slots.length === 0) {
    return '';
  }

  return `
                <div class="media-slots">
${slots.map((slot) => `                    <article class="media-slot">
                        <span>${escapeHtml(slot.label || 'Placeholder')}</span>
                        <p>${escapeHtml(slot.placeholder || '')}</p>
                    </article>`).join('\n')}
                </div>`;
}

function renderSections(study) {
  const sections = Array.isArray(study.sections) ? study.sections : [];
  return sections
    .map((section) => `                <h2>${escapeHtml(section.heading || 'Section')}</h2>
                <p>${escapeHtml(section.body || '')}</p>`)
    .join('\n\n');
}

function renderCover(study) {
  const coverImage = resolveCoverImagePath(study.coverImage);

  if (coverImage) {
    return `            <figure class="case-cover">
                <img src="${escapeHtml(coverImage)}" alt="${escapeHtml(study.coverAlt || `${study.title || study.slug || 'Case study'} cover art`)}">
            </figure>`;
  }

  return `            <figure class="case-cover case-cover-placeholder">
                <div>
                    <span class="case-cover-eyebrow">${escapeHtml(study.coverEyebrow || study.status || 'Case study')}</span>
                    <strong>${escapeHtml(study.coverTitle || study.title || study.slug || 'Case study')}</strong>
                    <p>${escapeHtml(study.coverText || study.summary || study.subtitle || '')}</p>
                </div>
            </figure>`;
}

function renderCaseStudyPage(study) {
  const title = study.title || study.slug || 'Case Study';
  const metaDescription = study.metaDescription || study.summary || study.subtitle || `${title} case study.`;
  const stack = Array.isArray(study.stack) ? study.stack : [];
  const statusChip = study.status ? `                    <span class="case-meta-status">${escapeHtml(study.status)}</span>\n` : '';
  const actions = renderActions(study);
  const mediaSlots = renderMediaSlots(study);
  const sections = renderSections(study);

  return `<!-- Generated from assets/data/case-studies.json by scripts/generate-case-study-pages.mjs. Do not edit directly. -->
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${escapeHtml(title)} | Andrea Bozzo</title>
    <meta name="description" content="${escapeHtml(metaDescription)}">
    <meta name="theme-color" content="#f5efe2">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../../assets/styles.min.css">
    <script>
        (function() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
        })();
    </script>
</head>
<body>
    <header class="site-header">
        <a href="../../#home" class="site-brand">AB</a>
        <nav class="site-nav" aria-label="Primary navigation">
            <a href="../../#workbench">Work</a>
            <a href="../../blog/">Blog</a>
            <a href="../../#projects">Open Source</a>
        <a href="../../#papers">Papers</a>
            <a href="../../#contact">Contact</a>
        </nav>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle color theme">
            <span class="theme-toggle-icon" id="theme-icon">☀️</span>
        </button>
    </header>

    <main class="content-wrapper case-study-page">
        <section class="case-hero">
            <div class="case-hero-copy">
                <p class="eyebrow">Case Study</p>
                <h1 class="title">${escapeHtml(title)}</h1>
                <p class="subtitle">${escapeHtml(study.subtitle || study.summary || '')}</p>
                <div class="case-meta">
        ${statusChip}${stack.map((item) => `                    <span>${escapeHtml(item)}</span>`).join('\n')}
                </div>
            </div>
${renderCover(study)}
        </section>

        <section class="case-layout">
            <article class="case-main">
${sections}
            </article>

            <aside class="case-aside">
${actions}
${mediaSlots}
            </aside>
        </section>
    </main>

    <script src="../../assets/main.min.js" defer></script>
</body>
</html>
`;
}

async function removeStaleDirectories(validSlugs) {
  const entries = await readdir(workDir, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) {
      return;
    }

    if (!validSlugs.has(entry.name)) {
      await rm(path.join(workDir, entry.name), { recursive: true, force: true });
    }
  }));
}

async function main() {
  const payload = JSON.parse(await readFile(caseStudiesPath, 'utf8'));
  const items = Array.isArray(payload.items) ? payload.items : [];

  await mkdir(workDir, { recursive: true });
  await removeStaleDirectories(new Set(items.map((item) => item.slug).filter(Boolean)));

  await Promise.all(items.map(async (study) => {
    const slug = study.slug;
    if (!slug) {
      throw new Error('Every case study must define a slug');
    }

    const outputDir = path.join(workDir, slug);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'index.html'), renderCaseStudyPage(study), 'utf8');
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});