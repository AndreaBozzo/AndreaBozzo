import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { document, escape, origin, windowBar } from './site-template.mjs';
import { homepage } from './homepage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '_site');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const studies = json('content/projects.json');
const write = (path, content) => {
  const target = resolve(output, path);
  if (!target.startsWith(output + sep)) throw new Error(`Unsafe output: ${path}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};

// Hugo owns the blog and its search index. Reuse that index instead of maintaining
// a second parser, network harvester, or browser-side blog fetcher.
const hugo = spawnSync('hugo', ['--minify', '-F', '--cleanDestinationDir', '--config', 'hugo.toml,hugo.github.toml'], { cwd: resolve(root, 'blog'), stdio: 'inherit' });
if (hugo.error) throw new Error(`Hugo is required to build the blog: ${hugo.error.message}`);
if (hugo.status !== 0) process.exit(hugo.status || 1);

// This fixed, resolved directory is the only tree the build removes.
if (output !== resolve(root, '_site')) throw new Error('Unexpected output directory');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(resolve(root, 'blog/public'), resolve(output, 'blog'), { recursive: true });
for (const file of ['assets/styles.css', 'assets/images/og/homepage.png', 'favicon.svg', 'sw.js']) {
  mkdirSync(dirname(resolve(output, file)), { recursive: true });
  cpSync(resolve(root, file), resolve(output, file));
}

function localUrl(url, lang, prefix) {
  if (/^https?:|^mailto:/.test(url)) return url;
  const path = url.replace(/^(\.\.\/)+/, '');
  if (path.startsWith('blog/')) return prefix + (lang === 'it' ? path.replace('blog/en/', 'blog/') : path);
  if (path.startsWith('work/')) return prefix + (lang === 'it' ? 'it/' : '') + path;
  return prefix + path;
}

function copyImage(url) {
  const path = url.replace(/^(\.\.\/)+/, '');
  if (path.startsWith('blog/images/') && !path.includes('..')) {
    if (!existsSync(resolve(output, path))) throw new Error(`Missing blog image: ${path}`);
    return;
  }
  if (!path.startsWith('assets/images/') || path.includes('..')) throw new Error(`Invalid image path: ${url}`);
  if (!existsSync(resolve(root, path))) throw new Error(`Missing project image: ${path}`);
  mkdirSync(dirname(resolve(output, path)), { recursive: true });
  cpSync(resolve(root, path), resolve(output, path));
}

const urls = [];
for (const lang of ['en', 'it']) {
  const prefix = lang === 'it' ? 'it/' : '';
  const posts = json(`blog/public/${lang === 'en' ? 'en/' : ''}index.json`)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(post => ({ title: post.title, date: post.date, slug: new URL(post.permalink).pathname.split('/').filter(Boolean).at(-1) }));
  write(`${prefix}index.html`, homepage(lang, studies, posts));
  urls.push(prefix);

  for (const study of studies) {
    if (!/^[a-z0-9-]+$/.test(study.slug)) throw new Error(`Invalid project slug: ${study.slug}`);
    if (!study.translations?.it?.sections) throw new Error(`Missing Italian content: ${study.slug}`);
    const s = lang === 'it' ? { ...study, ...study.translations.it } : study;
    const path = `${prefix}work/${study.slug}/`;
    const back = lang === 'it' ? 'Tutti i progetti' : 'All projects';
    const rootLink = lang === 'it' ? '../../../' : '../../';
    const actions = (s.actions || []).map(a => `<a href="${escape(localUrl(a.url, lang, rootLink))}">${escape(a.label)} ↗</a>`).join('');
    const media = (s.mediaSlots || []).filter(m => m.image);
    const images = media.length ? media : s.coverImage ? [{ image: s.coverImage, alt: s.coverAlt, caption: s.coverText }] : [];
    for (const m of images) copyImage(m.image);
    const body = `<main id="main" class="project-page">
      <p><a href="../../#workbench">← ${back}</a></p>
      <article class="window">${windowBar(`projects / ${escape(study.slug)}`)}<div class="panel-content">
        <p class="eyebrow">${escape(s.stack.join(' · '))}</p><h1>${escape(s.displayTitle || s.title)}</h1>
        <p class="lead">${escape(s.subtitle)}</p><p>${escape(s.summary)}</p>
        ${s.reviewedAt ? `<p class="section-intro">${lang === 'it' ? 'Aggiornato da fonti pubbliche' : 'Updated from public sources'} · <time datetime="${escape(s.reviewedAt)}">${escape(s.reviewedAt)}</time></p>` : ''}
        <nav class="project-actions" aria-label="${lang === 'it' ? 'Link del progetto' : 'Project links'}">${actions}</nav>
        ${s.sections.map(section => `<section><h2>${escape(section.heading)}</h2><p>${escape(section.body)}</p></section>`).join('\n')}
        ${images.map(m => `<figure><img loading="lazy" src="${escape(localUrl(m.image, lang, rootLink))}" alt="${escape(m.alt)}"><figcaption>${escape(m.caption)}</figcaption></figure>`).join('\n')}
      </div></article>
    </main>`;
    write(`${path}index.html`, document({ lang, path, title: s.displayTitle || s.title, description: s.metaDescription || s.subtitle, root: rootLink, body }));
    urls.push(path);
  }
}

write('pages-sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}pages-sitemap.xml</loc></sitemap><sitemap><loc>${origin}blog/sitemap.xml</loc></sitemap></sitemapindex>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}sitemap.xml\n`);
console.log(`Built ${urls.length} personal-site pages + the Hugo blog in _site/.`);
