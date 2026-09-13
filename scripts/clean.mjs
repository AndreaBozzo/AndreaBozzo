// Delete only ignored, untracked build/cache directories inside this repository.
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const generated = ['_site', 'blog/public', 'blog/resources', 'blog/.hugo_build.lock',
  'test-results', 'playwright-report', '.cache', '.harvester-cache', '.vercel/output'];
const targets = [];
for (const name of generated) {
  const target = resolve(root, name);
  if (!existsSync(target)) continue;
  if (lstatSync(target).isSymbolicLink() || !realpathSync(target).startsWith(root + sep)) {
    throw new Error(`Refusing linked or external target: ${name}`);
  }
  const tracked = execFileSync('git', ['ls-files', '--', name], { cwd: root, encoding: 'utf8' });
  if (tracked.trim()) throw new Error(`Refusing tracked content: ${name}`);
  execFileSync('git', ['check-ignore', '-q', '--', name], { cwd: root });
  targets.push([name, target]);
}
// Complete all checks before deleting anything.
for (const [name, target] of targets) {
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${name}`);
}
