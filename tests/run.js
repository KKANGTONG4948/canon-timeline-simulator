// Runs every *.test.js in this folder: node tests/run.js
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
let failed = 0;
for (const f of files) {
    try {
        execFileSync(process.execPath, [path.join(dir, f)], { stdio: 'pipe', timeout: 120000 });
        console.log(`ok    ${f}`);
    } catch (err) {
        failed++;
        console.log(`FAIL  ${f}\n${String(err.stdout || '')}${String(err.stderr || '').split('\n').slice(0, 12).join('\n')}`);
    }
}
console.log(`\n${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
