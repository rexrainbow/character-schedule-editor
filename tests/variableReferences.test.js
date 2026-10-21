import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProject, projectToDraft } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { changeReadOnly, changeOperandType, deleteOperandNode, argumentErrors } from '../src/core/operandModel.js';
import { changeParameterType } from '../src/core/taskModel.js';
import { changeMacroParameterType, duplicateTaskMacro, deleteMacroParameter } from '../src/core/taskMacroModel.js';
import { compileEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { referenceFixture } from './referenceFixture.js';

test('reference arguments and forwarded macro contracts round-trip, exporting opaque engine/application references', () => {
  const { draft, task, target, macro, macroTarget, counter, local, slot, macroSlot } = referenceFixture();
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.data.slots[slot.id].branches[0].task.arguments[0], { type: 'variable_reference', name: 'counter' });
  assert.deepEqual(runtime.data.slots[macroSlot.id].branches[0].task.arguments[macroTarget.id], { type: 'variable_reference', reference_id: local });
  assert.equal(runtime.data.task_macros[macro.id].steps[0].arguments[0].parameter_id, macroTarget.id);
  assert.equal(runtime.data.environment_requirements.variables[0].access, 'read_write');
  assert.equal(runtime.data.environment_requirements.tasks[0].parameters[0].value_type, 'number');
  assert.equal(runtime.data.environment_requirements.tasks[0].parameters[0].access, 'read_write');
  const copy = duplicateTaskMacro(macro);
  assert.equal(copy.steps[0].task.arguments[target.id].parameter_id, copy.parameters[0].id);
  assert.throws(() => deleteMacroParameter(draft, macro.id, macroTarget.id), /macroParameterInUse/);
});

test('references reject constants, value expressions, groups, computed values, wrong types and missing write permission', () => {
  const { draft, target, counter, limit, text } = referenceFixture();
  const errors = (value, p = target) => argumentErrors(value, p, draft.operandNodes);
  assert.ok(errors({ type: 'constant', value: 1 }).length);
  assert.ok(errors({ type: 'reference', reference_id: counter }).length);
  assert.ok(errors({ type: 'variable_reference', reference_id: text }).length);
  assert.ok(errors({ type: 'variable_reference', reference_id: draft.operandNodes[counter].parent_id }).length);
  const computed = crypto.randomUUID(); draft.operandNodes[computed] = { node_type: 'value', source: 'computed', value_type: 'number' };
  assert.ok(errors({ type: 'variable_reference', reference_id: computed }).length);
  assert.ok(errors({ type: 'variable_reference', reference_id: limit }).length);
  assert.deepEqual(errors({ type: 'variable_reference', reference_id: limit }, { ...target, access: 'read' }), []);
  const macro = referenceFixture().macro;
  macro.parameters[0].access = 'read';
  assert.ok(argumentErrors({ type: 'parameter_reference', parameter_id: macro.parameters[0].id }, target, draft.operandNodes, '', macro.parameters).length);
});

test('read/write reference dependencies protect deletion, read-only conversion, variable types and parameter changes', () => {
  const { draft, task, target, macro, macroTarget, counter } = referenceFixture();
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, counter, draft.taskMacros, draft.tasks), /nodeInUse/);
  assert.ok(changeReadOnly(draft.operandNodes, draft.slots, counter, true, draft.taskMacros, draft.tasks).blocked.length);
  assert.ok(changeOperandType(draft.operandNodes, draft.slots, counter, 'string', draft.tasks, draft.taskMacros).blocked.length);
  assert.ok(changeParameterType(draft, task.id, target.id, { value_type: 'string' }).blocked.length);
  assert.deepEqual(changeParameterType(draft, task.id, target.id, { value_type: 'any' }).blocked, []);
  assert.ok(changeMacroParameterType(draft, macro.id, macroTarget.id, { access: 'read' }).blocked.length);
  const read = structuredClone(draft); read.tasks[0].parameters[0].access = 'read';
  assert.deepEqual(changeReadOnly(read.operandNodes, read.slots, counter, true, read.taskMacros, read.tasks).blocked, []);
  // A reference parameter is not a value operand, even in a nonnumeric expression position.
  macro.steps[0].task.arguments[task.parameters[1].id] = { type: 'parameter_reference', parameter_id: macroTarget.id };
  assert.ok(compileProject(draft).errors.some((error) => error.key === 'variableReferenceAsValue'));
});

test('environment imports reconnect variable-reference targets and verify their parameter capabilities', () => {
  const { draft, counter, task, target, slot } = referenceFixture(), environment = compileEnvironment(draft).data;
  const newId = crypto.randomUUID(); environment.operand_nodes[newId] = environment.operand_nodes[counter]; delete environment.operand_nodes[counter];
  const result = prepareEnvironmentImport(draft, environment); assert.deepEqual(result.errors, []);
  assert.equal(result.draft.slots[0].branches[0].task.arguments[target.id].reference_id, newId);
  environment.operand_nodes[newId].read_only = true;
  assert.ok(prepareEnvironmentImport(draft, environment).errors.some((error) => error.key === 'readonlyTarget'));
  environment.operand_nodes[newId].read_only = false;
  environment.tasks[task.id].parameters[0].access = 'write';
  environment.tasks[task.id].parameters[0].value_type = 'string';
  assert.equal(prepareEnvironmentImport(draft, environment).draft, null);
});
