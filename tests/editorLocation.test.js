import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { editorLocationHash, locationIdentity, locationItems, parseEditorLocation, resolveEditorLocation } from '../src/gui/navigation/editorLocation.js';

const result = importBlueprint(await readFile(new URL('./fixtures/life-simulation.yaml', import.meta.url), 'utf8'));
assert.deepEqual(result.errors, []);
const draft = result.draft;

test('editor locations roundtrip names across collections, modes and builtins without exposing UUIDs', () => {
  for (const [mode, pages] of Object.entries({ user: ['days', 'weeks', 'slots', 'sequences', 'taskMacros', 'operands', 'expressions'], environment: ['operands', 'tasks'] })) {
    for (const page of pages) for (const item of locationItems(draft, mode, page)) {
      const location = { mode, page, id: item.id };
      const hash = editorLocationHash(draft, location);
      const resolved = resolveEditorLocation(draft, parseEditorLocation(hash));
      assert.equal(resolved.error, undefined);
      assert.equal(locationIdentity(resolved.location), locationIdentity(location));
      assert.ok(hash.endsWith('/' + item.symbol));
      assert.ok(!hash.includes(item.id));
    }
  }
});

test('sequence event links identify both owners and targets; renames preserve UUID selection', () => {
  const sequence = draft.sequences[0], event = sequence.eventGroups[0];
  const location = { mode: 'user', page: 'sequences', id: sequence.id, eventId: event.id };
  const hash = editorLocationHash(draft, location);
  assert.equal(locationIdentity(resolveEditorLocation(draft, parseEditorLocation(hash)).location), locationIdentity(location));
  const next = structuredClone(draft); next.sequences[0].eventGroups[0].symbol = 'renamed_event';
  assert.ok(editorLocationHash(next, location).endsWith('/events/renamed_event'));
  assert.equal(resolveEditorLocation(next, parseEditorLocation(hash)).error, 'missing');
});

test('shared names resolve after a blueprint rebuild creates fresh UUIDs', async () => {
  const rebuilt = importBlueprint(await readFile(new URL('./fixtures/life-simulation.yaml', import.meta.url), 'utf8')).draft;
  const first = resolveEditorLocation(draft, parseEditorLocation('#/user/expressions/weekly_pay')).location;
  const second = resolveEditorLocation(rebuilt, parseEditorLocation('#/user/expressions/weekly_pay')).location;
  assert.notEqual(first.id, second.id);
  assert.equal(editorLocationHash(draft, first), editorLocationHash(rebuilt, second));
});

test('invalid and missing links yield safe list destinations without fuzzy matching', () => {
  for (const hash of ['#/wrong/days', '#/user/tasks/a', '#/user/days/%zz', '#/user/sequences/life/wrong/cold', '#/simulation/continuous/id']) assert.equal(parseEditorLocation(hash).invalid, true);
  const missing = resolveEditorLocation(draft, parseEditorLocation('#/user/expressions/not_here'));
  assert.equal(missing.error, 'missing'); assert.equal(missing.location.page, 'expressions'); assert.equal(missing.location.id, null);
  assert.equal(resolveEditorLocation(draft, parseEditorLocation('#/environment/expressions/weekly_pay')).error, 'missing');
  assert.equal(parseEditorLocation('#/simulation/continuous').page, 'continuousSimulation');
});
