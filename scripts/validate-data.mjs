import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const contractPairs = [
	['schema/writing.schema.json', 'assets/data/writing.json'],
	['schema/packages.schema.json', 'assets/data/packages.json'],
	['schema/ci-runtimes.schema.json', 'assets/data/ci-runtimes.json'],
	['schema/contributions.schema.json', 'assets/data/contributions.json'],
	['schema/repo-metadata.schema.json', 'assets/data/repo-metadata.json'],
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let hasFailure = false;

for (const [schemaPath, dataPath] of contractPairs) {
	const [schemaRaw, dataRaw] = await Promise.all([
		readFile(path.join(rootDir, schemaPath), 'utf8'),
		readFile(path.join(rootDir, dataPath), 'utf8'),
	]);

	const schema = JSON.parse(schemaRaw);
	const data = JSON.parse(dataRaw);
	const validate = ajv.compile(schema);
	const valid = validate(data);

	if (valid) {
		console.log(`${dataPath} valid`);
		continue;
	}

	hasFailure = true;
	console.error(`${dataPath} invalid`);
	for (const error of validate.errors ?? []) {
		const location = error.instancePath || '/';
		console.error(`  ${location}: ${error.message}`);
	}
}

if (hasFailure) {
	process.exitCode = 1;
}