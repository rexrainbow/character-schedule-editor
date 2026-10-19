import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { moveSequenceRow, duplicateSequenceRow, removeSequenceRow, duplicateSequence, replaceSequenceWeek } from '../src/core/sequenceModel.js';
import { deleteSharedDay, deleteWeek, changeWeekCell } from '../src/core/weekModel.js';
import { setSequenceBoundary } from '../src/core/sequenceRange.js';
import { datePosition, changeEventStart, eventsOnDate, eventCounts, eventGroupErrors, positionDate, duplicateEventGroup, eventTooltip } from '../src/core/sequenceEvents.js';
import { engineKeyEntries, engineKeyConflicts } from '../src/core/engineKeyModel.js';
import { translator } from '../src/i18n/index.js';
import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';

test('periods anchor to the fixed sequence date; active bounds do not reset their phase; priorities are stable', () => {
  const { sequence, eventDay } = sequenceEventsFixture();
  const repeat = rule(sequence, eventDay.id, 2, 20, 7, 0), once = rule(sequence, eventDay.id, 2, 2, 0, 10);
  sequence.eventGroups = [repeat, once, rule(sequence, eventDay.id, 2, 20, 3, -1), rule(sequence, eventDay.id, 2, 20, 7, -10), rule(sequence, eventDay.id, 2, 20, 7, 0)];
  assert.deepEqual(eventsOnDate(sequence, 2).map((g) => g.priority), [10, 0, 0, -1, -10]);
  assert.equal(eventsOnDate(sequence, 2)[1].id, repeat.id);
  assert.deepEqual(Array.from({ length: 21 }, (_, i) => i).filter((i) => eventsOnDate(sequence, i).some((g) => g.id === repeat.id)), [2, 9, 16]);
  const shifted = setSequenceBoundary(sequence, 'start', 'fri');
  assert.deepEqual(eventCounts(shifted, repeat), { total: 3, active: 2 });
  assert.equal(eventsOnDate(shifted, 9)[0].id, repeat.id);
  const moved = changeEventStart(repeat, positionDate(5));
  assert.equal(datePosition(moved.end), 23); assert.equal(moved.interval, 7);
  assert.ok(eventGroupErrors(sequence, [eventDay], [moved]).some((e) => e.path.endsWith('/end')));
});

test('event groups round-trip and export runtime rules referencing complete shared day content', () => {
  const { draft, sequence, eventDay } = sequenceEventsFixture();
  sequence.eventGroups = [rule(sequence, eventDay.id)];
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.sequences[sequence.id].event_groups, project.data.week_sequences[sequence.id].event_groups.map(({ engine_key, icon, ...group }) => group));
  assert.ok(runtime.data.days[eventDay.id].day_start_slot_id);
  for (const mutate of [
    (g) => { g.interval_days = -1; }, (g) => { g.priority = .5; }, (g) => { g.end.week_number = 4; },
    (g) => { g.end = { week_number: 1, weekday: 'mon' }; g.start.weekday = 'tue'; },
    (g) => { g.interval_days = 0; }, (g) => { g.day_schedule_id = crypto.randomUUID(); },
  ]) {
    const bad = structuredClone(project.data); mutate(bad.week_sequences[sequence.id].event_groups[0]); assert.ok(validateDocument(bad).length);
  }
  const duplicates = structuredClone(project.data); duplicates.week_sequences[sequence.id].event_groups.push(duplicates.week_sequences[sequence.id].event_groups[0]);
  assert.ok(validateDocument(duplicates).some((e) => e.key === 'duplicateId'));
});

test('event names fall back, keys join global contracts, copies clear keys and tooltips have four lines', () => {
  const { draft, sequence, eventDay } = sequenceEventsFixture();
  const group = rule(sequence, eventDay.id); group.engine_key = 'event.inspection'; sequence.eventGroups = [group];
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.equal(project.data.week_sequences[sequence.id].event_groups[0].display_name, 'Inspection');
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.data.exports['event.inspection'], { kind: 'eventGroups', id: group.id, sequence_id: sequence.id });
  group.display_name = 'Routine inspection';
  const tooltip = eventTooltip(group, draft.days, translator('en')).split('\n');
  assert.equal(tooltip.length, 4); assert.equal(tooltip[0], 'Routine inspection'); assert.ok(tooltip[1].includes('Every 7 days')); assert.ok(tooltip[2].includes('Week 1 / Monday')); assert.equal(tooltip[3], 'Priority: 0');
  const copy = duplicateEventGroup(group, draft.days); assert.equal(copy.display_name, 'Routine inspection (副本)'); assert.equal(copy.engine_key, undefined); assert.notEqual(copy.id, group.id);
  const sequenceCopy = duplicateSequence(draft, sequence); assert.equal(sequenceCopy.eventGroups[0].engine_key, undefined);
  draft.days[0].engine_key = group.engine_key;
  assert.equal(engineKeyConflicts(engineKeyEntries(draft), 'eventGroups', group.id, group.engine_key).length, 1);
  assert.deepEqual(compileProject(draft).errors, []);
  assert.ok(compileRuntime(draft).errors.some((e) => e.key === 'runtimeDuplicateKey' && e.path.includes('/event_groups/0/engine_key')));
});

test('week operations keep rule positions; shortening removes whole invalid groups; shared-day deletion clears references', () => {
  let { draft, sequence, eventDay, activity } = sequenceEventsFixture();
  sequence.eventGroups = [rule(sequence, eventDay.id, 0, 0, 0), rule(sequence, eventDay.id, 3, 20, 7)];
  assert.deepEqual(moveSequenceRow(sequence, sequence.rows[0].uid, 1).eventGroups, sequence.eventGroups);
  assert.deepEqual(duplicateSequenceRow(sequence, sequence.rows[0].uid).eventGroups, sequence.eventGroups);
  assert.deepEqual(replaceSequenceWeek(draft, sequence, sequence.rows[0].uid, draft.weeks[1].id).eventGroups, sequence.eventGroups);
  assert.equal(removeSequenceRow(sequence, sequence.rows[0].uid).eventGroups.length, 1);
  assert.equal(deleteWeek(draft, draft.weeks[0].id).sequences[0].eventGroups.length, 1);
  const copy = duplicateSequence(draft, sequence); assert.notEqual(copy.eventGroups[0].id, sequence.eventGroups[0].id); copy.eventGroups[0].start.week = 2; assert.equal(sequence.eventGroups[0].start.week, 1);
  const cleared = deleteSharedDay(draft, eventDay.id); assert.deepEqual(cleared.sequences[0].eventGroups, []); assert.deepEqual(compileProject(cleared).errors, []);
  draft = changeWeekCell(draft, draft.weeks[0].id, 'tue', 0, activity.id);
  const privateDay = draft.days.find((day) => day.scope === 'week_private');
  sequence.eventGroups[0].dayId = privateDay.id; assert.ok(compileProject(draft).errors.some((e) => e.key === 'eventSharedDayRequired'));
});
