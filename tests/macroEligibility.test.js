import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityMacroFixture, constant, reference } from './priorityMacroFixture.js';
import { createTaskMacro, createTaskStep, changeMacroMode } from '../src/core/taskMacroModel.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { simulateSlot, simulationInitialValues } from './reference/simulationModel.js';
import { addOperandNode } from '../src/core/operandModel.js';
const comparison = (value) => ({ kind: 'comparison', operand_a: constant(value), comparator: '==', operand_b: constant(true) });
const call = (id) => ({ task_macro_id: id, arguments: {} });
const step = (task) => ({ ...createTaskStep(), task });
const flatten = (events) => events.flatMap((event) => [event, ...flatten(event.children ?? [])]);

test('all three macro modes check their own eligibility before evaluating content, including nested calls', () => {
  for (const mode of ['sequence', 'branch', 'priority']) {
    const { draft, slot, number } = priorityMacroFixture(), gated = createTaskMacro('Gated', mode);
    gated.eligibility = comparison(false);
    const action = { builtin: 'increment_variable', target_variable_id: number, value: constant(100) };
    if (mode === 'sequence') gated.steps = [step(action)];
    if (mode === 'branch') gated.branches[0].task = action;
    if (mode === 'priority') gated.candidates = [{ id: crypto.randomUUID(), task: call('missing') }];
    draft.taskMacros.push(gated); slot.branches[0].task = call(gated.id);
    const result = simulateSlot(draft, slot.id);
    assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0); assert.equal(result.state[number], 10);
    assert.ok(flatten(result.trace).some((event) => event.kind === 'guard' && event.result === false));
  }
});

test('priority accepts sequence, branch and priority candidates, and selecting an internally unmatched priority ends selection', () => {
  const { draft, slot, priority, number } = priorityMacroFixture();
  const branch = createTaskMacro('Branch candidate', 'branch'); branch.branches[0].task = { builtin: 'increment_variable', target_variable_id: number, value: constant(1) };
  const inner = createTaskMacro('Inner candidates', 'priority'), gated = createTaskMacro('Unavailable'); gated.eligibility = comparison(false);
  inner.candidates = [{ id: crypto.randomUUID(), task: call(gated.id) }];
  draft.taskMacros.push(branch, inner, gated);
  priority.candidates = [inner.id, branch.id].map((id) => ({ id: crypto.randomUUID(), task: call(id) }));
  let result = simulateSlot(draft, slot.id);
  assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0);
  assert.ok(flatten(result.trace).some((event) => event.kind === 'candidate' && event.skipped));
  inner.eligibility = comparison(false); result = simulateSlot(draft, slot.id);
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 11);
  branch.eligibility = comparison(false); result = simulateSlot(draft, slot.id); assert.equal(result.calls.length, 0);
  inner.eligibility = null; result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0);
  assert.deepEqual(compileProject(draft).errors, []);
});

test('general sequence and branch macro nesting is allowed without cycles and qualified candidates evaluate guards once', () => {
  const { draft, slot, number, priority } = priorityMacroFixture();
  const a = createTaskMacro('A'), b = createTaskMacro('B', 'branch');
  a.steps = [step(call(b.id))]; b.branches[0].task = { builtin: 'increment_variable', target_variable_id: number, value: constant(2) };
  b.eligibility = { kind: 'comparison', operand_a: reference(number), comparator: '>', operand_b: constant(0) };
  draft.taskMacros.push(a, b); priority.candidates = [{ id: crypto.randomUUID(), task: call(a.id) }];
  assert.deepEqual(compileProject(draft).errors, []);
  const result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.state[number], 12);
  assert.equal(flatten(result.trace).filter((event) => event.kind === 'condition' && event.path === `/task_macros/${b.id}/eligibility`).length, 1);
  const converted = changeMacroMode(draft, b.id, 'sequence').draft.taskMacros.find((item) => item.id === b.id);
  assert.deepEqual(converted.eligibility, b.eligibility);
});

test('legacy conditional imports migrate to an eligible sequence with one step and retain identity and callers', () => {
  const { draft, eligible, slot, number } = priorityMacroFixture(), data = compileProject(draft).data;
  const current = data.task_macros[eligible.id], { eligibility, steps, ...metadata } = current;
  data.task_macros[eligible.id] = { ...metadata, mode: 'conditional', condition: eligibility, task: steps[0].task };
  const before = structuredClone(data); assert.deepEqual(validateDocument(data), []);
  const loaded = projectToDraft(data), macro = loaded.taskMacros.find((item) => item.id === eligible.id);
  assert.equal(macro.mode, 'sequence'); assert.deepEqual(macro.eligibility, eligibility); assert.deepEqual(macro.steps[0].task, steps[0].task);
  assert.deepEqual(macro.parameters.map(({symbol, ...p}) => p), eligible.parameters); assert.deepEqual(data, before);
  const exported = compileProject(loaded); assert.deepEqual(exported.errors, []); assert.equal(exported.data.task_macros[eligible.id].condition, undefined);
  assert.equal(exported.data.task_macros[eligible.id].mode, 'sequence');
  const result = simulateSlot(loaded, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.state[number], 15);
});

test('runtime exports optional guards for every macro mode, and invalid guards report their position', () => {
  const { draft, priority, slot, readonly } = priorityMacroFixture();
  priority.eligibility = { kind: 'comparison', operand_a: { type: 'expression', operator: '/', operand_a: constant(1), operand_b: reference(readonly) }, comparator: '>', operand_b: constant(0) };
  const branch = createTaskMacro('Guarded branch', 'branch'); branch.eligibility = comparison(true); branch.branches = []; draft.taskMacros.push(branch);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.ok(runtime.data.task_macros[priority.id].eligibility); assert.ok(runtime.data.task_macros[branch.id].eligibility);
  const failed = simulateSlot(draft, slot.id, { ...simulationInitialValues(draft), [readonly]: 0 });
  assert.equal(failed.errors[0].path, `/task_macros/${priority.id}/eligibility/operand_a/operand_b`);
  const data = compileProject(draft).data; data.task_macros[branch.id].eligibility = { type: 'constant', value: true }; assert.ok(validateDocument(data).length);
});

test('a single work macro owns its stamina requirement and both actions; subsequent calls skip when exhausted', () => {
  const { draft, slot, number } = priorityMacroFixture(), added = addOperandNode(draft.operandNodes, null, 'value', 'Money', 'application');
  draft.operandNodes = added.nodes; draft.operandNodes[added.id].initial_value = 0;
  const work = createTaskMacro('Work'); work.eligibility = { kind: 'comparison', operand_a: reference(number), comparator: '>=', operand_b: constant(10) };
  work.steps = [step({ builtin: 'increment_variable', target_variable_id: number, value: constant(-10) }), step({ builtin: 'increment_variable', target_variable_id: added.id, value: constant(100) })];
  draft.taskMacros.push(work); slot.branches[0].task = call(work.id);
  assert.deepEqual(compileProject(draft).errors, []);
  const first = simulateSlot(draft, slot.id); assert.deepEqual(first.errors, []); assert.equal(first.state[number], 0); assert.equal(first.state[added.id], 100);
  const second = simulateSlot(draft, slot.id, first.state); assert.deepEqual(second.errors, []); assert.equal(second.calls.length, 0); assert.deepEqual(second.state, first.state);
});
