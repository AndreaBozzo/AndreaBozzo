import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = path.join(rootDir, '.vercel', 'output', 'functions');

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const results = [];

	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await walk(entryPath)));
			continue;
		}
		results.push(entryPath);
	}

	return results;
}

const files = await walk(functionsDir);
const configPaths = files.filter((filePath) => filePath.endsWith(path.join('.func', '.vc-config.json')));

let materializedCount = 0;

for (const configPath of configPaths) {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const bootstrapMapping = config.filePathMap?.bootstrap;
	if (config.handler !== 'bootstrap' || typeof bootstrapMapping !== 'string') {
		continue;
	}

	const parts = bootstrapMapping.split('/');
	const tmpIndex = parts.indexOf('tmp');
	if (tmpIndex === -1) {
		throw new Error(`Unsupported bootstrap mapping in ${configPath}: ${bootstrapMapping}`);
	}

	const sourcePath = path.join(path.sep, 'tmp', ...parts.slice(tmpIndex + 1));
	const targetPath = path.join(path.dirname(configPath), 'bootstrap');

	await copyFile(sourcePath, targetPath);
	delete config.filePathMap.bootstrap;
	if (Object.keys(config.filePathMap).length === 0) {
		delete config.filePathMap;
	}

	await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
	console.log(`materialized ${path.relative(rootDir, targetPath)} from ${sourcePath}`);
	materializedCount += 1;
	}

if (materializedCount === 0) {
	throw new Error('No Go bootstrap mappings found under .vercel/output/functions');
}

console.log(`materialized ${materializedCount} Go bootstrap file(s)`);