# Development

The personal site is static HTML and one CSS file. Hugo owns the bilingual blog.
A small Node build combines them in `_site/`. No frontend framework, bundler,
WASM compiler, browser API, or JavaScript runtime is required by the personal pages.

## Preview

Install Node.js 22+, Hugo extended (CI uses 0.146.0), and the PaperMod submodule:

```sh
git submodule update --init --recursive
npm ci
npm run build:site
npm run preview
```

Open http://127.0.0.1:4173. The homepage build uses only Node's standard library;
installed dependencies support browser tests and optional blog artwork tools.
Always preview `_site/`, where the blog and personal pages share their final paths.

`npm run clean` removes ignored build output, local research/harvester caches, and
test artifacts. It refuses tracked content and linked directories. It preserves
source files, dependencies, environment files, and account configuration.

## Where to edit

- `scripts/homepage.mjs`: homepage copy in English and Italian, selected projects, and layout.
- `scripts/site-template.mjs`: shared document metadata and page chrome.
- `assets/styles.css`: all personal-site styling, including mobile and print.
- `content/projects.json`: project notes, translations, and related links.
- `scripts/build-site.mjs`: generates home/project pages, copies referenced images, assembles Hugo, and writes sitemaps.
- `blog/`: unchanged Hugo content, layouts, and PaperMod theme.

HTML is generated only in `_site/`, never committed. Project URLs stay at
`work/<slug>/` and `it/work/<slug>/`. The three newest articles in each language
come from Hugo's own search index during the build. No duplicate writing index.
The existing Hugo `-F` publishing behavior is preserved.

```sh
npm run test:smoke  # builds, serves, and checks the complete site in Chromium
```

The browser checks cover no-JavaScript browsing, mobile layout, project and blog
links, language switching, a GitHub Pages subpath, and old service-worker retirement.
Install Chromium once with `npx playwright install chromium`.

## Blog and README tooling

Use `hugo server -D -F` inside `blog/` while writing. `npm run generate:og`
regenerates blog social cards; `scripts/optimize-raster.mjs` is an optional image
utility. Neither runs during normal site builds. Existing blog artwork is retained.

The Go README contribution updater remains independent of the website:

```sh
npm run test:go
npm run harvester:readme
```

The scheduled README workflow updates only the README. GitHub metrics automation
is unchanged. Go is not needed to build or publish the website.

## Deployment

GitHub Actions installs Node and Hugo, builds once, runs browser checks against
`_site/`, and uploads that directory to Pages. The production base URL remains
`https://andreabozzo.github.io/AndreaBozzo/`.

`sw.js` is deliberately retained as a retirement worker for existing visitors.
It unregisters itself and removes only old `andreabozzo-v<number>` caches.
New pages never register a worker. Keep the URL available for returning visitors.
