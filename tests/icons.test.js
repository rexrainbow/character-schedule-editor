import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/sequence-example.json' with { type: 'json' };
import data from '../src/icons/data.json' with { type: 'json' };
import { catalog, findIcons, canonicalIconName } from '../src/icons/catalog.js';
import { clone, compileProject, projectToDraft, duplicateDay } from '../src/model.js';
import { changeWeekCell, duplicateWeek } from '../src/weekModel.js';
import { duplicateSequence } from '../src/sequenceModel.js';

test('curated catalog has unique, bundled SVG data and searches both languages', () => {
  assert.equal(catalog.length, 120);
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
  for (const item of catalog) { assert.ok(data[item.id].body); assert.equal(data[item.id].width, 24); }
  assert.equal(findIcons('看醫生')[0].id, 'tabler:stethoscope');
  assert.equal(findIcons('DOCTOR', 'health')[0].id, 'tabler:stethoscope');
  assert.equal(findIcons('DOCTOR', 'work').length, 0);
  assert.equal(canonicalIconName('__proto__'), '__proto__');
  assert.equal(canonicalIconName('constructor'), 'constructor');
});

test('all entity icons survive round-trip, duplication and private-day snapshots', () => {
  let draft = projectToDraft(example);
  draft.days[0].icon = 'tabler:heart'; draft.weeks[0].icon = 'tabler:home'; draft.sequences[0].icon = 'tabler:star';
  const saved = compileProject(draft); assert.deepEqual(saved.errors, []);
  assert.deepEqual(compileProject(projectToDraft(saved.data)).data, saved.data);
  assert.equal(duplicateDay(draft, draft.days[0]).icon, 'tabler:heart');
  assert.equal(duplicateWeek(draft, draft.weeks[0]).weeks.at(-1).icon, 'tabler:home');
  assert.equal(duplicateSequence(draft, draft.sequences[0]).icon, 'tabler:star');
  draft = changeWeekCell(draft, draft.weeks[0].id, 'mon', 0, null);
  assert.equal(draft.days.find((day) => day.id === draft.weeks[0].days.mon).icon, 'tabler:heart');
});

test('legacy files get default icons; unknown strings remain portable and bad types fail at their location', () => {
  const old = clone(example);
  for (const key of ['day_schedules', 'week_schedules', 'week_sequences']) for (const item of Object.values(old[key])) delete item.icon;
  const normalized = compileProject(projectToDraft(old)); assert.deepEqual(normalized.errors, []);
  assert.equal(Object.values(normalized.data.day_schedules)[0].icon, 'tabler:calendar');
  const draft = projectToDraft(old); draft.days[0].icon = 'custom:unknown';
  assert.equal(Object.values(compileProject(draft).data.day_schedules)[0].icon, 'custom:unknown');
  draft.days[0].icon = 123;
  assert.ok(compileProject(draft).errors.some((e) => e.path === `/day_schedules/${draft.days[0].id}/icon`));
});
