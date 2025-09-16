import { mkdir, rm, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

async function main(): Promise<void> {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const result = await Bun.build({
    entrypoints: [
      join(root, 'background.ts'),
      join(root, 'sidepanel', 'index.ts'),
      join(root, 'scripts', 'extract-content.ts'),
    ],
    outdir: dist,
    target: 'browser',
    sourcemap: 'none',
    minify: false,
    naming: '[dir]/[name].js',
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error('Build failed');
  }

  await cp(join(root, 'manifest.json'), join(dist, 'manifest.json'));
  await mkdir(join(dist, 'sidepanel'), { recursive: true });
  await cp(join(root, 'sidepanel', 'index.html'), join(dist, 'sidepanel', 'index.html'));
  await cp(join(root, 'sidepanel', 'index.css'), join(dist, 'sidepanel', 'index.css'));
  await cp(join(root, 'images'), join(dist, 'images'), { recursive: true });

  console.log('Built to dist');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


