import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const info = { version: '0.2.0-m3', commit };
writeFileSync(new URL('../dist/version.json', import.meta.url), `${JSON.stringify(info, null, 2)}\n`);
console.log('dist/version.json', info.version, info.commit);
