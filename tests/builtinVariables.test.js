import { namedData } from '../src/core/symbols.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinVariableDefinition, changeBuiltinDefinition } from '../src/gui/hooks/builtinTasks.js';
import { translator } from '../src/i18n/index.js';
import { compileProject, projectToDraft, validateDocument, taskSummary } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { compileEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { changeReadOnly, changeOperandType, deleteOperandNode, setVariableErrors } from '../src/core/operandModel.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';

test('new variable builtins retain fixed contracts and editable metadata across project/environment files', () => {
  const { draft } = builtinVariableFixture(), t = translator('en');
  for (const kind of ['increment_variable', 'toggle_variable', 'reset_variable']) {
    const current = builtinVariableDefinition(kind, draft.builtinTasks, t);
    draft.builtinTasks = changeBuiltinDefinition(draft.builtinTasks, current, { ...current, display_name: 'Custom ' + kind, icon: 'tabler:books', parameters: current.parameters.map((p) => ({ ...p, display_name: 'Custom ' + p.id })) });
    const definition = builtinVariableDefinition(kind, draft.builtinTasks, translator('zh-TW'));
    assert.equal(definition.display_name, 'Custom ' + kind);
    assert.equal(definition.parameters[0].type, 'variable_reference');
    assert.equal(definition.parameters.length, kind === 'increment_variable' ? 3 : 1);
  }
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const environment = compileEnvironment(draft); assert.deepEqual(environment.errors, []);
  assert.deepEqual(environment.data.builtin_tasks, namedData(draft.builtinTasks));
  environment.data.builtin_tasks.toggle_variable.parameters.value = { display_name: 'Invalid' };
  assert.ok(prepareEnvironmentImport(draft, environment.data).errors.length);
  assert.equal(taskSummary(draft.slots[1], '?', [], [], { toggle_variable: 'Switch' }), 'Switch');
});

test('runtime variable operations preserve keys, targets, expressions and accurate access requirements', () => {
  const { draft, text, sequence } = builtinVariableFixture();
  const before = structuredClone(draft), result = compileRuntime(draft); assert.deepEqual(result.errors, []);
  assert.deepEqual(draft, before); assert.deepEqual(validateRuntimeDocument(result.data), []);
  const calls = Object.values(result.data.slots).map((slot) => slot.branches[0].task);
  assert.deepEqual(calls[0], { task_key: 'engine_increment_variable', target: { type: 'environment_reference', name: 'Counter' }, value: { type: 'constant', value: -2 } });
  assert.deepEqual(calls[1], { task_key: 'engine_toggle_variable', target: { type: 'environment_reference', name: 'Enabled' } });
  assert.deepEqual(calls[2], { task_key: 'engine_reset_variable', target: { type: 'reference', reference_id: text } });
  assert.equal(result.data.task_macros[sequence.id].steps[0].value.type, 'parameter_reference');
  assert.ok(result.data.environment_requirements.variables.every((item) => item.access === 'read_write'));
  const increment = result.data.environment_requirements.tasks.find((item) => item.name === 'engine_increment_variable');
  assert.equal(increment.parameters[0].value_type, 'number'); assert.equal(increment.parameters[1].type, 'number');
  draft.builtinTasks.toggle_variable.symbol = '';
  assert.ok(compileRuntime(draft).errors.some((error) => error.key === 'invalidSymbol'));
});

test('all builtin targets protect type, write permissions and deletion, including macro-only uses', () => {
  const { draft, actions, number, boolean, text, readonly } = builtinVariableFixture();
  for (const task of actions) {
    assert.ok(setVariableErrors({ ...task, target_variable_id: readonly }, draft.operandNodes).some((e) => e.key === 'readonlyTarget'));
    assert.throws(() => deleteOperandNode(draft.operandNodes, [], task.target_variable_id, draft.taskMacros), /nodeInUse/);
    assert.ok(changeReadOnly(draft.operandNodes, [], task.target_variable_id, true, draft.taskMacros).blocked.length);
  }
  assert.ok(setVariableErrors({ ...actions[0], target_variable_id: text }, draft.operandNodes).length);
  assert.ok(setVariableErrors({ ...actions[1], target_variable_id: number }, draft.operandNodes).length);
  assert.ok(changeOperandType(draft.operandNodes, [], boolean, 'number', [], draft.taskMacros).blocked.length);
  assert.ok(changeOperandType(draft.operandNodes, [], number, 'boolean', [], draft.taskMacros).blocked.length);
  assert.deepEqual(changeOperandType(draft.operandNodes, [], text, 'number', [], draft.taskMacros).blocked, []);
  const document = compileProject(draft).data;
  document.slots[draft.slots[1].id].branches[0].task.value = { type: 'constant', value: true };
  assert.ok(validateDocument(document).length);
});

test('environment replacement rebinds new builtin targets by engine key and rejects readonly replacements', () => {
  const { draft, number } = builtinVariableFixture(), environment = compileEnvironment(draft).data;
  environment.environment.id = crypto.randomUUID();
  const replacement = crypto.randomUUID(); environment.operand_nodes[replacement] = environment.operand_nodes[number]; delete environment.operand_nodes[number];
  const result = prepareEnvironmentImport(draft, environment); assert.deepEqual(result.errors, []);
  assert.equal(result.draft.slots[0].branches[0].task.target_variable_id, replacement);
  assert.equal(result.draft.taskMacros[0].steps[0].task.target_variable_id, replacement);
  environment.operand_nodes[replacement].read_only = true;
  assert.equal(prepareEnvironmentImport(draft, environment).draft, null);
  assert.equal(draft.slots[0].branches[0].task.target_variable_id, number);
});
