import test from 'node:test';
import assert from 'node:assert/strict';
import { flowControlFixture } from './flowControlFixture.js';
import { simulateSequenceDay } from '../src/daySimulationModel.js';
import { simulateSlot, simulationInitialValues } from '../src/simulationModel.js';
import { compileProject, projectToDraft, validateDocument } from '../src/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/runtimeModel.js';
import { compileEnvironment, validateEnvironment, prepareEnvironmentImport } from '../src/environmentModel.js';
import { builtinTaskDefinitions, createTakeover, changeBuiltinDefinition } from '../src/builtinTasks.js';
import { translator } from '../src/i18n.js';
import { constant, reference, parameter } from './priorityMacroFixture.js';
import { createTaskMacro, duplicateTaskMacro, macroParameterReferences } from '../src/taskMacroModel.js';
import { subtreeReferences, changeOperandType, deleteOperandNode } from '../src/operandModel.js';
const cancelled = (result) => result.trace.flatMap((phase) => phase.children.filter((entry) => entry.cancelled).map((entry) => ({ key: phase.path.split('/').at(-1), entry })));
const booleanCondition = (value) => ({ kind: 'comparison', comparator: '==', operand_a: constant(value), operand_b: constant(true) });

test('successful takeover covers both scopes and targets, preserves current steps, peers and expired scopes', () => {
  for (const [scope, target, expected] of [['slot', 'main', 3], ['slot', 'lower_priority', 12], ['day', 'main', 10], ['day', 'lower_priority', 40]]) {
    const { draft, sequence, number } = flowControlFixture({ scope, target });
    const before = structuredClone(draft), result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, expected);
    assert.equal(result.state[number], 76 - expected);
    assert.ok(result.calls.some((call) => call.kind === 'builtin' && call.context.name === 'High' && call.context.phaseKey === 'slot:0:start'));
    assert.ok(cancelled(result).every(({ entry }) => !/^(High|Peer) /.test(entry.label)));
    if (target === 'main') assert.ok(cancelled(result).every(({ entry }) => !entry.groupId));
    if (scope === 'slot') {
      assert.ok(cancelled(result).every(({ key }) => key.startsWith('slot:0:')));
      assert.ok(result.calls.some((call) => call.context.name === 'Main' && call.context.phaseKey === 'dayEnd'));
    } else assert.ok(cancelled(result).some(({ key }) => key === 'dayEnd'));
    assert.deepEqual(draft, before);
  }
});

test('failed takeover withdraws only the current source for a symmetric scope, including day end', () => {
  for (const [scope, expected] of [['slot', 2], ['day', 9]]) for (const target of ['main', 'lower_priority']) {
    const { draft, sequence, number } = flowControlFixture({ scope, target, condition: booleanCondition(false) });
    const result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, expected);
    assert.ok(cancelled(result).every(({ entry }) => entry.groupId === sequence.eventGroups[0].id));
    assert.equal(result.state[number], 76 - expected);
    assert.equal(result.calls.find((call) => call.kind === 'control').reason, 'takeoverFailed');
    assert.equal(result.calls.some((call) => call.context.name === 'High' && call.context.phaseKey === 'slot:1:start'), scope === 'slot');
  }
});

test('main target ignores caller priority, while lower target uses strict priorities and main sits between zero and negatives', () => {
  for (const [target, controller, expected] of [['main', 'Negative', 10], ['main', 'Main', 10], ['lower_priority', 'Zero', 33], ['lower_priority', 'Main', 22], ['lower_priority', 'Negative', 11]]) {
    const { draft, sequence } = flowControlFixture({ scope: 'day', target }, 'dayStart', controller);
    const result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, expected);
    if (target === 'main') assert.ok(cancelled(result).every(({ entry }) => !entry.groupId));
    else assert.ok(cancelled(result).every(({ entry }) => !entry.label.startsWith(`${controller} [`)));
  }
});

test('source identity is the occurrence rather than shared day UUID; conditions are evaluated once', () => {
  const { draft, sequence, days, macro, number } = flowControlFixture({ scope: 'day', condition: booleanCondition(false) }, 'dayStart');
  sequence.eventGroups[1].dayId = days.High.id; draft.weeks[0].days.mon = days.High.id;
  macro.steps[0].task.condition = { kind: 'comparison', comparator: '>', operand_a: reference(number), operand_b: constant(10) };
  macro.eligibility = { kind: 'comparison', comparator: '==', operand_a: reference(number), operand_b: constant(10) };
  // High fails at 10 then increments to 11. Its failure must not turn into success later.
  // Later occurrences fail the macro eligibility check and keep all subsequent assignments.
  const result = simulateSequenceDay(draft, sequence.id, 0);
  assert.deepEqual(result.errors, []);
  assert.equal(cancelled(result).length, 10);
  assert.ok(cancelled(result).every(({ entry }) => entry.groupId === sequence.eventGroups[0].id));
  assert.ok(result.calls.some((call) => call.context.groupId === sequence.eventGroups[1].id));
  assert.equal(result.calls.find((call) => call.kind === 'control').result, false);
  assert.deepEqual(simulateSequenceDay(draft, sequence.id, 0).state, result.state);
});

test('no-op contexts, cancelled unsafe expressions and visited condition errors produce correct outcomes', () => {
  for (const target of ['dayStart', 'dayEnd']) {
    const { draft, sequence, control } = flowControlFixture({}, target);
    const result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, 0);
    assert.equal(result.calls.find((call) => call.kind === 'control').reason, 'controlNoSlotContext');
    assert.equal(simulateSlot(draft, control.id).calls[0].reason, 'controlNoDayContext');
  }
  const { draft, sequence, days, activity, macro } = flowControlFixture();
  const unsafe = structuredClone(activity); unsafe.id = crypto.randomUUID(); unsafe.branches[0].task.target_variable_id = 'missing';
  draft.slots.push(unsafe); days.Main.slotIds[0] = unsafe.id;
  assert.deepEqual(simulateSequenceDay(draft, sequence.id, 0).errors, []);
  macro.steps[0].task.condition = { kind: 'comparison', comparator: '>', operand_a: { type: 'expression', operator: '/', operand_a: constant(1), operand_b: reference(Object.entries(draft.operandNodes).find(([, node]) => node.read_only)[0]) }, operand_b: constant(0) };
  const values = simulationInitialValues(draft); values[macro.steps[0].task.condition.operand_a.operand_b.reference_id] = 0;
  const failed = simulateSequenceDay(draft, sequence.id, 0, values);
  assert.ok(failed.errors.length); assert.ok(failed.errors[0].path.includes('/condition/'));
});

test('three fixed parameters and takeover calls round-trip through project/environment/runtime; old commands reject', () => {
  const { draft, macro } = flowControlFixture({ scope: 'day', target: 'main' });
  const definitions = builtinTaskDefinitions(draft.builtinTasks, translator('en'));
  assert.deepEqual(definitions.filter((item) => item.category === 'flowControl').map((item) => item.id), ['builtin:schedule_takeover']);
  const definition = definitions.at(-1); assert.deepEqual(definition.parameters.map((p) => p.id), ['condition', 'scope', 'target']);
  draft.builtinTasks = changeBuiltinDefinition(draft.builtinTasks, definition, { ...definition, display_name: 'Take control', engine_key: 'custom.takeover', parameters: definition.parameters.map((p) => ({ ...p, display_name: `Custom ${p.id}` })) });
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  const loaded = projectToDraft(project.data); assert.deepEqual(loaded.builtinTasks, draft.builtinTasks);
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []); assert.deepEqual(validateEnvironment(env.data), []);
  assert.deepEqual(prepareEnvironmentImport(draft, env.data).errors, []);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.task_macros[macro.id].steps[0], { task_key: 'custom.takeover', flow_control: 'takeover', condition: createTakeover().condition, scope: 'day', target: 'main' });
  assert.equal(runtime.data.environment_requirements.tasks.find((item) => item.engine_key === 'custom.takeover').parameters.length, 3);
  for (const change of [{ scope: 'invalid' }, { target: 'self' }, { condition: null }, { arguments: {} }, { builtin: 'cancel_main_day' }]) {
    const invalid = structuredClone(project.data); Object.assign(invalid.task_macros[macro.id].steps[0].task, change); assert.ok(validateDocument(invalid).length);
  }
  const badRuntime = structuredClone(runtime.data); badRuntime.task_macros[macro.id].steps[0].target = 'self'; assert.ok(validateRuntimeDocument(badRuntime).length);
});

test('takeover conditions participate in variable and parameter dependencies, copy remapping and environment reconnection', () => {
  const { draft, macro, number } = flowControlFixture();
  const p = { id: crypto.randomUUID(), display_name: 'Ready', type: 'boolean' }; macro.parameters = [p];
  macro.steps[0].task.condition = { kind: 'group', mode: 'ALL', items: [{ kind: 'comparison', comparator: '==', operand_a: parameter(p.id), operand_b: constant(true) }, { kind: 'comparison', comparator: '>=', operand_a: reference(number), operand_b: constant(10) }] };
  draft.slots.find((slot) => slot.branches[0].task.task_macro_id === macro.id).branches[0].task.arguments = { [p.id]: constant(true) };
  assert.ok(macroParameterReferences(macro, p.id).some((ref) => ref.path.includes('/task/condition')));
  assert.ok(subtreeReferences(draft.operandNodes, draft.slots, number, draft.taskMacros).some((ref) => ref.path.includes('/task/condition')));
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, number, draft.taskMacros));
  assert.ok(changeOperandType(draft.operandNodes, draft.slots, number, 'string', draft.tasks, draft.taskMacros).blocked.length);
  const copy = duplicateTaskMacro(macro); assert.equal(copy.steps[0].task.condition.items[0].operand_a.parameter_id, copy.parameters[0].id);
  const env = compileEnvironment(draft).data, nextId = crypto.randomUUID(); env.operand_nodes[nextId] = env.operand_nodes[number]; delete env.operand_nodes[number];
  const imported = prepareEnvironmentImport(draft, env); assert.deepEqual(imported.errors, []);
  assert.equal(imported.draft.taskMacros[0].steps[0].task.condition.items[1].operand_a.reference_id, nextId);
  assert.deepEqual(compileProject(draft).errors, []);
});
