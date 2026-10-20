import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { compileProject, projectToDraft, validateDocument, createDay } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { daySimulationPlan, simulateSequenceDay } from '../src/core/daySimulationModel.js';
import { eventGroupErrors } from '../src/core/sequenceEvents.js';
import { dayUses } from '../src/core/dayUses.js';
import { deleteSharedDay } from '../src/core/weekModel.js';
import { editProject } from '../src/core/projectApi.js';
import { compileReport } from '../src/core/reportModel.js';
import { translator } from '../src/i18n/index.js';
const t = translator('en');
function fixture(mode = 'random') {
  const f = sequenceEventsFixture();
  const second = createDay(f.draft, 'Rest'); f.draft.days.push(second);
  const group = { ...rule(f.sequence, f.eventDay.id), display_name: 'Choice event', sourceMode: mode, dayCandidates: [{ dayId: f.eventDay.id, weight: 1 }, { dayId: second.id, weight: 3 }] };
  f.sequence.eventGroups = [group];
  return { ...f, second, group };
}
for (const mode of ['random', 'sequential']) test(`${mode} day source round-trips and exports every referenced day`, () => {
  const { draft, sequence, group, second, eventDay } = fixture(mode);
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  const data = project.data.week_sequences[sequence.id].event_groups[0];
  assert.equal(data.day_schedule_id, undefined); assert.equal(data.day_source.mode, mode);
  assert.deepEqual(data.day_source.candidates.map((item) => item.day_schedule_id), [eventDay.id, second.id]);
  assert.equal(data.day_source.candidates[1].weight, mode === 'random' ? 3 : undefined);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.data.sequences[sequence.id].event_groups[0].day_source, data.day_source);
  assert.ok(runtime.data.days[second.id]);
  const report = compileReport(draft); assert.deepEqual(report.errors, []); assert.ok(report.data.includes('Rest'));
  assert.deepEqual(dayUses(draft)[second.id].roles, ['main']); // Actual references do not change intended uses.
  assert.equal(editProject(draft).days.references(second.id).events[0].id, group.id);
  const switched = editProject(draft).sequences.events(sequence.id).changeKindDraft(group, 'probability');
  assert.deepEqual(switched.dayCandidates, group.dayCandidates); assert.equal(switched.sourceMode, mode);
});

test('candidate validation rejects empty, duplicate, missing, private and non-positive weights', () => {
  const { draft, sequence, group, eventDay } = fixture();
  for (const items of [[], [{ dayId: eventDay.id, weight: 0 }], [{ dayId: eventDay.id, weight: -1 }], [{ dayId: eventDay.id, weight: Infinity }], [{ dayId: 'missing', weight: 1 }], [group.dayCandidates[0], group.dayCandidates[0]]]) {
    assert.ok(eventGroupErrors(sequence, draft.days, [{ ...group, dayCandidates: items }]).length);
  }
  draft.days.find((day) => day.id === eventDay.id).scope = 'week_private'; assert.ok(eventGroupErrors(sequence, draft.days).length);
  delete draft.days.find((day) => day.id === eventDay.id).scope;
  const data = compileProject(draft).data, event = data.week_sequences[sequence.id].event_groups[0];
  event.day_schedule_id = eventDay.id; assert.ok(validateDocument(data).length);
  delete event.day_schedule_id;
  for (const candidates of [null, {}, 'invalid', [null]]) {
    event.day_source.candidates = candidates;
    assert.ok(validateDocument(data).length);
  }
});

test('manual candidate controls the complete day, independent of seed and probability settings', () => {
  const { draft, sequence, group, second, eventDay } = fixture();
  for (const mode of ['random', 'sequential']) {
    group.sourceMode = mode;
    for (const seed of ['1', '100']) {
      const selected = simulateSequenceDay(draft, sequence.id, 0, undefined, undefined, t, {}, {}, seed, { [group.id]: second.id });
      assert.deepEqual(selected.errors, []); assert.equal(selected.plan.layers[0].dayId, second.id);
      assert.equal(selected.trace.some((item) => item.kind === 'phase' && item.children.some((child) => child.slotId === draft.slots[0].id)), false);
      assert.ok(selected.trace.some((item) => item.label.includes('Selected day schedule') && item.label.includes('Rest')));
    }
  }
  group.kind = 'probability'; group.probability_percent = 0; group.cooldown_days = 7;
  assert.equal(daySimulationPlan(draft, sequence.id, 0, t, {}, { [group.id]: eventDay.id }).layers.some((layer) => layer.type === 'event'), false);
  const result = simulateSequenceDay(draft, sequence.id, 0, undefined, undefined, t, {}, { [group.id]: true }, '1', { [group.id]: eventDay.id });
  assert.deepEqual(result.errors, []); assert.equal(result.plan.layers[0].dayId, eventDay.id);
  assert.ok(result.trace.some((item) => item.kind === 'phase' && item.children.some((child) => child.slotId === draft.slots[0].id)));
  assert.ok(daySimulationPlan(draft, sequence.id, 0, t, { [group.id]: true }, { [group.id]: draft.days[0].id }).errors.some((error) => error.key === 'simulationInvalidEventDay'));
  assert.equal(daySimulationPlan(draft, sequence.id, 1, t, { [group.id]: true }).eventDayOptions.length, 1);
});

test('deleting a candidate preserves other candidates and removes empty event containers', () => {
  const { draft, eventDay, second, sequence } = fixture();
  const next = deleteSharedDay(draft, eventDay.id);
  assert.deepEqual(compileProject(next).errors, []);
  assert.deepEqual(next.sequences[0].eventGroups[0].dayCandidates, [{ dayId: second.id, weight: 3 }]);
  assert.equal(deleteSharedDay(next, second.id).sequences.find((s) => s.id === sequence.id).eventGroups.length, 0);
});
