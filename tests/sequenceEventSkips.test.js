import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { eventOccurs, eventCounts, eventGroupErrors, eventTooltip, duplicateEventGroup } from '../src/sequenceEvents.js';
import { compileProject, projectToDraft, validateDocument } from '../src/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/runtimeModel.js';
import { WEEKDAYS } from '../src/scheduleConstants.js';
import { translator } from '../src/i18n.js';

test('excluded weekdays neither execute nor advance the cycle; excluded starts defer to the first eligible day', () => {
  const { sequence, eventDay } = sequenceEventsFixture(), group = rule(sequence, eventDay.id, 4, 20, 3); group.skipWeekdays = ['sat', 'sun'];
  const hits = (g) => Array.from({ length: 21 }, (_, i) => i).filter((i) => eventOccurs(g, i));
  assert.deepEqual(hits(group), [4, 9, 14, 17]); assert.deepEqual(eventCounts(sequence, group), { total: 4, active: 4 });
  assert.deepEqual(hits({ ...group, start: { week: 1, weekday: 'sat' } }), [7, 10, 15, 18]);
  const weekend = { ...group, start: { week: 1, weekday: 'sat' }, end: { week: 1, weekday: 'sun' } };
  assert.deepEqual(eventCounts(sequence, weekend), { total: 0, active: 0 });
  const once = { ...weekend, interval: 0, end: { ...weekend.start }, skipWeekdays: [...WEEKDAYS] };
  assert.deepEqual(hits(once), [5]); assert.deepEqual(eventGroupErrors(sequence, [eventDay], [once]), []);
  assert.ok(eventGroupErrors(sequence, [eventDay], [{ ...once, interval: 1 }]).some((e) => e.key === 'eventSkipAll'));
});

test('optimized occurrence counts match explicit eligible-day timelines for every weekday exclusion set', () => {
  const { sequence, eventDay } = sequenceEventsFixture(); sequence.startWeekday = 'fri'; sequence.endWeekday = 'thu';
  for (let mask = 0; mask < 128; mask++) for (let start = 0; start < 7; start++) for (const interval of [1, 3, 5, 7]) {
    const group = rule(sequence, eventDay.id, start, 20, interval); group.skipWeekdays = WEEKDAYS.filter((_, i) => mask & (1 << i));
    const eligible = Array.from({ length: 21 - start }, (_, i) => start + i).filter((i) => !group.skipWeekdays.includes(WEEKDAYS[i % 7]));
    const expected = eligible.filter((_, i) => i % interval === 0);
    assert.deepEqual(Array.from({ length: 21 }, (_, i) => i).filter((i) => eventOccurs(group, i)), expected);
    assert.deepEqual(eventCounts(sequence, group), { total: expected.length, active: expected.filter((i) => i >= 4 && i <= 17).length });
  }
  const early = rule(sequence, eventDay.id, 0, 0, 1); assert.equal(eventCounts(sequence, early).active, 0);
});

test('weekday exclusions round-trip, export, copy independently and reject malformed imports', () => {
  const { draft, sequence, eventDay } = sequenceEventsFixture(), group = rule(sequence, eventDay.id, 4, 20, 3); group.skipWeekdays = ['sat', 'sun']; sequence.eventGroups = [group];
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.sequences[sequence.id].event_groups[0].skip_weekdays, ['sat', 'sun']);
  assert.ok(eventTooltip(group, draft.days, translator('en')).split('\n')[1].includes('eligible days'));
  const copy = duplicateEventGroup(group, draft.days); copy.skipWeekdays.push('mon'); assert.equal(group.skipWeekdays.length, 2);
  for (const skip of [['sat', 'sat'], ['bad'], [...WEEKDAYS], 'sat']) {
    const bad = structuredClone(project.data); bad.week_sequences[sequence.id].event_groups[0].skip_weekdays = skip; assert.ok(validateDocument(bad).length);
  }
});
