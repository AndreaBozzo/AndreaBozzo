import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const readmePath = path.join(repoRoot, 'README.md');
const outputDir = path.join(repoRoot, 'assets', 'data');
const outputPath = path.join(outputDir, 'contributions.json');

const CONTRIBUTION_DESCRIPTIONS = {
  'apache/arrow-rs': 'Rust-side work in the Arrow ecosystem around columnar data and query plumbing.',
  'apache/datafusion': 'Query engine fixes and improvements in the Arrow-native SQL execution stack.',
  'apache/fluss-rust': 'Client and integration work in the Fluss streaming ecosystem.',
  'apache/iceberg-rust': 'Rust contributions around Apache Iceberg tables, metadata, and interoperability.',
  'beelzebub-labs/beelzebub': 'Infrastructure-facing fixes and implementation work in a production-oriented platform project.',
  'cortexflow/cortexbrain': 'Implementation work across infrastructure and automation-oriented platform tooling.',
  'datapizza-labs/datapizza-ai': 'Applied AI engineering work across product integrations and developer-facing features.',
  'informagico/fantavibe': 'Targeted upstream fixes and improvements in a smaller community project.',
  'italia-opensource/awesome-italia-opensource': 'Curation and contribution work supporting the Italian open source ecosystem.',
  'lakekeeper/lakekeeper': 'Lakehouse catalog and metadata contributions around operational reliability.',
  'lance-format/lance': 'Columnar storage and vector-data work in the Lance ecosystem.',
  'mosaico-labs/mosaico': 'Contributions across AI workflow orchestration and open tooling.',
  'pganalyze/pg_query.rs': 'Rust and Postgres parsing work in a low-level developer tooling library.',
  'piopy/fantacalcio-py': 'Small but concrete fixes in a Python project with an active user base.',
  'pola-rs/polars': 'Rust-native analytics work across DataFrame performance, ergonomics, and engine behavior.',
  'risingwavelabs/risingwave': 'Streaming database contributions across query behavior, engine details, and developer workflow.',
  'rust-ita/rust-docs-it': 'Community translation and upkeep work for Italian Rust documentation.',
  'supabase/etl': 'Data ingestion and transformation contributions in a production-facing ETL stack.',
  'tokio-rs/axum': 'Web framework contributions around routing, ergonomics, and service integration in Rust.',
  'tokio-rs/tokio': 'Async runtime improvements around Rust concurrency, scheduling, and developer ergonomics.',
  'vakamo-labs/openfga-client': 'Client-library fixes and interface improvements around authorization tooling.'
};

function parseCompactNumber(value) {
  if (!value) return 0;

  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('k')) {
    return Math.round(parseFloat(normalized.slice(0, -1)) * 1000);
  }

  return parseFloat(normalized) || 0;
}

function extractContributionMetrics(badgeSource) {
  const withoutStyle = badgeSource.replace(/-informational.*$/, '');
  const metricsSegment = withoutStyle.split('-').pop() || '';
  const [starsPart = '', prsPart = ''] = metricsSegment.split('|').map((part) => part.trim());

  return {
    stars: starsPart.replace(/^⭐\s*/, '') || '0',
    prs: prsPart.replace(/\s*PR$/, '') || '0'
  };
}

function getRepositoryKey(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
    }
  } catch {
    return '';
  }

  return '';
}

function getContributionDescription(url, name) {
  const repositoryKey = getRepositoryKey(url);

  if (repositoryKey && CONTRIBUTION_DESCRIPTIONS[repositoryKey]) {
    return CONTRIBUTION_DESCRIPTIONS[repositoryKey];
  }

  return `${name} is one of the upstream projects where I have shipped fixes, cleanup, or implementation work.`;
}

async function main() {
  const readme = await readFile(readmePath, 'utf8');
  const startMarker = '<!-- EXTERNAL_CONTRIBUTIONS:START -->';
  const endMarker = '<!-- EXTERNAL_CONTRIBUTIONS:END -->';
  const startIndex = readme.indexOf(startMarker);
  const endIndex = readme.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Contribution markers not found in README.md');
  }

  const block = readme.slice(startIndex + startMarker.length, endIndex);
  const badgeRegex = /<a href="([^"]+)"><img src="([^"]+)"[^>]*alt="([^"]+)"\/?><\/a>/g;
  const items = [];

  for (const match of block.matchAll(badgeRegex)) {
    const [, url, src, name] = match;
    const badgeSource = decodeURIComponent(src.split('/').pop() || '');
    const { stars, prs } = extractContributionMetrics(badgeSource);

    items.push({
      name,
      url,
      stars,
      prs,
      desc: getContributionDescription(url, name)
    });
  }

  if (items.length === 0) {
    throw new Error('No contributions could be parsed from README.md');
  }

  const sortedItems = items
    .sort((left, right) => parseCompactNumber(right.stars) - parseCompactNumber(left.stars))
    .slice(0, 4);

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'README.md#EXTERNAL_CONTRIBUTIONS',
        items: sortedItems
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});