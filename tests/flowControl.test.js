import test from 'node:test';
import assert from 'node:assert/strict';
import { flowControlFixture } from './flowControlFixture.js';
import { simulateSequenceDay } from '../src/daySimulationModel.js';
import { simulateSlot, simulationInitialValues } from '../src/simulationModel.js';
import { compileProject, projectToDraft, validateDocument } from '../src/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/runtimeModel.js';
import { compileEnvironment, validateEnvironment, prepareEnvironmentImport } from '../src/environmentModel.js';
import { builtinTaskDefinitions, changeBuiltinDefinition } from '../src/builtinTasks.js';
import { translator } from '../src/i18n.js';
import { createTaskMacro } from '../src/taskMacroModel.js';
const cancelled = (result) => result.trace.flatMap((phase) => phase.children.filter((entry) => entry.cancelled).map((entry) => ({ phase: phase.label, key: phase.path.split('/').at(-1), entry })));

test('slot cancellation skips lower sources across start/main/end, keeps equal priorities and macro steps, and expires', () => {
  const { draft, sequence, number, days, activity } = flowControlFixture();
  // This invalid write must never be evaluated in the cancelled main assignment.
  const unsafe = structuredClone(activity); unsafe.id = crypto.randomUUID(); unsafe.branches[0].task.target_variable_id = 'missing'; draft.slots.push(unsafe); days.Main.slotIds[0] = unsafe.id;
  const input = simulationInitialValues(draft), before = structuredClone({ draft, input });
  const result = simulateSequenceDay(draft, sequence.id, 0, input);
  assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, 12); assert.equal(result.state[number], 64);
  assert.ok(cancelled(result).every(({ key }) => ['slot:0:start', 'slot:0:main', 'slot:0:end'].includes(key)));
  assert.ok(cancelled(result).every(({ entry }) => !/^(High|Peer) /.test(entry.label)));
  assert.ok(result.calls.some((call) => call.context.name === 'Main' && call.context.phaseKey === 'slot:1:main'));
  assert.ok(result.calls.some((call) => call.context.name === 'High' && call.context.phaseKey === 'slot:0:start' && call.kind === 'builtin'));
  assert.equal(result.calls.find((call) => call.kind === 'control').applied, true);
  assert.deepEqual({ draft, input }, before);
});

test('day cancellation covers remaining phases and day end, resets on each run, and is not retroactive', () => {
  const { draft, sequence, number } = flowControlFixture('cancel_lower_priority_day', 0);
  const first = simulateSequenceDay(draft, sequence.id, 0);
  assert.deepEqual(first.errors, []); assert.equal(cancelled(first).length, 36); assert.equal(first.state[number], 40);
  assert.ok(cancelled(first).some(({ key }) => key === 'dayEnd'));
  assert.ok(!cancelled(first).some(({ key }) => key === 'dayStart' || key === 'slot:0:start'));
  sequence.eventGroups[0].interval = 0;
  sequence.eventGroups[0].end = { ...sequence.eventGroups[0].start };
  const nextDay = simulateSequenceDay(draft, sequence.id, 1);
  assert.deepEqual(nextDay.errors, []); assert.equal(cancelled(nextDay).length, 0);
  assert.deepEqual(simulateSequenceDay(draft, sequence.id, 0).state, first.state);
});

test('priority zero outranks main, main outranks negatives, and negative sources cannot cancel main or equals', () => {
  for (const [controller, expected] of [['Zero', ['Main', 'Negative', 'Lower negative']], ['Main', ['Negative', 'Lower negative']], ['Negative', ['Lower negative']]]) {
    const { draft, sequence } = flowControlFixture('cancel_lower_priority_day', 'dayStart', controller);
    const result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []);
    assert.equal(cancelled(result).length, expected.length * 11);
    assert.ok(cancelled(result).every(({ entry }) => expected.some((name) => entry.label.startsWith(`${name} [`))));
  }
});

test('slot control outside slot phases and standalone simulation record no-op messages without errors', () => {
  for (const target of ['dayStart', 'dayEnd']) {
    const { draft, sequence, control, number } = flowControlFixture('cancel_lower_priority_slot', target);
    const result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, 0); assert.equal(result.state[number], 76);
    assert.equal(result.calls.find((call) => call.kind === 'control').reason, 'controlNoSlotContext');
    const single = simulateSlot(draft, control.id);
    assert.deepEqual(single.errors, []); assert.equal(single.calls[0].reason, 'controlNoDayContext'); assert.equal(single.calls[0].applied, false);
    assert.equal(single.state[number], 11); assert.equal(single.unmodeled, false);
  }
});

test('conditional control runs only in selected branches', () => {
  const { draft, sequence, control, number, days, activity } = flowControlFixture();
  control.branches = [{ condition: { kind: 'comparison', operand_a: { type: 'reference', reference_id: number }, comparator: '<', operand_b: { type: 'constant', value: 0 } }, task: { builtin: 'cancel_lower_priority_day' } }, { condition: null, task: structuredClone(activity.branches[0].task) }];
  const conditional = simulateSequenceDay(draft, sequence.id, 0);
  assert.deepEqual(conditional.errors, []); assert.equal(cancelled(conditional).length, 0);
  days.High.slotIds[0] = control.id; control.branches[0].condition = null; control.branches.splice(1);
  const triggered = simulateSequenceDay(draft, sequence.id, 0);
  assert.ok(cancelled(triggered).length > 0);
  assert.ok(cancelled(triggered).every(({ entry }) => entry.cancelledBy.scope === 'day'));
});

test('branch-to-sequence macro calls inherit event priority and independent cancellation scopes accumulate', () => {
  const { draft, sequence, control, macro, days, number } = flowControlFixture('cancel_lower_priority_day', 'dayStart', 'Main');
  const branch = createTaskMacro('Branch controller', 'branch');
  branch.branches[0].task = { task_macro_id: macro.id, arguments: {} }; draft.taskMacros.push(branch);
  control.branches[0].task = { task_macro_id: branch.id, arguments: {} };
  // The main source cancels negative events all day; High cancels the main and Zero for slot 1 only.
  const scoped = structuredClone(control); scoped.id = crypto.randomUUID(); scoped.name = 'Slot controller'; scoped.branches = [{ condition: null, task: { builtin: 'cancel_lower_priority_slot' } }]; draft.slots.push(scoped);
  days.High.slotEvents[0].startId = scoped.id;
  const compiled = compileProject(draft); assert.deepEqual(compiled.errors, []);
  const result = simulateSequenceDay(draft, sequence.id, 0);
  assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, 28);
  assert.ok(cancelled(result).some(({ entry }) => entry.cancelledBy.scope === 'slot'));
  assert.ok(cancelled(result).some(({ entry }) => entry.cancelledBy.scope === 'day'));
  assert.ok(result.calls.some((call) => call.context.name === 'Main' && call.context.phaseKey === 'slot:1:main'));
  assert.equal(result.state[number], 47);
});

test('fixed zero-parameter definitions round-trip through projects and environments, and export explicit runtime semantics', () => {
  const { draft, sequence, control } = flowControlFixture();
  // Cover direct slots, sequence macro steps, and branch macro actions.
  control.branches.push({ condition: null, task: { builtin: 'cancel_lower_priority_day' } });
  control.branches[0].condition = { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: 1 }, operand_b: { type: 'constant', value: 2 } };
  const definition = builtinTaskDefinitions(draft.builtinTasks, translator('en')).find((item) => item.id.endsWith('_slot'));
  assert.equal(definition.category, 'flowControl'); assert.deepEqual(definition.parameters, []);
  draft.builtinTasks = changeBuiltinDefinition(draft.builtinTasks, definition, { ...definition, display_name: 'Override slot', icon: 'tabler:check', engine_key: 'custom.cancel' });
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  const loaded = projectToDraft(project.data); assert.deepEqual(loaded.builtinTasks, draft.builtinTasks);
  assert.deepEqual(simulateSequenceDay(loaded, sequence.id, 0).errors, []);
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []); assert.deepEqual(validateEnvironment(env.data), []);
  const imported = prepareEnvironmentImport(draft, env.data); assert.deepEqual(imported.errors, []);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  const step = runtime.data.task_macros[draft.taskMacros[0].id].steps[0];
  assert.deepEqual(step, { task_key: 'custom.cancel', flow_control: 'cancel_lower_priority', scope: 'slot' });
  assert.deepEqual(runtime.data.slots[control.id].branches[1].task, { task_key: 'control.day', flow_control: 'cancel_lower_priority', scope: 'day' });
  assert.deepEqual(runtime.data.environment_requirements.tasks.find((item) => item.engine_key === 'custom.cancel').parameters, []);
  delete draft.builtinTasks.cancel_lower_priority_slot.engine_key;
  assert.ok(compileRuntime(draft).errors.some((error) => error.path === '/builtin_tasks/cancel_lower_priority_slot/engine_key'));
  for (const value of [{ builtin: 'cancel_lower_priority_slot', target_variable_id: control.id }, { builtin: 'cancel_lower_priority_day', arguments: {} }, { builtin: 'unknown' }]) {
    const bad = structuredClone(project.data); bad.slots[control.id].branches[1].task = value;
    assert.ok(validateDocument(bad).length);
  }
  const badEnv = structuredClone(env.data); badEnv.builtin_tasks.cancel_lower_priority_slot.parameters = { target: { display_name: 'Invalid' } };
  assert.ok(validateEnvironment(badEnv).length);
  const badRuntime = structuredClone(runtime.data); badRuntime.task_macros[draft.taskMacros[0].id].steps[0].scope = 'week';
  assert.ok(validateRuntimeDocument(badRuntime).length);
});
