import { execFileSync } from 'node:child_process';
import process from 'node:process';

const [, , subcommand] = process.argv;

if (!subcommand || !['test', 'vet'].includes(subcommand)) {
	console.error('Usage: node ./scripts/run-go-workspace.mjs <test|vet>');
	process.exit(1);
}

const packages = execFileSync('go', ['list', './...'], {
	encoding: 'utf8',
	stdio: ['ignore', 'pipe', 'inherit'],
})
	.split(/\r?\n/)
	.map((line) => line.trim())
	.filter(Boolean)
	.filter((packageName) => !packageName.includes('/node_modules/'));

if (packages.length === 0) {
	console.error('No Go packages found in workspace.');
	process.exit(1);
}

execFileSync('go', [subcommand, ...packages], {
	stdio: 'inherit',
});