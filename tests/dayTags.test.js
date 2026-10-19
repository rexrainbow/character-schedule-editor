import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceEventsFixture } from './sequenceEventsFixture.js';
import { compileProject, projectToDraft, duplicateDay, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { changeWeekCell, sharedDays } from '../src/core/weekModel.js';
import { availableDayTags, matchesDayTag, tagFilterValue } from '../src/core/dayTags.js';

test('tags survive project round trips and independent copies and export to runtime including private snapshots', () => {
  const { draft, main, eventDay } = sequenceEventsFixture();
  main.tags = ['Main', 'Work']; draft.days.find((day) => day.id === eventDay.id).tags = ['Event', 'Work'];
  const compiled = compileProject(draft); assert.deepEqual(compiled.errors, []);
  assert.deepEqual(projectToDraft(compiled.data).days[0].tags, main.tags);
  const copy = duplicateDay(draft, main); copy.tags.push('Copy'); assert.deepEqual(main.tags, ['Main', 'Work']);
  const changed = changeWeekCell(draft, draft.weeks[0].id, 'mon', 0, draft.slots[0].id);
  const privateDay = changed.days.find((day) => day.scope === 'week_private'); assert.deepEqual(privateDay.tags, main.tags);
  const runtime = compileRuntime(changed); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.days[main.id].tags, main.tags); assert.deepEqual(runtime.data.weeks[draft.weeks[0].id].days.mon.tags, main.tags);
  assert.equal(sharedDays(changed).some((day) => day.id === privateDay.id), false);
});

test('tag counts and exact single-tag filters distinguish untagged days and arbitrary user tag names', () => {
  const days = [{ tags: ['Event', 'Work'] }, { tags: ['Work', 'untagged'] }, { tags: ['tag:Event'] }, {}, { tags: [] }];
  const counts = new Map(availableDayTags(days)); assert.equal(counts.get('Work'), 2); assert.equal(counts.get('Event'), 1);
  assert.equal(days.filter((day) => matchesDayTag(day, '')).length, 5);
  assert.equal(days.filter((day) => matchesDayTag(day, 'untagged')).length, 2);
  assert.equal(days.filter((day) => matchesDayTag(day, tagFilterValue('untagged'))).length, 1);
  assert.equal(days.filter((day) => matchesDayTag(day, tagFilterValue('tag:Event'))).length, 1);
});

test('imports reject blank, padded, duplicate and non-string tags at the day field location', () => {
  const { draft, main } = sequenceEventsFixture(), data = compileProject(draft).data;
  for (const tags of [[''], [' '], [' Event'], ['Event '], ['Event', 'Event'], [1], null, 'Event']) {
    const invalid = structuredClone(data); invalid.day_schedules[main.id].tags = tags;
    assert.ok(validateDocument(invalid).some((error) => error.path.startsWith(`/day_schedules/${main.id}/tags`)));
  }
  const valid = structuredClone(data); valid.day_schedules[main.id].tags = ['Event', 'Work day']; assert.deepEqual(validateDocument(valid), []);
});
