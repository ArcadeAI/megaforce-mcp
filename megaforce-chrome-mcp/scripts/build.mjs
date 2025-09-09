import { mkdir, cp, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname.replace(/\/scripts$/, '');
const dist = `${root}/dist`;

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await cp(`${root}/manifest.json`, `${dist}/manifest.json`);
  await cp(`${root}/background.js`, `${dist}/background.js`);
  await cp(`${root}/sidepanel`, `${dist}/sidepanel`, { recursive: true });
  await cp(`${root}/images`, `${dist}/images`, { recursive: true });
  await cp(`${root}/scripts`, `${dist}/scripts`, { recursive: true });
  console.log('Built to dist');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


