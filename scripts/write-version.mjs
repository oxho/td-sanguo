import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const srcLevels = JSON.parse(readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8')).levels;
const shipped = JSON.parse(readFileSync(new URL('../public/data/levels.json', import.meta.url), 'utf8'));
if (JSON.stringify(srcLevels) !== JSON.stringify(shipped)) {
  throw new Error('public/data/levels.json does not match src/data/levels.json levels');
}

const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const info = { version: '0.2.0-m4', commit };
writeFileSync(new URL('../dist/version.json', import.meta.url), `${JSON.stringify(info, null, 2)}\n`);
console.log('dist/version.json', info.version, info.commit);
