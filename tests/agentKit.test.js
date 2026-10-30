import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { importBlueprint, blueprintSchema } from '../src/core/blueprint/index.js';

const kit = fileURLToPath(new URL('../agent-kit/', import.meta.url));
const read = (name) => readFile(path.join(kit, name), 'utf8');
const annotation = (key, value) => ['description', '$comment'].includes(key) && typeof value === 'string';
function withoutAnnotations(value) {
  if (Array.isArray(value)) return value.map(withoutAnnotations);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !annotation(key, item)).map(([key, item]) => [key, withoutAnnotations(item)]));
}

test('published agent kit contains exactly five flat files and every document link resolves inside it', async () => {
  const files = await readdir(kit, { withFileTypes: true });
  assert.ok(files.every((entry) => entry.isFile()));
  assert.deepEqual(files.map((entry) => entry.name).sort(), ['README.md', 'BLUEPRINT_GUIDE.md', 'blueprint.schema.json', 'example.yaml', 'icons.json'].sort());
  for (const entry of files.filter((entry) => entry.name.endsWith('.md'))) {
    for (const [, target] of (await read(entry.name)).matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
      const absolute = path.resolve(kit, decodeURIComponent(target.split(/[?#]/)[0]));
      assert.equal(path.dirname(absolute), path.resolve(kit), `${entry.name}: ${target}`);
      assert.ok((await stat(absolute)).isFile());
    }
  }
});

test('portable schema preserves every validation rule while directing semantic readers to the included guide', async () => {
  const text = await read('blueprint.schema.json'), schema = JSON.parse(text);
  assert.deepEqual(withoutAnnotations(schema), withoutAnnotations(blueprintSchema));
  assert.deepEqual([...new Set([...text.matchAll(/[A-Za-z0-9_./-]+\.md/g)].map(([name]) => name))], ['BLUEPRINT_GUIDE.md']);
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate(parse(await read('example.yaml'))), true, JSON.stringify(validate.errors));
  assert.equal(validate({ project: { unknown_field: true } }), false);
});

test('standalone example and quick-start project compile, and copied catalog/example stay current', async () => {
  const example = await read('example.yaml');
  assert.equal(example, await readFile(new URL('../docs/recipes/examples/life-simulation.yaml', import.meta.url), 'utf8'));
  assert.equal(await read('icons.json'), await readFile(new URL('../src/icons/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(importBlueprint(example).errors, []);
  const quickStart = (await read('BLUEPRINT_GUIDE.md')).match(/```yaml\r?\n([\s\S]*?)```/)?.[1];
  assert.ok(quickStart, 'Guide provides a complete importable quick-start project');
  assert.deepEqual(importBlueprint(quickStart).errors, []);
});
