import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { daySimulationPlan, simulateSequenceDay, progressBindings } from '../src/core/daySimulationModel.js';
import { simulationInitialValues } from '../src/core/simulationModel.js';
import { addProgressDefinitions } from '../src/core/progressEnvironment.js';
import { translator } from '../src/i18n/index.js';
import { setDayAssignment } from '../src/core/dayEvents.js';
import { referenceFixture } from './referenceFixture.js';

test('every phase interleaves priority-sorted events and main, preserving equal-priority creation order', () => {
  const { draft, sequence, main, eventDay, activity } = sequenceEventsFixture();
  sequence.eventGroups = [8, 0, -3, 8, -1].map((priority, index) => ({ ...rule(sequence, eventDay.id, 0, 20, 1, priority), display_name: 'Event ' + index }));
  const targets = ['dayStart', ...Array.from({ length: 3 }, (_, index) => [{ index, edge: 'start' }, index, { index, edge: 'end' }]).flat(), 'dayEnd'];
  for (const target of targets) for (const dayId of [main.id, eventDay.id]) draft.days = draft.days.map((day) => day.id === dayId ? setDayAssignment(day, target, activity.id) : day);
  const before = structuredClone(draft), plan = daySimulationPlan(draft, sequence.id, 0);
  assert.deepEqual(plan.errors, []); assert.equal(plan.phases.length, 11);
  for (const phase of plan.phases) assert.deepEqual(phase.entries.map((entry) => entry.name), ['Event 0', 'Event 3', 'Event 1', 'Workday', 'Event 4', 'Event 2']);
  const result = simulateSequenceDay(draft, sequence.id, 0);
  assert.deepEqual(result.errors, []); assert.equal(result.trace.length, 11); assert.equal(result.trace[0].children.length, 6); assert.deepEqual(draft, before);
});

test('overrides, cleared main days, positive recurrence filters and active boundaries determine the plan', () => {
  const { draft, sequence, main, eventDay } = sequenceEventsFixture();
  sequence.eventGroups = [{ ...rule(sequence, eventDay.id, 0, 20, 2), countFilter: { kind: 'tag', tag: 'Work' } }];
  main.tags = ['Work']; draft.weeks.forEach((week) => ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((day) => { week.days[day] = main.id; }));
  sequence.startWeekday = 'thu'; sequence.endWeekday = 'fri';
  assert.ok(daySimulationPlan(draft, sequence.id, 0).errors.length);
  assert.equal(daySimulationPlan(draft, sequence.id, 3).dayNumber, 1);
  assert.ok(daySimulationPlan(draft, sequence.id, 20).errors.length);
  assert.equal(daySimulationPlan(draft, sequence.id, 5).layers.length, 0);
  assert.equal(daySimulationPlan(draft, sequence.id, 7).layers.filter((layer) => layer.type === 'event').length, 0);
  assert.equal(daySimulationPlan(draft, sequence.id, 8).layers[0].dayId, eventDay.id);
  sequence.rows[2].overrides.mon = eventDay.id;
  assert.equal(daySimulationPlan(draft, sequence.id, 14).mainDayId, eventDay.id);
  sequence.rows[2].overrides.mon = null;
  const cleared = daySimulationPlan(draft, sequence.id, 14);
  assert.equal(cleared.mainDayId, null); assert.ok(cleared.layers.every((entry) => entry.type === 'event'));
  assert.equal(draft.weeks[0].days.mon, main.id);
  assert.ok(simulateSequenceDay(draft, sequence.id, 20).errors.length);
  assert.ok(simulateSequenceDay(draft, 'missing', 0).errors.length);
  assert.ok(simulateSequenceDay(draft, sequence.id, NaN).errors.length);
});

function statefulFixture() {
  const base = sequenceEventsFixture(), vars = builtinVariableFixture();
  base.draft.operandNodes = vars.draft.operandNodes; base.draft.builtinTasks = vars.draft.builtinTasks;
  base.draft.slots = vars.draft.slots;
  base.draft.days[0] = setDayAssignment(setDayAssignment(base.main, 'dayStart', vars.draft.slots[0].id), 0, vars.draft.slots[2].id);
  base.draft.days[1] = setDayAssignment(base.eventDay, 'dayStart', vars.draft.slots[0].id);
  base.sequence.eventGroups = [rule(base.sequence, base.eventDay.id, 0, 20, 1, 1)];
  return { ...base, ...Object.fromEntries(['number', 'boolean', 'text', 'readonly'].map((key) => [key, vars[key]])) };
}

test('one state flows through all sources and phases, with initial-value resets and lazy branches', () => {
  const { draft, sequence, number, text } = statefulFixture();
  const condition = { kind: 'comparison', operand_a: { type: 'reference', reference_id: number }, comparator: '==', operand_b: { type: 'constant', value: 16 } };
  const reset = { builtin: 'reset_variable', target_variable_id: text };
  draft.slots[2].branches = [{ condition, task: reset }, { condition: null, task: { builtin: 'set_variable', target_variable_id: text, value: { type: 'constant', value: 'Wrong' } } }];
  const values = { ...simulationInitialValues(draft), [number]: 20, [text]: 'Test input' }, before = structuredClone({ draft, values });
  const result = simulateSequenceDay(draft, sequence.id, 0, values);
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 16); assert.equal(result.state[text], 'Start');
  assert.deepEqual(result.calls.map((call) => call.context.type), ['event', 'main', 'main']);
  assert.deepEqual(result.calls.map((call) => call.context.phaseKey), ['dayStart', 'dayStart', 'slot:0:main']);
  assert.deepEqual({ draft, values }, before);
  assert.deepEqual(simulateSequenceDay(draft, sequence.id, 0, values).state, result.state);
});

test('progress bindings follow date and phases, remain independent of initial values, and accept edited engine keys', () => {
  const { draft, sequence, number } = statefulFixture();
  draft.operandNodes = addProgressDefinitions(draft.operandNodes, 3, translator('en'));
  const ids = progressBindings(draft);
  sequence.startWeekday = 'thu';
  sequence.eventGroups = [];
  sequence.rows[1].overrides.wed = draft.days[0].id;
  draft.days[0] = setDayAssignment(setDayAssignment(draft.days[0], 'dayStart', null), 0, null);
  for (let i = 0; i < 3; i++) draft.days[0] = setDayAssignment(draft.days[0], i, draft.slots[0].id);
  draft.slots[0].branches[0].task = { builtin: 'increment_variable', target_variable_id: number, value: { type: 'reference', reference_id: ids.current_slot } };
  const result = simulateSequenceDay(draft, sequence.id, 9);
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 16);
  assert.equal(result.input[ids.current_week], 2); assert.equal(result.input[ids.current_weekday], 3); assert.equal(result.input[ids.current_day], 7);
  assert.equal(result.input[ids.current_slot], 1); assert.equal(result.state[ids.current_slot], 3); assert.equal(result.state[ids.total_weeks], 3);
  draft.operandNodes[ids.current_day].engine_key = 'engine.day';
  assert.equal(progressBindings(draft).current_day, '');
  const explicit = simulateSequenceDay(draft, sequence.id, 9, undefined, undefined, undefined, { current_day: ids.current_day });
  assert.equal(explicit.state[ids.current_day], 7);
  assert.ok(simulateSequenceDay(draft, sequence.id, 9, undefined, undefined, undefined, { current_day: ids.current_slot }).errors.some((error) => error.key === 'simulationInvalidBinding'));
  const disabled = simulateSequenceDay(draft, sequence.id, 9, undefined, undefined, undefined, { current_slot: '' });
  assert.equal(disabled.state[number], 13);
});

test('errors stop later phases, preserve context and partial writes, and share the operation budget', () => {
  const { draft, sequence, number, readonly } = statefulFixture();
  draft.slots[2].branches[0].task = { builtin: 'increment_variable', target_variable_id: readonly, value: { type: 'constant', value: 1 } };
  const failed = simulateSequenceDay(draft, sequence.id, 0);
  assert.ok(failed.errors.length); assert.equal(failed.state[number], 6); assert.equal(failed.errorContext.phaseKey, 'slot:0:main');
  assert.equal(failed.errorContext.dayId, draft.days[0].id); assert.equal(failed.trace.at(-1).children.at(-1).failed, true);
  assert.ok(failed.errors[0].path.startsWith('/slots/'));
  draft.slots[2].branches = [];
  sequence.eventGroups = Array.from({ length: 5000 }, () => rule(sequence, draft.days[1].id, 0, 0, 0, 1));
  const limited = simulateSequenceDay(draft, sequence.id, 0);
  assert.ok(limited.errors.some((error) => error.key === 'simulationLimit'));
});

test('opaque engine calls keep reference arguments and source context while empty assignments are skipped', () => {
  const { draft, sequence } = sequenceEventsFixture(), source = referenceFixture();
  Object.assign(draft, { tasks: source.draft.tasks, taskMacros: source.draft.taskMacros, operandNodes: source.draft.operandNodes, slots: source.draft.slots });
  draft.days = [source.draft.days[0]]; draft.weeks[0].days.mon = draft.days[0].id;
  const input = simulationInitialValues(draft), result = simulateSequenceDay(draft, sequence.id, 0, input);
  assert.deepEqual(result.errors, []); assert.equal(result.unmodeled, true); assert.deepEqual(result.state, input);
  assert.equal(result.calls.length, 2); assert.equal(result.calls[0].arguments[0].value.reference_id, source.counter);
  assert.equal(result.calls[1].arguments[0].value.reference_id, source.local);
  assert.equal(result.calls[1].context.phaseKey, 'slot:1:main'); assert.equal(result.calls[1].context.dayId, draft.days[0].id);
  assert.equal(result.trace[0].empty, true); assert.equal(result.trace.at(-1).empty, true);
  const empty = simulateSequenceDay(draft, sequence.id, 1);
  assert.deepEqual(empty.errors, []); assert.equal(empty.calls.length, 0); assert.equal(empty.trace.length, 11);
});
