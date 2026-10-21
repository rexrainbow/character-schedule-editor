import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/examples/state-example.json' with { type: 'json' };
import { projectToDraft, compileProject, validateDocument } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { setVariableDefinition, changeBuiltinDefinition } from '../src/gui/hooks/builtinTasks.js';
import { translator } from '../src/i18n/index.js';

test('builtin metadata persists only custom fields, retaining language fallback and fixed parameter roles', () => {
  const en = translator('en'), zh = translator('zh-TW');
  const current = setVariableDefinition(undefined, en);
  const config = changeBuiltinDefinition(undefined, current, { ...current, icon: 'tabler:books' });
  assert.deepEqual(config, { set_variable: { icon: 'tabler:books' } });
  assert.equal(setVariableDefinition(config, zh).display_name, zh('setVariable'));
  const custom = changeBuiltinDefinition(config, current, { ...current, display_name: 'Update state', symbol: 'assign_value', parameters: current.parameters.map((p) => ({ ...p, display_name: 'Custom ' + p.id })) });
  assert.equal(setVariableDefinition(custom, zh).display_name, 'Update state');
  assert.deepEqual(setVariableDefinition(custom, zh).parameters.map((p) => p.type), ['variable_reference', 'expression']);
  const draft = projectToDraft(example); draft.builtinTasks = custom;
  const result = compileProject(draft); assert.deepEqual(result.errors, []);
  assert.deepEqual(projectToDraft(result.data).builtinTasks, custom);
  result.data.builtin_tasks.set_variable.parameters.target.type = 'string';
  assert.ok(validateDocument(result.data).some((error) => error.key === 'schema_additionalProperties'));
});

test('assignment runtime calls use the configured engine contract and preserve reference semantics', () => {
  const draft = projectToDraft(example);
  for (const [id, node] of Object.entries(draft.operandNodes)) if (node.source !== 'computed') node.symbol = 'var_' + id.replaceAll('-', '_');
  for (const task of draft.tasks) task.symbol = 'task_' + task.id.replaceAll('-', '_');
  assert.deepEqual(compileRuntime(draft).errors, []);
  draft.builtinTasks = { set_variable: { display_name: 'Update state', symbol: 'assign_value', parameters: { target: { display_name: 'Destination' }, value: { display_name: 'New value' } } } };
  const result = compileRuntime(draft); assert.deepEqual(result.errors, []);
  const requirement = result.data.environment_requirements.tasks.find((item) => item.name === 'assign_value');
  assert.equal(requirement.display_name, 'Update state');
  assert.equal(requirement.parameters[0].display_name, 'Destination');
  const calls = Object.values(result.data.slots).flatMap((slot) => slot.branches.map((branch) => branch.task));
  const assignment = calls.find((call) => call.task_key === 'assign_value');
  assert.ok(assignment.target); assert.equal(assignment.builtin, undefined);
});
