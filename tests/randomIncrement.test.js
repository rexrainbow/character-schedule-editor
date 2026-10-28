import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { sequenceEventsFixture } from './sequenceEventsFixture.js';
import { randomOffset, seededRandom } from '../src/core/randomValues.js';
import { clampVariable } from '../src/core/variableBounds.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { compileEnvironment, createProjectWithEnvironment } from '../src/core/environmentModel.js';
import { simulateSlot, simulationInitialValues, simulationValueErrors } from './reference/simulationModel.js';
import { simulateSequenceDay } from './reference/daySimulationModel.js';
import { changeOperandType, deleteOperandNode } from '../src/core/operandModel.js';
import { deleteMacroParameter, duplicateTaskMacro } from '../src/core/taskMacroModel.js';
import { translator } from '../src/i18n/index.js';
const constant = (value) => ({ type: 'constant', value }), t = translator('en');
function fixture(integer = false) {
  const f = builtinVariableFixture();
  f.draft.operandNodes[f.number].integer_only = integer;
  const task = f.draft.slots[0].branches[0].task;
  task.value = constant(10); task.random_amplitude = constant(2);
  return { ...f, task, slot: f.draft.slots[0] };
}
test('zero amplitude preserves increments and never consumes randomness; seeded samples reproduce', () => {
  assert.equal(randomOffset(0, false, () => { throw new Error('must not draw'); }), 0);
  assert.equal(randomOffset(.9, true, () => { throw new Error('integer interval is just zero'); }), 0);
  const { draft, task, slot, number } = fixture(); task.random_amplitude = constant(0);
  const zero = simulateSlot(draft, slot.id); delete task.random_amplitude;
  const missing = simulateSlot(draft, slot.id); assert.equal(zero.state[number], 20); assert.deepEqual(zero.calls, missing.calls);
  const a = seededRandom('example'), b = seededRandom('example'), c = seededRandom('other');
  const sequence = Array.from({ length: 20 }, () => a());
  assert.deepEqual(sequence, Array.from({ length: 20 }, () => b())); assert.notDeepEqual(sequence, Array.from({ length: 20 }, () => c()));
});
test('integer draws include both endpoints and are discrete, while real offsets stay within amplitude', () => {
  const counts = new Map(), random = seededRandom('distribution');
  for (let i = 0; i < 5000; i++) { const n = randomOffset(2.9, true, random); assert.ok(Number.isInteger(n)); counts.set(n, (counts.get(n) ?? 0) + 1); }
  assert.deepEqual([...counts.keys()].sort((a, b) => a - b), [-2, -1, 0, 1, 2]); assert.ok([...counts.values()].every((count) => count > 800 && count < 1200));
  const { draft, slot, number } = fixture(false);
  const a = simulateSlot(draft, slot.id, undefined, undefined, t, 'sample'), b = simulateSlot(draft, slot.id, undefined, undefined, t, 'sample');
  assert.deepEqual(a.errors, []); assert.equal(a.state[number], b.state[number]); assert.ok(a.state[number] >= 18 && a.state[number] <= 22); assert.ok(!Number.isInteger(a.calls[0].random_offset));
  assert.equal(a.calls[0].random_amplitude, 2); assert.equal(a.calls[0].increment, 10);
});
test('integer writes truncate toward zero before bounds and reject fractional input state', () => {
  const { draft, number, task, slot } = fixture(true), node = draft.operandNodes[number];
  task.builtin = 'set_variable'; task.value = constant(-3.8); delete task.random_amplitude;
  const result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.state[number], -3);
  assert.equal(clampVariable({ value_type: 'number', integer_only: true, min_value: -2 }, -3.8), -2);
  assert.equal(Object.is(clampVariable({ value_type: 'number', integer_only: true }, -.8), -0), false);
  node.max_value = 11; task.builtin = 'increment_variable'; task.value = constant(2.9);
  assert.equal(simulateSlot(draft, slot.id).state[number], 11);
  const values = simulationInitialValues(draft); values[number] = 10.5;
  assert.ok(simulationValueErrors(draft, values).some((error) => error.key === 'simulationIntegerValue'));
});
test('integer metadata and random expressions round-trip through all formats and schemas', () => {
  const { draft, number, slot, task } = fixture(true), node = draft.operandNodes[number]; node.min_value = 0; node.max_value = 30;
  task.random_amplitude = { type: 'expression', operator: '+', operand_a: constant(1), operand_b: constant(1) };
  const project = compileProject(draft); assert.deepEqual(project.errors, []); assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []); assert.equal(createProjectWithEnvironment('New', 3, env.data).operandNodes[number].integer_only, true);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.environment_variables[0].children.find((item) => item.id === number).integer_only, true);
  assert.equal(runtime.data.environment_requirements.variables.find((item) => item.name === 'Counter').integer_only, true);
  assert.deepEqual(runtime.data.slots[slot.id].branches[0].task.random_amplitude, task.random_amplitude);
  for (const key of ['initial_value', 'min_value', 'max_value']) { const bad = structuredClone(project.data); bad.operand_nodes[number][key] = .5; assert.ok(validateDocument(bad).length); }
  const changed = changeOperandType(draft.operandNodes, [], number, 'string'); assert.equal(changed.nodes[number].integer_only, undefined); assert.equal(changed.nodes[number].min_value, undefined);
});
test('invalid amplitudes fail before writes, including dynamically negative expressions', () => {
  const { draft, slot, task, number } = fixture(); task.random_amplitude = constant(-1);
  assert.ok(compileProject(draft).errors.length);
  task.random_amplitude = { type: 'expression', operator: '-', operand_a: constant(0), operand_b: constant(1) };
  assert.deepEqual(compileProject(draft).errors, []);
  const result = simulateSlot(draft, slot.id); assert.ok(result.errors.some((error) => error.key === 'invalidRandomAmplitude' && error.path.endsWith('/random_amplitude'))); assert.equal(result.state[number], 10);
  draft.operandNodes[number].integer_only = true; task.random_amplitude = constant(Number.MAX_SAFE_INTEGER);
  assert.ok(simulateSlot(draft, slot.id).errors.some((error) => error.key === 'randomAmplitudeTooLarge'));
  const invalid = compileProject(fixture().draft).data;
  invalid.slots[Object.keys(invalid.slots)[0]].branches[0].task.builtin = 'set_variable'; assert.ok(validateDocument(invalid).length);
});
test('amplitude expressions participate in variable protection, local parameter protection and copying', () => {
  const { draft, slot, task, readonly, sequence } = fixture();
  task.random_amplitude = { type: 'reference', reference_id: readonly };
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, readonly, draft.taskMacros, draft.tasks), /nodeInUse/);
  assert.ok(changeOperandType(draft.operandNodes, draft.slots, readonly, 'string', draft.tasks, draft.taskMacros).blocked.length);
  sequence.steps[0].task.value = constant(1); sequence.steps[0].task.random_amplitude = { type: 'parameter_reference', parameter_id: sequence.parameters[0].id };
  assert.throws(() => deleteMacroParameter(draft, sequence.id, sequence.parameters[0].id), /macroParameterInUse/);
  const copy = duplicateTaskMacro(sequence); assert.equal(copy.steps[0].task.random_amplitude.parameter_id, copy.parameters[0].id);
});
test('day simulation shares one seeded stream across assignments and records each offset', () => {
  const base = sequenceEventsFixture(), f = fixture(true);
  base.draft.operandNodes = f.draft.operandNodes; base.draft.builtinTasks = f.draft.builtinTasks; base.draft.slots = f.draft.slots; base.draft.taskMacros = f.draft.taskMacros;
  base.main.dayStartId = f.slot.id; base.main.slotIds[0] = f.slot.id;
  const result = simulateSequenceDay(base.draft, base.sequence.id, 0, undefined, undefined, t, {}, {}, 'day-seed');
  assert.deepEqual(result.errors, []); const random = seededRandom('day-seed');
  const expected = [randomOffset(2, true, random), randomOffset(2, true, random)];
  assert.deepEqual(result.calls.map((call) => call.random_offset), expected); assert.equal(result.state[f.number], 30 + expected[0] + expected[1]);
});
