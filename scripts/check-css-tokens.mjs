import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const stylesDir = path.join(process.cwd(), 'assets', 'styles');
const colorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|(?<![-\w])(?:black|white)(?![-\w])/g;
const tokenFile = 'foundation.css';

async function cssFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return cssFiles(entryPath);
        if (!entry.name.endsWith('.css') || entry.name.endsWith('.min.css')) return [];
        return [entryPath];
    }));

    return files.flat();
}

const violations = [];

for (const file of await cssFiles(stylesDir)) {
    if (path.basename(file) === tokenFile) continue;

    const source = await readFile(file, 'utf8');
    source.split('\n').forEach((line, index) => {
        const matches = line.match(colorLiteralPattern);
        if (!matches) return;

        for (const match of matches) {
            violations.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${match}`);
        }
    });
}

if (violations.length > 0) {
    console.error('Color literals belong in assets/styles/foundation.css tokens:');
    console.error(violations.join('\n'));
    process.exit(1);
}
