import test from 'node:test';
import assert from 'node:assert/strict';
import { dayUses, dayPurposes, matchesDayPurpose, dayUseReason } from '../src/core/dayUses.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { compileProject, projectToDraft, createDay, duplicateDay, validateDocument } from '../src/core/model.js';
import { changeWeekCell } from '../src/core/weekModel.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { createScheduleEvent } from '../src/core/scheduledEvents.js';
import { translator } from '../src/i18n/index.js';
import { dayUsesFixture } from './dayUsesFixture.js';

test('manual intended uses determine grouping independently of every container reference', () => {
  const f = dayUsesFixture(), before = structuredClone(f.draft);
  assert.deepEqual(dayUses(f.draft)[f.main.id].roles, ['main', 'overlay']);
  assert.deepEqual(dayUses(f.draft)[f.unused.id].roles, ['unclassified']);
  assert.equal(matchesDayPurpose(f.draft.days.find((day) => day.id === f.unused.id), 'unclassified'), true);
  f.groups[2].executionMode = 'overlay';
  f.draft.weeks[0].days.mon = null; f.draft.sequences[0].rows[0].overrides = {};
  assert.deepEqual(dayUses(f.draft)[f.extra.id].roles, ['interrupt']);
  assert.deepEqual(dayUses(f.draft)[f.main.id].roles, ['main', 'overlay']);
  f.draft.sequences[0].eventGroups = [];
  assert.deepEqual(dayUses(f.draft)[f.eventDay.id].roles, ['overlay']);
  const original = dayUses(before); assert.match(dayUseReason(original[f.extra.id], 'interrupt', translator('en')), /Intended use/);
});

test('new and unspecified days default to main while explicit empty means unclassified', () => {
  const { draft } = dayUsesFixture();
  assert.deepEqual(createDay(draft, 'New').purposes, ['main']);
  assert.deepEqual(dayPurposes({}), ['main']);
  assert.equal(matchesDayPurpose({}, 'overlay'), false);
  assert.deepEqual(dayUses({ days: [{ id: 'old' }, { id: 'empty', purposes: [] }] }), { old: { roles: ['main'] }, empty: { roles: ['unclassified'] } });
});

test('purposes round-trip and copy to shared/private days, but remain outside runtime and manual tags', () => {
  const f = dayUsesFixture(), doc = compileProject(f.draft); assert.deepEqual(doc.errors, []);
  assert.deepEqual(projectToDraft(doc.data).days.find((day) => day.id === f.main.id).purposes, ['main', 'overlay']);
  const original = f.draft.days.find((day) => day.id === f.main.id), copy = duplicateDay(f.draft, original);
  assert.deepEqual(copy.purposes, original.purposes); copy.purposes.push('interrupt'); assert.notDeepEqual(copy.purposes, original.purposes);
  const customized = changeWeekCell(f.draft, f.draft.weeks[0].id, 'mon', 0, f.activity.id);
  const privateDay = customized.days.find((day) => day.scope === 'week_private');
  assert.deepEqual(privateDay.purposes, original.purposes);
  const runtime = compileRuntime(f.draft); assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.data.days[f.main.id].purposes, undefined);
  assert.deepEqual(runtime.data.days[f.main.id].tags, ['Office']);
});

test('API queries intended uses and actual references separately; reservations do not relabel days', () => {
  const f = dayUsesFixture(), target = f.draft.days.find((day) => day.id === f.unused.id);
  const task = { ...createScheduleEvent(), day_schedule_id: target.id, execution_mode: 'interrupt_main' };
  f.activity.branches = [{ condition: null, task }];
  const api = createProjectSession(f.draft);
  assert.deepEqual(api.days.uses(target.id).roles, ['unclassified']);
  assert.equal(api.days.references(target.id).reservations.length, 1);
  assert.equal(api.days.remove(target.id).ok, false);
  assert.deepEqual(api.days.list({ use: 'interrupt' }).map((day) => day.id), [f.extra.id]);
  const result = api.days.update(target.id, { purposes: ['overlay', 'interrupt'] }); assert.equal(result.ok, true);
  assert.ok(api.days.list({ use: 'overlay' }).some((day) => day.id === target.id));
});

test('schema rejects duplicate or unknown purposes without restricting actual assignments', () => {
  const f = dayUsesFixture();
  for (const purposes of [['invalid'], ['main', 'main'], 'main', null]) {
    const data = compileProject(f.draft).data; data.day_schedules[f.main.id].purposes = purposes;
    assert.ok(validateDocument(data).length);
  }
  for (const day of f.draft.days) day.purposes = [];
  assert.deepEqual(compileProject(f.draft).errors, []);
});
