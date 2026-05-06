# Contributing

This repository is my public profile site. It combines a handcrafted landing page at the root with a Hugo blog in [blog](blog), then publishes both through GitHub Pages.

I want the repo to stay readable and transparent, but it is still a personal site rather than a broad community project. The best contributions here are focused fixes, content improvements, and small design or workflow refinements.

## Good Fits For PRs

- typo fixes and broken links
- blog content corrections
- accessibility improvements
- small landing page UX or layout improvements
- workflow and documentation clarifications

For larger visual redesigns or structural changes, open an issue first so we can align on scope.

## Local Setup

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full workflow.

Quick start:

```bash
git clone --recursive https://github.com/AndreaBozzo/AndreaBozzo.git
cd AndreaBozzo
git submodule update --init --recursive
```

### Blog

```bash
cd blog
hugo server -D -F
```

### Root landing page

```bash
cd ..
python3 -m http.server 8000
```

The root page is static. Some homepage data, such as the blog preview cards, still points to the published site, so local landing-page work is best for layout and content changes unless the fetching logic is being changed too.

## Working Style

- keep changes focused and easy to review
- prefer small PRs over mixed changes
- update docs when behavior or workflow changes
- preserve the split between the root landing page and the Hugo blog unless the change is intentional

If you touch deployment or publishing behavior, mention how you validated it.

## Validation

Use the smallest relevant check for your change:

- blog/content/theme changes: run `hugo --minify -F --config hugo.toml,hugo.github.toml` inside [blog](blog)
- landing page changes: serve the repo root locally and verify the affected section in a browser
- workflow or documentation changes: explain the expected deploy or local-development impact in the PR

## Pull Requests

- use a clear title and describe what changed and why
- call out any deploy, path, or content assumptions
- include screenshots for visible landing page changes when practical
- keep generated output out of the PR unless it is intentionally part of the change

Conventional Commits are welcome but not required.

## Contact

- GitHub: https://github.com/AndreaBozzo
- LinkedIn: https://www.linkedin.com/in/andrea-bozzo-/
- Blog: https://andreabozzo.github.io/AndreaBozzo/blog/

If you are unsure whether a change fits this repository, open an issue first.
