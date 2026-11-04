import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { importBlueprint, exportBlueprint, blueprintSchema } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';

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

test('guide event example executes occurrence, future settings, release and due-date reservation as described', async () => {
  const examples = [...(await read('BLUEPRINT_GUIDE.md')).matchAll(/```yaml\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
  const source = examples.find((yaml) => yaml.includes('builtin: schedule_event'));
  assert.ok(source);
  const imported = importBlueprint(source); assert.deepEqual(imported.errors, []);
  const runtime = new Runtime({ program: Program.fromProject(imported.draft, { referenceMode: 'name' }), seed: 'guide' }), records = [];
  runtime.on('task.completed', (record) => records.push(record));
  await runtime.runDay({ sequence: 'life' });
  assert.ok(runtime.getState().execution.sources.some((source) => source.eventRef === 'cold'));
  assert.equal(runtime.getState().events.cold.probability_percent, 0);
  assert.equal(runtime.getState().events.cold.cooldown_remaining, 7);
  assert.equal(records.find((record) => record.builtin === 'release_slot').result.applied, true);
  assert.equal(runtime.getState().reservations[0].position, 3);
  for (let day = 1; day <= 3; day++) await runtime.nextDay();
  const chosen = runtime.getState().execution.sources.find((source) => source.eventRef?.startsWith('reservation:'));
  assert.ok(chosen); assert.ok(['visit', 'other_visit'].includes(chosen.dayRef));
});

test('portable schema preserves every validation rule while directing semantic readers to the included guide', async () => {
  const text = await read('blueprint.schema.json'), schema = JSON.parse(text);
  assert.deepEqual(withoutAnnotations(schema), withoutAnnotations(blueprintSchema));
  assert.deepEqual([...new Set([...text.matchAll(/[A-Za-z0-9_./-]+\.md/g)].map(([name]) => name))], ['BLUEPRINT_GUIDE.md']);
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate(parse(await read('example.yaml'))), true, JSON.stringify(validate.errors));
  assert.equal(validate({ project: { unknown_field: true } }), false);
});

test('offline schema treats omitted macro mode exactly as explicit sequence mode', async () => {
  for (const schema of [blueprintSchema, JSON.parse(await read('blueprint.schema.json'))]) {
    const validate = new Ajv2020({ strict: false }).compile(schema);
    const branch = { when: null, run: { builtin: 'reset_variable', target: 'score' } };
    for (const mode of [undefined, 'sequence']) {
      const item = { ...(mode ? { mode } : {}), branches: [branch] };
      assert.equal(validate({ task_macros: { test: item } }), false);
      assert.equal(validate({ task_macros: { test: { ...(mode ? { mode } : {}), candidates: [{ macro: 'other' }] } } }), false);
      assert.equal(validate({ task_macros: { test: { ...(mode ? { mode } : {}), steps: [] } } }), true);
    }
    assert.equal(validate({ task_macros: { test: { mode: 'branch', branches: [branch] } } }), true);
  }
});

test('standalone example and quick-start project compile, and copied catalog/example stay current', async () => {
  const example = await read('example.yaml');
  assert.equal(example, await readFile(new URL('../docs/recipes/examples/life-simulation.yaml', import.meta.url), 'utf8'));
  assert.equal(await read('icons.json'), await readFile(new URL('../src/icons/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(importBlueprint(example).errors, []);
  const examples = [...(await read('BLUEPRINT_GUIDE.md')).matchAll(/```yaml\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
  assert.ok(examples.length >= 4, 'Guide provides quick-start and focused, standalone advanced examples');
  for (const [index, yaml] of examples.entries()) {
    const imported = importBlueprint(yaml); assert.deepEqual(imported.errors, [], `Guide example ${index + 1}`);
    const exported = exportBlueprint(imported.draft); assert.deepEqual(exported.errors, []);
    const restored = importBlueprint(exported.data); assert.deepEqual(restored.errors, [], `Guide round-trip ${index + 1}`);
    assert.equal(exportBlueprint(restored.draft).data, exported.data);
  }
});
