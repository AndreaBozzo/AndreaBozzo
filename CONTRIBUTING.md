# Contributing

This is Andrea's personal website and Hugo blog. Focused fixes, content improvements,
and small design refinements are welcome. Keep the site small and readable.

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup and source files.

```sh
npm ci
npm run build:site
npm run test:smoke
```

Edit the homepage in `scripts/homepage.mjs`, shared styling in `assets/styles.css`,
and project notes in `content/projects.json`. Update both English and Italian copy.
Do not edit or commit `_site/`. Blog content and the PaperMod theme stay in `blog/`.

For pull requests, describe the reader-visible change and how it was checked.
Include desktop and mobile screenshots for visual changes. Preserve existing URLs
and keep navigation usable with JavaScript disabled.
