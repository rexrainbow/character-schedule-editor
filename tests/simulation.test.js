import { createActionSlot as createSlot } from './slotFixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateSlot, simulationInitialValues, evaluateSimulationExpressions } from './reference/simulationModel.js';
import { createProject } from '../src/core/model.js';
import { createTaskMacro } from '../src/core/taskMacroModel.js';
import { addComputedNode } from '../src/core/operandModel.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { referenceFixture } from './referenceFixture.js';
const constant = (value) => ({ type: 'constant', value });
const ref = (id) => ({ type: 'reference', reference_id: id });
const compare = (a, comparator, b) => ({ kind: 'comparison', operand_a: a, comparator, operand_b: b });
const flat = (events) => events.flatMap((event) => [event, ...flat(event.children ?? [])]);

test('first matching branch and ALL/ANY short circuits skip unsafe expressions without mutating inputs', () => {
  const { draft, number, actions } = builtinVariableFixture();
  const unsafe = compare({ type: 'expression', operator: '/', operand_a: constant(1), operand_b: constant(0) }, '>', constant(0));
  const slot = draft.slots[0];
  slot.branches = [{ condition: { kind: 'group', mode: 'ALL', items: [compare(ref(number), '<', constant(0)), unsafe] }, task: actions[0] }, { condition: { kind: 'group', mode: 'ANY', items: [compare(ref(number), '>', constant(0)), unsafe] }, task: actions[0] }, { condition: null, task: actions[1] }];
  const values = simulationInitialValues(draft), before = structuredClone({ draft, values });
  const result = simulateSlot(draft, slot.id, values);
  assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 1); assert.equal(result.state[number], 8);
  assert.deepEqual(result.trace.map((event) => [event.result, !!event.skipped]), [[false, false], [true, false], [undefined, true]]);
  assert.equal(flat(result.trace).filter((event) => event.kind === 'skipped').length, 2);
  assert.deepEqual({ draft, values }, before);
});

test('sequence writes affect subsequent expressions; reset uses initialization rather than test inputs', () => {
  const { draft, number, boolean, text, sequence } = builtinVariableFixture();
  sequence.steps = [
    { id: crypto.randomUUID(), task: { builtin: 'increment_variable', target_variable_id: number, value: constant(5) } },
    { id: crypto.randomUUID(), task: { builtin: 'set_variable', target_variable_id: number, value: { type: 'expression', operator: '*', operand_a: ref(number), operand_b: constant(2) } } },
    { id: crypto.randomUUID(), task: { builtin: 'toggle_variable', target_variable_id: boolean } },
    { id: crypto.randomUUID(), task: { builtin: 'reset_variable', target_variable_id: text } },
  ]; sequence.parameters = [];
  draft.slots[0].branches[0].task = { task_macro_id: sequence.id, arguments: {} };
  const values = { ...simulationInitialValues(draft), [number]: 20, [text]: 'Changed' };
  const result = simulateSlot(draft, draft.slots[0].id, values);
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 50); assert.equal(result.state[boolean], false); assert.equal(result.state[text], 'Start');
  assert.equal(result.changes.length, 3); assert.equal(values[text], 'Changed');
});

test('computed macros recompute after writes; branch macros select sequences and preserve scoped parameters', () => {
  const { draft, number, sequence, branch } = builtinVariableFixture();
  const added = addComputedNode(draft.operandNodes, null, 'Double counter'); draft.operandNodes = added.nodes;
  draft.operandNodes[added.id].definition = { kind: 'number', expression: { type: 'expression', operator: '*', operand_a: ref(number), operand_b: constant(2) } };
  const localId = crypto.randomUUID(); branch.parameters = [{ id: localId, display_name: 'Input', type: 'number' }];
  branch.branches = [{ condition: compare({ type: 'parameter_reference', parameter_id: localId }, '>', constant(0)), task: { task_macro_id: sequence.id, arguments: { [sequence.parameters[0].id]: { type: 'parameter_reference', parameter_id: localId } } } }, { condition: null, task: { builtin: 'reset_variable', target_variable_id: number } }];
  sequence.steps = [{ id: crypto.randomUUID(), task: { builtin: 'increment_variable', target_variable_id: number, value: { type: 'parameter_reference', parameter_id: sequence.parameters[0].id } } }, { id: crypto.randomUUID(), task: { builtin: 'set_variable', target_variable_id: number, value: { type: 'expression_macro_reference', expression_macro_id: added.id } } }];
  draft.slots[0].branches[0].task = { task_macro_id: branch.id, arguments: { [localId]: constant(3) } };
  const result = simulateSlot(draft, draft.slots[0].id);
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 26);
  assert.equal(evaluateSimulationExpressions(draft, result.state)[added.id].value, 52);
});

test('engine task effects remain opaque and forwarded variable arguments remain references', () => {
  const { draft, macro, macroTarget, local, slot } = referenceFixture();
  slot.branches[0].task = { task_macro_id: macro.id, arguments: { [macroTarget.id]: { type: 'variable_reference', reference_id: local }, [macro.parameters[1].id]: constant(2) } };
  const input = simulationInitialValues(draft), result = simulateSlot(draft, slot.id, input);
  assert.deepEqual(result.errors, []); assert.equal(result.unmodeled, true); assert.deepEqual(result.state, input);
  assert.deepEqual(result.calls[0].arguments[0].value, { type: 'variable_reference', reference_id: local });
  assert.equal(result.calls[0].arguments[1].value, 2);
});

test('empty macro calls complete, while invalid inputs, writes, cycles and division report precise errors', () => {
  const { draft, number, readonly } = builtinVariableFixture(), slot = draft.slots[0];
  const empty = createTaskMacro('Debug only'); draft.taskMacros = [empty]; slot.branches[0].task = { task_macro_id: empty.id, arguments: {} };
  const result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0); assert.equal(result.trace[0].children[0].empty, true);
  const values = simulationInitialValues(draft); values[number] = Infinity;
  assert.equal(simulateSlot(draft, slot.id, values).errors[0].path, `/values/${number}`);
  slot.branches[0].task = { builtin: 'set_variable', target_variable_id: readonly, value: constant(1) };
  assert.ok(simulateSlot(draft, slot.id).errors.some((e) => e.key === 'readonlyTarget'));
  slot.branches = [{ condition: compare({ type: 'expression', operator: '/', operand_a: constant(1), operand_b: constant(0) }, '>', constant(0)), task: { task_macro_id: empty.id, arguments: {} } }, { condition: null, task: { task_macro_id: empty.id, arguments: {} } }];
  assert.ok(simulateSlot(draft, slot.id).errors.some((e) => e.key === 'divisionByZero' && e.path.includes('/operand_b')));
  const added = addComputedNode(draft.operandNodes, null, 'Cycle'); draft.operandNodes = added.nodes;
  draft.operandNodes[added.id].definition.expression = { type: 'expression_macro_reference', expression_macro_id: added.id };
  assert.equal(evaluateSimulationExpressions(draft, simulationInitialValues(draft))[added.id].error.key, 'computedCycle');
});
