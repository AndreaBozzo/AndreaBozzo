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
