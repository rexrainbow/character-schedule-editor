import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { parseIcon, composeIcon, contrastColor, backgrounds } from '../src/icons/appearance.js';
import { catalog } from '../src/icons/catalog.js';
import { importBlueprint, exportBlueprint } from '../src/core/blueprint/index.js';
import { compileProject, projectToDraft } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { compileEnvironment, createProjectWithEnvironment } from '../src/core/environmentModel.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { builtinTaskDefinitions } from '../src/core/builtinTaskModel.js';
import { translator } from '../src/i18n/index.js';

import { iconBlueprint } from './iconFixture.js';

const good = (result) => { assert.deepEqual(result.errors, []); return result; };

test('offline icon appearance supports palette, hex, blank foreground, and independent cosmetic fallbacks', () => {
  assert.equal(parseIcon('').foreground, 'tabler:calendar-event');
  assert.equal(parseIcon('tabler:heart').background, null);
  assert.deepEqual(parseIcon('tabler:heart|blue'), { value: 'tabler:heart|blue', foreground: 'tabler:heart', background: '#60A5FA', warnings: [] });
  assert.equal(parseIcon('tabler:heart|#ff0000').background, '#FF0000');
  assert.equal(parseIcon('blue').foreground, '');
  assert.equal(parseIcon('#60a5fa').background, '#60A5FA');
  assert.equal(parseIcon('|blue').background, '#60A5FA');
  assert.equal(parseIcon('unknown|red').foreground, '');
  assert.equal(parseIcon('unknown|red').background, '#F87171');
  assert.deepEqual(parseIcon('tabler:heart|invalid').warnings, ['iconUnknownBackground']);
  assert.equal(parseIcon('tabler:heart|invalid').foreground, 'tabler:heart');
  for (const value of ['constructor', '__proto__', 'url(https://example.com/image)', '#fff', 'a|b|c']) {
    assert.equal(parseIcon(value).foreground, ''); assert.equal(parseIcon(value).background, null); assert.ok(parseIcon(value).warnings.length);
  }
  assert.equal(composeIcon('tabler:heart', 'blue'), 'tabler:heart|blue');
  assert.equal(composeIcon('', 'blue'), 'blue');
  assert.equal(contrastColor('#000000'), '#FFFFFF');
  assert.equal(contrastColor('#FFFFFF'), '#101218');
});

test('Blueprint preserves every entity, parameter, option and builtin icon through project persistence and rebuild', () => {
  const initial = good(importBlueprint(stringify(iconBlueprint)));
  const saved = good(compileProject(initial.draft)).data;
  const output = parse(good(exportBlueprint(projectToDraft(saved))).data);
  for (const [collection, items] of Object.entries(iconBlueprint)) {
    if (['project', 'environment', 'builtins'].includes(collection)) continue;
    for (const [name, item] of Object.entries(items)) {
      assert.equal(output[collection][name].icon, item.icon);
      if (item.parameters) for (const [parameter, value] of Object.entries(item.parameters)) {
        assert.equal(output[collection][name].parameters[parameter].icon, value.icon);
        if (value.options) assert.deepEqual(output[collection][name].parameters[parameter].options, value.options);
      }
    }
  }
  assert.deepEqual(output.enums.mood.options, iconBlueprint.enums.mood.options);
  assert.equal(output.sequences.life.events.greeting.icon, 'tabler:heart|red');
  assert.equal(output.environment.icon, iconBlueprint.environment.icon);
  assert.deepEqual(output.builtins.adjust_probability_event.parameter_option_icons, iconBlueprint.builtins.adjust_probability_event.parameter_option_icons);
  const text = good(exportBlueprint(initial.draft)).data;
  assert.equal(good(exportBlueprint(good(importBlueprint(text)).draft)).data, text);
  const runtime = good(compileRuntime(initial.draft)).data;
  function noIcons(value) { if (!value || typeof value !== 'object') return; assert.ok(!Object.hasOwn(value, 'icon')); Object.values(value).forEach(noIcons); }
  noIcons(runtime);
  const environment = good(compileEnvironment(initial.draft)).data;
  const environmentCopy = good(compileProject(createProjectWithEnvironment('Copy', 3, environment))).data;
  assert.equal(environmentCopy.environment.icon, iconBlueprint.environment.icon);
  assert.deepEqual(Object.values(environmentCopy.tasks)[0].parameters.map((p) => p.icon), Object.values(saved.tasks)[0].parameters.map((p) => p.icon));
  assert.equal(environmentCopy.builtin_tasks.adjust_probability_event.parameters.operation.option_icons.set, 'tabler:check|green');
});

test('builtin parameter and fixed option icons are editable while structural contracts remain protected', () => {
  const session = createProjectSession(good(importBlueprint(stringify(iconBlueprint))).draft, { mode: 'environment' }), t = translator('en');
  const current = builtinTaskDefinitions(session.getSnapshot().builtinTasks, t).find((item) => item.id === 'builtin:adjust_probability_event');
  const parameters = current.parameters.map((p) => p.id === 'operation' ? { ...p, icon: 'tabler:code|red', options: p.options.map((option) => ({ ...option, icon: 'green' })) } : p);
  assert.equal(session.tasks.builtins.update(current.id, { parameters }).ok, true);
  const updated = builtinTaskDefinitions(session.getSnapshot().builtinTasks, t).find((item) => item.id === current.id);
  assert.equal(updated.parameters.find((p) => p.id === 'operation').icon, 'tabler:code|red');
  assert.equal(updated.parameters.find((p) => p.id === 'operation').options[0].icon, 'green');
  assert.equal(session.tasks.builtins.update(current.id, { parameters: parameters.slice(1) }).ok, false);
  const invalid = structuredClone(parameters); invalid.find((p) => p.id === 'operation').options[0].value = 'unknown';
  assert.equal(session.tasks.builtins.update(current.id, { parameters: invalid }).ok, false);
});

test('agent icon manifest matches the exact offline catalog', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/icons/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.foregrounds.map((item) => item.id), catalog.filter((item) => item.id.startsWith('tabler:')).map((item) => item.id));
  assert.deepEqual(manifest.backgrounds.map((item) => [item.id, item.color]), backgrounds.map((item) => [item.id, item.color]));
  assert.equal(manifest.separator, '|');
});
