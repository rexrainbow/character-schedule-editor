import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileEnvironment, validateEnvironment, createProjectWithEnvironment } from '../src/core/environmentModel.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { changeOperandType, duplicateOperandSubtree } from '../src/core/operandModel.js';
import { simulateSlot, simulationInitialValues } from './reference/simulationModel.js';

test('optional numeric bounds survive both layers, project/environment/runtime exports and copies', () => {
  const { draft, number, text } = builtinVariableFixture();
  Object.assign(draft.operandNodes[number], { min_value: 0, max_value: 100 });
  Object.assign(draft.operandNodes[text], { value_type: 'number', initial_value: 5, min_value: -10 });
  // Remove unrelated string-reset consumers so the type change is valid.
  draft.slots = []; draft.taskMacros = [];
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(projectToDraft(project.data).operandNodes, draft.operandNodes);
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []);
  assert.equal(createProjectWithEnvironment('Imported', 3, env.data).operandNodes[number].max_value, 100);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.environment_variables[0].children.find((node) => node.id === number).min_value, 0);
  assert.equal(runtime.data.application_variables[0].min_value, -10);
  assert.equal(Object.hasOwn(runtime.data.application_variables[0], 'max_value'), false);
  const copy = duplicateOperandSubtree(draft.operandNodes, number); assert.equal(copy.nodes[copy.id].max_value, 100);
  const changed = changeOperandType(draft.operandNodes, [], number, 'string');
  assert.deepEqual(changed.blocked, []); assert.equal(Object.hasOwn(changed.nodes[number], 'min_value'), false);
  assert.equal(Object.hasOwn(changed.nodes[number], 'max_value'), false);
});

test('invalid bounds and out-of-range initial values fail at their fields for projects and environments', () => {
  const { draft, number, text } = builtinVariableFixture(); const valid = compileProject(draft).data;
  for (const [changes, field] of [[{ min_value: 11 }, 'initial_value'], [{ max_value: 9 }, 'initial_value'], [{ min_value: 20, max_value: 5 }, 'max_value'], [{ min_value: null }, 'min_value'], [{ max_value: '100' }, 'max_value']]) {
    const data = structuredClone(valid); Object.assign(data.operand_nodes[number], changes);
    assert.ok(validateDocument(data).some((error) => error.path === `/operand_nodes/${number}/${field}`));
  }
  const badString = structuredClone(valid); badString.operand_nodes[text].min_value = 0; assert.ok(validateDocument(badString).length);
  const env = compileEnvironment(draft).data; env.operand_nodes[number].max_value = 9; assert.ok(validateEnvironment(env).some((error) => error.key === 'initialValueOutsideBounds'));
  for (const value of [NaN, Infinity, -Infinity]) {
    draft.operandNodes[number].min_value = value;
    assert.ok(compileProject(draft).errors.some((error) => error.key === 'invalidVariableBound'));
  }
});

test('numeric writes clamp upper, lower, one-sided and fixed bounds while unrestricted writes remain unchanged', () => {
  for (const [bounds, kind, amount, expected] of [
    [{ min_value: 0, max_value: 12 }, 'increment_variable', 10, 12],
    [{ min_value: 0 }, 'increment_variable', -20, 0],
    [{ max_value: 12 }, 'set_variable', 30, 12],
    [{ min_value: 0, max_value: 10 }, 'set_variable', -2, 0],
    [{ min_value: 10, max_value: 10 }, 'increment_variable', 50, 10],
    [{}, 'increment_variable', 10, 20],
  ]) {
    const { draft, number } = builtinVariableFixture(); Object.assign(draft.operandNodes[number], bounds);
    draft.slots[0].branches[0].task = { builtin: kind, target_variable_id: number, value: { type: 'constant', value: amount } };
    const result = simulateSlot(draft, draft.slots[0].id);
    assert.deepEqual(result.errors, []); assert.equal(result.state[number], expected);
    const event = result.trace[0].children[0];
    assert.equal(event.children.some((child) => child.kind === 'clamp'), Object.keys(bounds).length > 0);
  }
});

test('clamped writes are visible to subsequent macro steps and reset uses valid initial values', () => {
  const { draft, number, sequence } = builtinVariableFixture();
  Object.assign(draft.operandNodes[number], { min_value: 0, max_value: 12 });
  sequence.parameters = []; sequence.steps = [
    { id: crypto.randomUUID(), task: { builtin: 'increment_variable', target_variable_id: number, value: { type: 'constant', value: 10 } } },
    { id: crypto.randomUUID(), task: { builtin: 'increment_variable', target_variable_id: number, value: { type: 'constant', value: -5 } } },
    { id: crypto.randomUUID(), task: { builtin: 'reset_variable', target_variable_id: number } },
  ];
  draft.slots[0].branches[0].task = { task_macro_id: sequence.id, arguments: {} };
  const result = simulateSlot(draft, draft.slots[0].id);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.calls.map((call) => call.after), [12, 7, 10]);
  const values = simulationInitialValues(draft); values[number] = 20;
  assert.ok(simulateSlot(draft, draft.slots[0].id, values).errors.some((error) => error.key === 'simulationValueOutsideBounds'));
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  runtime.data.environment_variables[0].children.find((node) => node.id === number).max_value = 5;
  assert.ok(validateRuntimeDocument(runtime.data).some((error) => error.key === 'initialValueOutsideBounds'));
});
