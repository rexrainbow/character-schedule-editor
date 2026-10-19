import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/examples/task-sequence-example.json' with { type: 'json' };
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { applyComputedDefinition, changeOperandType, deleteOperandNode, formatOperand, nodeReferences, operandErrors, operandType } from '../src/core/operandModel.js';
import { changeParameterType, deleteParameter, deleteTask, taskUses } from '../src/core/taskModel.js';
import { changeMacroParameterType, createTaskMacro, createTaskStep, deleteMacroParameter, deleteTaskMacro, duplicateTaskMacro } from '../src/core/taskMacroModel.js';

const setup = () => { const draft = projectToDraft(example); return { draft, sequence: draft.taskMacros[0], task: draft.tasks.find((task) => task.display_name === 'Move') }; };
const constant = (value) => ({ type: 'constant', value });

test('task sequence, scoped parameters, nested expressions and branch invocation round-trip', () => {
  assert.deepEqual(validateDocument(example), []);
  const { draft, sequence, task } = setup(), value = sequence.steps[0].task.arguments[task.parameters[1].id];
  assert.deepEqual(compileProject(draft), { data: example, errors: [] });
  assert.equal(operandType(value.operand_a, draft.operandNodes, sequence.parameters), 'number');
  assert.equal(operandType(value.operand_a, draft.operandNodes), null);
  assert.match(formatOperand(value, draft.operandNodes, '?', sequence.parameters), /Parameters.Speed/);
  sequence.parameters[1].display_name = 'Velocity'; assert.match(formatOperand(value, draft.operandNodes, '?', sequence.parameters), /Parameters.Velocity/);
  sequence.parameters.reverse(); sequence.steps.reverse(); assert.deepEqual(compileProject(draft).errors, []);
});
test('scoped references cannot leak to slot conditions, arguments, macros or another sequence', () => {
  const { sequence, task } = setup(), local = sequence.steps[0].task.arguments[task.parameters[0].id];
  for (const target of ['condition','argument','macro','otherSequence']) {
    const data = structuredClone(example), slot = Object.values(data.slots)[0];
    if (target === 'condition') slot.branches[0].condition = { kind: 'comparison', operand_a: local, comparator: '==', operand_b: constant('Shop') };
    if (target === 'argument') slot.branches[0].task.arguments[sequence.parameters[0].id] = local;
    if (target === 'macro') { const id = Object.keys(data.expression_macros).find((id) => data.expression_macros[id].display_name === 'adjusted_energy'); data.expression_macros[id].definition.expression = local; }
    if (target === 'otherSequence') { const seq = structuredClone(data.task_macros[sequence.id]); seq.parameters = []; data.task_macros[crypto.randomUUID()] = seq; }
    const errors = validateDocument(data); assert.ok(errors.some((e) => e.key === 'missingMacroParameter'), target);
  }
});
test('numeric scopes enforce types, required values and division checks with precise paths', () => {
  const { draft, sequence, task } = setup(), value = sequence.steps[0].task.arguments[task.parameters[1].id];
  value.operand_a.parameter_id = sequence.parameters[0].id;
  assert.ok(compileProject(draft).errors.some((e) => e.key === 'numericOperandRequired' && e.path.includes('/task_macros/')));
  value.operand_a.parameter_id = crypto.randomUUID();
  assert.ok(compileProject(draft).errors.some((e) => e.key === 'missingMacroParameter' && e.path.endsWith('/parameter_id')));
  value.operand_a = constant(2); value.operator = '/'; value.operand_b = constant(0);
  assert.ok(operandErrors(value, draft.operandNodes, '', true, sequence.parameters).some((e) => e.key === 'divisionByZero'));
});
test('sequence copies regenerate entity, parameter and step UUIDs and remap only local references', () => {
  const { draft, sequence, task } = setup(), copied = duplicateTaskMacro(sequence);
  assert.notEqual(copied.id, sequence.id); assert.equal(copied.display_name, 'Shopping (副本)');
  copied.parameters.forEach((p, i) => assert.notEqual(p.id, sequence.parameters[i].id));
  copied.steps.forEach((step, i) => assert.notEqual(step.id, sequence.steps[i].id));
  const speed = copied.steps[0].task.arguments[task.parameters[1].id];
  assert.equal(speed.operand_a.parameter_id, copied.parameters[1].id);
  assert.deepEqual(speed.operand_b, sequence.steps[0].task.arguments[task.parameters[1].id].operand_b);
  draft.taskMacros.push(copied); assert.deepEqual(compileProject(draft).errors, []);
  copied.steps[0].task.arguments[task.parameters[0].id] = constant('Elsewhere');
  assert.equal(sequence.steps[0].task.arguments[task.parameters[0].id].type, 'parameter_reference');
});
test('tasks referenced only by sequence steps cannot be deleted and parameter edits include local scope', () => {
  const { draft, sequence, task } = setup();
  assert.ok(taskUses(draft.slots, task.id, draft.taskMacros).some((use) => use.step === 1));
  assert.throws(() => deleteTask(draft, task.id), /taskInUse/);
  assert.ok(changeParameterType(draft, task.id, task.parameters[0].id, 'number').blocked.some((use) => use.step === 1));
  assert.equal(changeParameterType(draft, task.id, task.parameters[0].id, 'string').blocked.length, 0);
  const removed = deleteParameter(draft, task.id, task.parameters[0].id);
  assert.equal(Object.hasOwn(removed.taskMacros[0].steps[0].task.arguments, task.parameters[0].id), false);
  assert.equal(Object.hasOwn(sequence.steps[0].task.arguments, task.parameters[0].id), true);
  assert.deepEqual(compileProject(removed).errors, []);
});
test('sequence and local parameter deletion/type edits protect internal and external uses', () => {
  const { draft, sequence } = setup(); assert.throws(() => deleteTaskMacro(draft, sequence.id), /taskMacroInUse/);
  assert.throws(() => deleteMacroParameter(draft, sequence.id, sequence.parameters[0].id), /macroParameterInUse/);
  assert.equal(changeMacroParameterType(draft, sequence.id, sequence.parameters[1].id, 'string').draft, draft);
  const next = structuredClone(draft); next.taskMacros[0].steps = [next.taskMacros[0].steps[1]];
  const deleted = deleteMacroParameter(next, sequence.id, sequence.parameters[0].id);
  assert.equal(Object.hasOwn(deleted.slots[0].branches[0].task.arguments, sequence.parameters[0].id), false);
  assert.deepEqual(compileProject(deleted).errors, []);
  assert.ok(changeMacroParameterType(next, sequence.id, sequence.parameters[1].id, 'string').blocked.some((ref) => ref.slot));
});
test('global and computed variable edits account for sequence step arguments', () => {
  const { draft, sequence, task } = setup(), id = crypto.randomUUID();
  draft.operandNodes[id] = { node_type: 'value', display_name: 'OnlyInStep', value_type: 'number', parent_id: null, order: 1 };
  sequence.steps[0].task.arguments[task.parameters[1].id] = { type: 'reference', reference_id: id };
  const refs = nodeReferences(draft.slots, id, draft.operandNodes, new Set(), draft.taskMacros);
  assert.equal(refs.length, 1); assert.ok(refs[0].path.includes('/task_macros/'));
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, id, draft.taskMacros), /nodeInUse/);
  assert.equal(changeOperandType(draft.operandNodes, draft.slots, id, 'string', draft.tasks, draft.taskMacros).nodes, draft.operandNodes);
  draft.operandNodes[id] = { ...draft.operandNodes[id], source: 'computed', definition: { kind: 'number', expression: constant(1) } };
  sequence.steps[0].task.arguments[task.parameters[1].id] = { type: 'expression_macro_reference', expression_macro_id: id };
  const result = applyComputedDefinition(draft.operandNodes, draft.slots, id, { kind: 'boolean', condition: { kind: 'comparison', operand_a: constant(1), comparator: '==', operand_b: constant(1) } }, draft.tasks, draft.taskMacros);
  assert.ok(result.errors.some((e) => e.key === 'parameterTypeMismatch' && e.path.includes('/task_macros/')));
});
test('empty sequences are allowed; duplicate steps, nested sequences and invalid invocation shapes reject', () => {
  const { draft, sequence } = setup();
  draft.taskMacros.push(createTaskMacro('Draft')); assert.deepEqual(compileProject(draft).errors, []);
  draft.taskMacros.pop(); draft.taskMacros.push(structuredClone(sequence)); assert.ok(compileProject(draft).errors.some((e) => e.key === 'duplicateId'));
  for (const target of ['duplicate','nested','missing','both','malformed']) {
    const data = structuredClone(example), seq = data.task_macros[sequence.id];
    if (target === 'duplicate') seq.steps.push(structuredClone(seq.steps[0]));
    if (target === 'nested') seq.steps[0].task = { task_macro_id: sequence.id, arguments: {} };
    if (target === 'missing') Object.values(data.slots)[0].branches[0].task.task_macro_id = crypto.randomUUID();
    if (target === 'both') Object.values(data.slots)[0].branches[0].task.task_id = seq.steps[0].task.task_id;
    if (target === 'malformed') seq.steps = [null];
    assert.ok(validateDocument(data).length, target);
  }
  const data = structuredClone(example); delete data.task_macros;
  assert.ok(validateDocument(data).some((e) => e.key === 'chooseTask'));
  assert.equal(createTaskStep().task.task_id, '');
});
