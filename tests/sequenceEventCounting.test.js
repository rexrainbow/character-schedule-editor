import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { eventOccurs, eventCounts, eventGroupErrors, eventTooltip, duplicateEventGroup, eventsOnDate, countDayReferences } from '../src/core/sequenceEvents.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { changeWeekCell, deleteSharedDay } from '../src/core/weekModel.js';
import { daySimulationPlan } from '../src/core/daySimulationModel.js';
import { WEEKDAYS } from '../src/core/scheduleConstants.js';
import { translator } from '../src/i18n/index.js';
function fixture() {
  const f = sequenceEventsFixture(); f.main.tags = ['Work'];
  f.draft.weeks.forEach((week) => WEEKDAYS.forEach((day, index) => { week.days[day] = index < 5 ? f.main.id : null; }));
  return f;
}
const hits = (group, sequence, draft) => Array.from({ length: sequence.rows.length * 7 }, (_, i) => i).filter((i) => eventOccurs(group, i, sequence, draft));

test('tag counting runs on eligible ranks 1,4,7 and defers ineligible starts without restarting at active boundaries', () => {
  const { draft, sequence, eventDay } = fixture();
  const group = { ...rule(sequence, eventDay.id, 4, 20, 3), countFilter: { kind: 'tag', tag: 'Work' } };
  assert.deepEqual(hits(group, sequence, draft), [4, 9, 14, 17]);
  const weekend = { ...group, start: { week: 1, weekday: 'sat' } };
  assert.deepEqual(hits(weekend, sequence, draft), [7, 10, 15, 18]);
  const cropped = { ...sequence, startWeekday: 'sat', endWeekday: 'wed' };
  assert.deepEqual(eventCounts(cropped, group, draft), { total: 4, active: 2 });
  const once = { ...weekend, kind: 'once', interval: 0, end: { ...weekend.start } };
  assert.deepEqual(hits(once, sequence, draft), [5]);
});

test('positive filters and occurrence counts agree with an independent eligible-date list for every weekday mask', () => {
  for (let mask = 0; mask < 128; mask++) {
    const { draft, sequence, main, eventDay } = fixture();
    for (const week of draft.weeks) WEEKDAYS.forEach((day, i) => { week.days[day] = mask & (1 << i) ? main.id : null; });
    sequence.startWeekday = 'fri'; sequence.endWeekday = 'thu';
    for (const interval of [1, 2, 3, 7]) {
      const group = { ...rule(sequence, eventDay.id, 2, 20, interval), countFilter: { kind: 'tag', tag: 'Work' } };
      const eligible = Array.from({ length: 19 }, (_, i) => i + 2).filter((i) => mask & (1 << (i % 7)));
      const expected = eligible.filter((_, i) => i % interval === 0);
      assert.deepEqual(hits(group, sequence, draft), expected);
      assert.deepEqual(eventCounts(sequence, group, draft), { total: expected.length, active: expected.filter((i) => i >= 4 && i <= 17).length });
    }
  }
});

test('effective main assignments apply overrides before matching, and private snapshots match tags but not source UUIDs', () => {
  let { draft, sequence, main, eventDay, activity } = fixture();
  const group = { ...rule(sequence, eventDay.id, 0, 20, 1), countFilter: { kind: 'day', day_schedule_id: main.id } };
  sequence.rows[0].overrides.mon = eventDay.id; sequence.rows[0].overrides.tue = null;
  draft = changeWeekCell(draft, draft.weeks[0].id, 'wed', 0, activity.id);
  const tagged = { ...group, countFilter: { kind: 'tag', tag: 'Work' } };
  assert.equal(eventOccurs(group, 0, sequence, draft), false); assert.equal(eventOccurs(group, 1, sequence, draft), false);
  assert.equal(eventOccurs(group, 2, sequence, draft), false); assert.equal(eventOccurs(tagged, 2, sequence, draft), true);
  sequence.eventGroups = [tagged];
  assert.equal(daySimulationPlan(draft, sequence.id, 2).layers[0].groupId, tagged.id);
  assert.equal(daySimulationPlan(draft, sequence.id, 1).layers.length, 0);
});

test('all dates include blank mains, unknown tags remain valid with zero occurrences and tag edits invalidate cached counts', () => {
  const { draft, sequence, main, eventDay } = fixture();
  const all = rule(sequence, eventDay.id, 5, 20, 3); assert.deepEqual(hits(all, sequence, draft), [5, 8, 11, 14, 17, 20]);
  const group = { ...all, countFilter: { kind: 'tag', tag: 'Work' } }; sequence.eventGroups = [group];
  assert.equal(eventCounts(sequence, group, draft).total, 4);
  draft.days = draft.days.map((day) => day.id === main.id ? { ...day, tags: [] } : day);
  assert.deepEqual(eventCounts(sequence, group, draft), { total: 0, active: 0 });
  assert.deepEqual(compileProject(draft).errors, []);
  assert.deepEqual(eventsOnDate(sequence, 7, draft), []);
});

test('counting filters and tags round-trip and export on shared and inline private runtime days', () => {
  const { draft, sequence, main, eventDay, activity } = fixture();
  const group = { ...rule(sequence, eventDay.id, 4, 20, 3), countFilter: { kind: 'tag', tag: 'Work' } }; sequence.eventGroups = [group];
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const copy = duplicateEventGroup(group, draft.days); copy.countFilter.tag = 'Changed'; assert.equal(group.countFilter.tag, 'Work');
  const changed = changeWeekCell(draft, draft.weeks[0].id, 'mon', 0, activity.id);
  const runtime = compileRuntime(changed); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.days[main.id].tags, ['Work']); assert.deepEqual(runtime.data.weeks[draft.weeks[0].id].days.mon.tags, ['Work']);
  assert.deepEqual(runtime.data.sequences[sequence.id].event_groups[0].count_filter, { kind: 'tag', tag: 'Work' });
  assert.ok(!Object.hasOwn(runtime.data.sequences[sequence.id].event_groups[0], 'skip_weekdays'));
  assert.match(eventTooltip(group, draft.days, translator('en')), /tagged/);
});

test('referenced count days block deletion and invalid or legacy filters reject at the event location', () => {
  const { draft, sequence, main, eventDay } = fixture();
  const group = { ...rule(sequence, eventDay.id), countFilter: { kind: 'day', day_schedule_id: main.id } }; sequence.eventGroups = [group];
  assert.equal(countDayReferences(draft, main.id).length, 1); assert.throws(() => deleteSharedDay(draft, main.id), /eventCountDayInUse/);
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  for (const filter of [null, { kind: 'bad' }, { kind: 'day', day_schedule_id: crypto.randomUUID() }, { kind: 'tag', tag: '' }, { kind: 'tag', tag: ' Work ' }, { kind: 'all', tag: 'Work' }]) {
    const bad = structuredClone(project.data); bad.week_sequences[sequence.id].event_groups[0].count_filter = filter;
    assert.ok(validateDocument(bad).some((error) => error.path.includes('/event_groups/0/count_filter')));
  }
  const bad = structuredClone(project.data); bad.week_sequences[sequence.id].event_groups[0].skip_weekdays = [];
  assert.ok(validateDocument(bad).length);
  group.countFilter = { kind: 'all' }; assert.equal(countDayReferences(draft, main.id).length, 0);
  assert.doesNotThrow(() => deleteSharedDay(draft, main.id));
});
