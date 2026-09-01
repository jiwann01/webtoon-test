import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public');
const items = ['index.html', 'styles.css', 'assets', 'episodes', 'vendor', 'works'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const item of items) {
  await cp(resolve(root, item), resolve(output, item), { recursive: true });
}

console.log('Created a clean static-site folder: public/');
