import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STATUS = {
	ok: '[ok]',
	warn: '[warn]',
	fail: '[fail]',
};

const checks = [
	{
		name: 'git',
		required: true,
		command: 'git',
		args: ['--version'],
		description: 'required for clone and submodules',
	},
	{
		name: 'node',
		required: true,
		command: process.execPath,
		args: ['--version'],
		minimum: [22, 0, 0],
		description: 'required for asset scripts',
		parseVersion: parseSemver,
	},
	{
		name: 'npm',
		required: true,
		command: process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm',
		args: process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd --version'] : ['--version'],
		minimum: [10, 0, 0],
		description: 'required for package scripts',
		parseVersion: parseSemver,
	},
	{
		name: 'go',
		required: true,
		command: 'go',
		args: ['version'],
		minimum: [1, 22, 0],
		description: 'required for the harvester and companion API',
		parseVersion: parseGoVersion,
	},
	{
		name: 'hugo',
		required: true,
		command: 'hugo',
		args: ['version'],
		minimum: [0, 146, 0],
		description: 'required for blog and full-site builds',
		parseVersion: parseHugoVersion,
		validate(output) {
			return output.toLowerCase().includes('extended')
				? null
				: 'install the extended Hugo build';
		},
	},
	{
		name: 'cargo',
		required: false,
		command: 'cargo',
		args: ['--version'],
		description: 'needed for Rust/WASM workbench changes',
		parseVersion: parseSemver,
	},
	{
		name: 'bash',
		required: false,
		command: 'bash',
		args: ['--version'],
		description: 'used by build-wasm.sh and assemble-site.sh',
	},
];

const repoChecks = [
	{
		name: 'PaperMod submodule',
		required: true,
		ok: existsSync(path.join(rootDir, 'blog', 'themes', 'PaperMod')),
		description: 'run git submodule update --init --recursive if missing',
	},
	{
		name: 'node_modules',
		required: false,
		ok: existsSync(path.join(rootDir, 'node_modules')),
		description: 'run npm install before linting or building assets',
	},
];

let hasFailure = false;

console.log('Repository doctor\n');

for (const check of checks) {
	const result = runToolCheck(check);
	printResult(result);
	if (result.status === STATUS.fail) {
		hasFailure = true;
	}
}

console.log('\nWorkspace checks');
for (const check of repoChecks) {
	const status = check.ok ? STATUS.ok : check.required ? STATUS.fail : STATUS.warn;
	console.log(`${status} ${check.name}: ${check.description}`);
	if (status === STATUS.fail) {
		hasFailure = true;
	}
}

console.log('');
if (hasFailure) {
	console.error('Doctor found blocking setup issues. Fix the [fail] lines and rerun npm run doctor.');
	process.exitCode = 1;
	console.error('');
} else {
	console.log('Doctor completed successfully.');
}

function runToolCheck(check) {
	let output;
	try {
		output = execFileSync(check.command, check.args, {
			cwd: rootDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	} catch {
		return {
			status: check.required ? STATUS.fail : STATUS.warn,
			name: check.name,
			message: `${check.description}; missing from PATH`,
		};
	}

	const parsedVersion = check.parseVersion?.(output);
	if (check.minimum && parsedVersion && compareVersions(parsedVersion, check.minimum) < 0) {
		return {
			status: check.required ? STATUS.fail : STATUS.warn,
			name: check.name,
			message: `${output} is below ${formatVersion(check.minimum)}; ${check.description}`,
		};
		}

	const validationMessage = check.validate?.(output);
	if (validationMessage) {
		return {
			status: check.required ? STATUS.fail : STATUS.warn,
			name: check.name,
			message: `${output}; ${validationMessage}`,
		};
	}

	return {
		status: STATUS.ok,
		name: check.name,
		message: output || check.description,
	};
}

function printResult(result) {
	console.log(`${result.status} ${result.name}: ${result.message}`);
}

function parseSemver(output) {
	const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		return null;
	}
	return match.slice(1).map(Number);
}

function parseGoVersion(output) {
	const match = output.match(/go(\d+)\.(\d+)(?:\.(\d+))?/i);
	if (!match) {
		return null;
	}
	return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function parseHugoVersion(output) {
	const match = output.match(/v(\d+)\.(\d+)\.(\d+)/i);
	if (!match) {
		return parseSemver(output);
	}
	return match.slice(1).map(Number);
}

function compareVersions(left, right) {
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const leftPart = left[index] ?? 0;
		const rightPart = right[index] ?? 0;
		if (leftPart === rightPart) {
			continue;
		}
		return leftPart - rightPart;
	}
	return 0;
}

function formatVersion(parts) {
	return parts.join('.');
}

