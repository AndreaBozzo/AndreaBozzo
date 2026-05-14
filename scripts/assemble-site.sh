#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

rm -rf _site
mkdir -p _site/blog

cp index.html manifest.json sw.js favicon.svg robots.txt sitemap.xml pages-sitemap.xml _site/
cp -r assets _site/
cp -r work _site/
cp -r blog/public/* _site/blog/

# Localized surfaces (only present once per-locale content has been generated).
# Each top-level locale directory is treated as a parallel /<lang>/ slice of the
# site rooted at the repo root.
for locale_dir in it; do
    if [ -d "$locale_dir" ]; then
        cp -r "$locale_dir" "_site/$locale_dir"
    fi
done
