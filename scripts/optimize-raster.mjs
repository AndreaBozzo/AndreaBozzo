// Optimize PNG/JPEG raster assets in-place.
// - Resize: caps long edge at MAX_DIM_LARGE for content images, MAX_DIM_LOGO for *-logo.*
// - PNG: re-encode at compressionLevel 9, adaptiveFiltering on, quality 80 effort 8
// - JPEG: quality 82 mozjpeg
// Skips files smaller than MIN_BYTES.

import sharp from 'sharp';
import { readdir, stat, readFile, writeFile, rename } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const MIN_BYTES = 200 * 1024;        // skip < 200 KB
const MAX_DIM_LARGE = 1600;          // content images
const MAX_DIM_LOGO = 800;            // logos
const ROOTS = ['assets/images', 'blog/static/images'];
const SKIP_DIRS = new Set(['og-posts']);  // OG cards are already sized

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

function targetMaxDim(path) {
  const b = basename(path).toLowerCase();
  if (b.includes('-logo.') || b.includes('logo.')) return MAX_DIM_LOGO;
  return MAX_DIM_LARGE;
}

let totalBefore = 0, totalAfter = 0, processed = 0, skipped = 0;
const results = [];

for (const root of ROOTS) {
  for await (const path of walk(root)) {
    const ext = extname(path).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue;
    const st = await stat(path);
    if (st.size < MIN_BYTES) { skipped++; continue; }

    const before = st.size;
    const buf = await readFile(path);
    const maxDim = targetMaxDim(path);
    let img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    const needsResize = (meta.width || 0) > maxDim || (meta.height || 0) > maxDim;
    if (needsResize) {
      img = img.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
    }
    let out;
    if (ext === '.png') {
      out = await img.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 80, effort: 8 }).toBuffer();
    } else {
      out = await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
    if (out.length >= before) {
      skipped++;
      continue;
    }
    const tmp = path + '.opt';
    await writeFile(tmp, out);
    await rename(tmp, path);
    totalBefore += before;
    totalAfter += out.length;
    processed++;
    results.push({ path, before, after: out.length, ratio: out.length / before });
  }
}

results.sort((a, b) => (b.before - b.after) - (a.before - a.after));
for (const r of results.slice(0, 25)) {
  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(`${(r.ratio * 100).toFixed(0).padStart(3)}%  ${mb(r.before).padStart(6)}MB -> ${mb(r.after).padStart(6)}MB  ${r.path}`);
}
console.log('---');
console.log(`Processed: ${processed}  Skipped: ${skipped}`);
console.log(`Total: ${(totalBefore / 1024 / 1024).toFixed(1)} MB -> ${(totalAfter / 1024 / 1024).toFixed(1)} MB  (saved ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(1)} MB, ${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
