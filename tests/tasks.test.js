import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/computed-example.json' with { type: 'json' };
import { compileProject, createProject, createSlot, projectToDraft, validateDocument } from '../src/model.js';
import { changeParameterType, createParameter, createTask, deleteParameter, deleteTask, duplicateTask, taskUses } from '../src/taskModel.js';
import { applyComputedDefinition, changeOperandType, deleteOperandNode } from '../src/operandModel.js';

const constant = (value) => ({ type: 'constant', value });
function setup() {
  const draft = projectToDraft(example), task = createTask('Move');
  task.parameters = ['Destination', 'Speed', 'Ready'].map(createParameter);
  task.parameters[0].type = 'string'; task.parameters[2].type = 'boolean';
  draft.tasks.push(task);
  draft.slots[0].branches[0].task = { task_id: task.id, arguments: Object.fromEntries(task.parameters.map((p, i) => [p.id, constant(['Shop', 2, true][i])])) };
  return { draft, task, use: draft.slots[0].branches[0].task };
}
test('task definitions and native typed argument expressions round-trip by UUID', () => {
  const { draft, task, use } = setup();
  const macro = Object.keys(draft.operandNodes).find((id) => draft.operandNodes[id].display_name === 'adjusted_energy');
  use.arguments[task.parameters[1].id] = { type: 'expression', operator: '+', operand_a: { type: 'expression_macro_reference', expression_macro_id: macro }, operand_b: constant(3) };
  const compiled = compileProject(draft); assert.deepEqual(compiled.errors, []);
  assert.deepEqual(compileProject(projectToDraft(compiled.data)), compiled);
  task.display_name = 'Renamed'; task.parameters.reverse(); task.parameters[0].display_name = 'Renamed param';
  assert.deepEqual(compileProject(draft).errors, []); assert.equal(use.task_id, task.id);
});
test('all parameters required, unknown arguments and incompatible values reject at their position', () => {
  const { draft, task, use } = setup(), id = task.parameters[1].id;
  delete use.arguments[id]; assert.ok(compileProject(draft).errors.some((e) => e.path.endsWith(`/arguments/${id}`)));
  use.arguments[id] = constant('bad'); assert.ok(compileProject(draft).errors.some((e) => e.key === 'parameterTypeMismatch'));
  use.arguments[id] = constant(2); const unknown = crypto.randomUUID(); use.arguments[unknown] = constant(1);
  assert.ok(compileProject(draft).errors.some((e) => e.key === 'unknownParameter' && e.path.endsWith(unknown)));
  delete use.arguments[unknown]; task.parameters.push(createParameter('Added'));
  assert.ok(compileProject(draft).errors.some((e) => e.key === 'chooseOperand'));
});
test('task deletion is protected; parameter deletion removes values and copying regenerates IDs', () => {
  const { draft, task, use } = setup(); assert.equal(taskUses(draft.slots, task.id).length, 1);
  assert.throws(() => deleteTask(draft, task.id), /taskInUse/);
  const p = task.parameters[0], next = deleteParameter(draft, task.id, p.id);
  assert.equal(Object.hasOwn(next.slots[0].branches[0].task.arguments, p.id), false);
  assert.equal(Object.hasOwn(use.arguments, p.id), true); assert.deepEqual(compileProject(next).errors, []);
  const copied = duplicateTask(task); assert.notEqual(copied.id, task.id); assert.equal(copied.display_name, 'Move (副本)');
  copied.parameters.forEach((p, i) => assert.notEqual(p.id, task.parameters[i].id));
  copied.parameters[0].display_name = 'Copy'; assert.equal(task.parameters[0].display_name, 'Destination');
  assert.equal(deleteTask({ ...draft, tasks: [...draft.tasks, copied] }, copied.id).tasks.length, draft.tasks.length);
});
test('parameter and variable type edits protect task expressions including computed results', () => {
  const { draft, task, use } = setup(), p = task.parameters[1];
  assert.equal(changeParameterType(draft, task.id, p.id, 'string').draft, draft);
  assert.equal(changeParameterType(draft, task.id, p.id, 'number').blocked.length, 0);
  const macro = Object.keys(draft.operandNodes).find((id) => draft.operandNodes[id].display_name === 'adjusted_energy');
  use.arguments[p.id] = { type: 'expression_macro_reference', expression_macro_id: macro };
  const result = applyComputedDefinition(draft.operandNodes, draft.slots, macro, { kind: 'boolean', condition: { kind: 'comparison', operand_a: constant(1), comparator: '==', operand_b: constant(1) } }, draft.tasks);
  assert.ok(result.errors.some((e) => e.key === 'parameterTypeMismatch' && e.path.includes('/task/arguments/')));
  // An otherwise-unused external variable is protected solely by a nested task argument.
  const id = crypto.randomUUID(); draft.operandNodes[id] = { node_type: 'value', display_name: 'TaskOnly', value_type: 'number', parent_id: null, order: 1 };
  use.arguments[p.id] = { type: 'expression', operator: '+', operand_a: { type: 'reference', reference_id: id }, operand_b: constant(1) };
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, id), /nodeInUse/);
  assert.equal(changeOperandType(draft.operandNodes, draft.slots, id, 'string', draft.tasks).nodes, draft.operandNodes);
});
test('imports reject old task shapes, dangling tasks, duplicate parameter IDs and malformed definitions', () => {
  const { draft, task } = setup(), data = compileProject(draft).data;
  for (const value of ['old task', { display_name: 'old' }, { task_id: crypto.randomUUID(), arguments: {} }]) {
    const bad = structuredClone(data); Object.values(bad.slots)[0].branches[0].task = value;
    assert.ok(validateDocument(bad).some((e) => e.path.includes('/task')));
  }
  const bad = structuredClone(data); bad.tasks[task.id].parameters.push(structuredClone(bad.tasks[task.id].parameters[0]));
  assert.ok(validateDocument(bad).some((e) => e.key === 'duplicateParameter'));
  for (const value of [null, 42, { display_name: 42, parameters: 42 }, { display_name: 'X', parameters: [null] }]) {
    const bad = structuredClone(data); bad.tasks[task.id] = value; assert.ok(validateDocument(bad).length);
  }
});
test('blank projects allow no task definitions but a new slot requires a task', () => {
  const draft = createProject(); assert.deepEqual(compileProject(draft).errors, []);
  draft.slots.push(createSlot([], 'New')); assert.ok(compileProject(draft).errors.some((e) => e.key === 'chooseTask'));
});
