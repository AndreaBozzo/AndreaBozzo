import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Figures for the "I tried to put data quality inside the commit" post.
//
// Unlike the Nephtys and Zerobus posts, these three are not drawn here: they were
// composed externally and this script only normalises them (1600x900, webp q92) into
// blog/static/images/. It exists so the encode is reproducible and so the provenance of
// every number on the figures is written down next to them.
//
// Each value shown in the artwork came from running the experiment in
// c:\dev\commit-barrier-spike on 2026-09-04, against iceberg 0.10.1 and
// deltalake-core 0.32.4:
//
//   "7 passed · 1 ignored"            cargo test
//   "0 / 40 rounds entered a real     cargo test iceberg_race_diagnostic_how_often_does_it_conflict
//    optimistic conflict"             -- --nocapture
//   "stale writer appended a second   cargo test -- --ignored  (the assert message, verbatim,
//    copy of epoch 1"                 tests/sinks.rs:289)
//   "10 rows where 5 were expected"   the same assert: left: 10, right: 5
//   "do_commit() reloads and rebases  iceberg 0.10.1, src/transaction/mod.rs:218-226 — the
//    the first attempt too"           reload happens before any action is applied
//   "commit.retry.num-retries = 0     confirmed by upstream-repro/, which sets it and still
//    ... does not remove the rebase"  reproduces the duplicate
//   "appId + epoch travel inside      Delta protocol, txn action: appId (String),
//    the commit"                      version (Long)
//
// Sources live outside the repo (they are 1672x941 originals). Point SOURCE_DIR at them
// and re-run only if the artwork itself changes; the committed webp files are the
// deliverable.

const SOURCE_DIR = process.env.COMMIT_BARRIER_SOURCE_DIR ?? 'C:/Users/andre/Downloads';

const figures = [
  ['ChatGPT Image 4 set 2026, 16_26_11 (1).png', 'commit-barrier-cover.webp'],
  ['ChatGPT Image 4 set 2026, 16_26_12 (2).png', 'commit-barrier-delta-vs-iceberg.webp'],
  ['ChatGPT Image 4 set 2026, 16_26_12 (3).png', 'commit-barrier-false-pass.webp'],
];

const outDir = new URL('../blog/static/images/', import.meta.url);
const outPath = fileURLToPath(outDir);

// 1600 is MAX_DIM_LARGE in optimize-raster.mjs, so these arrive already at the size that
// script would cap them to. Lossless webp is ~868 KB per figure for this artwork, which is
// not worth it against 124 KB at q92 on flat dark panels.
await mkdir(outDir, {recursive: true});
for (const [src, out] of figures) {
  await sharp(join(SOURCE_DIR, src))
    .resize(1600, 900, {fit: 'inside'})
    .webp({quality: 92, effort: 6, smartSubsample: true})
    .toFile(join(outPath, out));
  console.log(`wrote ${out}`);
}
