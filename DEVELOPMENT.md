# Development

This repository publishes two public surfaces through one GitHub Pages deployment:

- the root landing page from [index.html](index.html) and [assets](assets)
- the Hugo blog from [blog](blog)

The deploy workflow builds the blog, copies the root landing page assets, and publishes the merged result.

## Prerequisites

- Git with submodule support
- Hugo extended `0.146.0`
- Python 3 if you want a quick local static server for the root page

## Clone The Repository

```bash
git clone --recursive https://github.com/AndreaBozzo/AndreaBozzo.git
cd AndreaBozzo
git submodule update --init --recursive
```

The PaperMod theme is tracked as a submodule under [blog/themes/PaperMod](blog/themes/PaperMod).

## Work On The Blog

Start the local Hugo server:

```bash
cd blog
hugo server -D -F
```

Useful commands:

```bash
hugo --minify -F --config hugo.toml,hugo.github.toml
```

Use that build command before merging changes that affect blog rendering, metadata, or deploy paths.

## Work On The Root Landing Page

Serve the repository root with any static file server. A minimal option is:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

Notes:

- the landing page is plain HTML, CSS, and JavaScript
- the homepage blog preview currently fetches JSON from the published `/AndreaBozzo/blog/` path
- local landing-page preview is therefore reliable for layout, copy, and static asset work, but not a full offline integration test of the blog cards

## Deployment Model

The canonical public URLs are:

- landing page: `https://andreabozzo.github.io/AndreaBozzo/`
- blog: `https://andreabozzo.github.io/AndreaBozzo/blog/`

Publishing is handled by [pages.yml](.github/workflows/pages.yml):

1. check out the repository and submodules
2. build the blog with Hugo
3. copy the root landing page into `_site/`
4. copy the built blog into `_site/blog/`
5. deploy `_site/` to GitHub Pages

The blog base URL is supplied by the config override in [blog/hugo.github.toml](blog/hugo.github.toml), keeping deploy-specific paths out of the workflow command.

## Editing Guidance

- keep the root landing page and blog concerns separate
- avoid changing generated output unless the workflow requires it
- prefer source edits in [assets/main.js](assets/main.js) and [assets/styles.css](assets/styles.css) over editing generated variants directly
- document any deploy-path changes in both [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md)