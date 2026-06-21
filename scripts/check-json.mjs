import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const roots = [
	'assets/data',
	'schema',
];

const standaloneFiles = [
	'manifest.json',
	'package.json',
];

const discoveredFiles = await Promise.all(roots.map((directory) => collectJsonFiles(path.join(rootDir, directory))));
const targets = [...standaloneFiles.map((filePath) => path.join(rootDir, filePath)), ...discoveredFiles.flat()]
	.map((filePath) => path.normalize(filePath))
	.sort((left, right) => left.localeCompare(right));

let hasFailure = false;

for (const filePath of targets) {
	const relativePath = path.relative(rootDir, filePath).replaceAll('\\', '/');
	try {
		const raw = await readFile(filePath, 'utf8');
		JSON.parse(raw);
		console.log(`${relativePath} valid`);
	} catch (error) {
		hasFailure = true;
		console.error(`${relativePath} invalid`);
		console.error(`  ${error.message}`);
	}
}

if (hasFailure) {
	process.exitCode = 1;
}

async function collectJsonFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await collectJsonFiles(fullPath));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith('.json')) {
			files.push(fullPath);
		}
	}

	return files;
}