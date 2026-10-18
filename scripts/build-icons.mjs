import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { catalog } from '../src/icons/catalog.js';

const source = JSON.parse(await readFile(new URL('../node_modules/@iconify-json/tabler/icons.json', import.meta.url), 'utf8'));
const icons = {};
for (const { id } of catalog) {
  if (!id.startsWith('tabler:')) continue;
  const name = id.split(':')[1];
  const icon = source.icons[name];
  if (!icon) throw new Error(`Missing Tabler icon: ${name}`);
  icons[id] = { width: source.width, height: source.height, ...icon };
}
await writeFile(new URL('../src/icons/data.json', import.meta.url), JSON.stringify(icons));
await mkdir(new URL('../public/licenses/', import.meta.url), { recursive: true });
// Tabler's upstream license is checked in: the data package omits the file.
await readFile(new URL('../public/licenses/tabler.txt', import.meta.url), 'utf8');
await copyFile(new URL('../node_modules/@iconify/react/license.txt', import.meta.url), new URL('../public/licenses/iconify-react.txt', import.meta.url));
console.log(`Bundled ${Object.keys(icons).length} offline activity icons and licenses.`);
