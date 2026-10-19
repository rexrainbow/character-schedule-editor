import { createActionSlot as createSlot } from './slotFixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, compileProject, projectToDraft } from '../src/core/model.js';
import { createTaskMacro } from '../src/core/taskMacroModel.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';

test('both empty macro modes round-trip and export callable runtime placeholders with names', () => {
  const draft = createProject();
  const sequence = createTaskMacro('Debug sequence'), branch = { ...createTaskMacro('Debug branch', 'branch'), branches: [] };
  draft.taskMacros = [sequence, branch];
  draft.slots = draft.taskMacros.map((macro) => { const slot = createSlot([], macro.display_name); slot.branches[0].task = { task_macro_id: macro.id, arguments: {} }; return slot; });
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.task_macros[sequence.id].steps, []);
  assert.deepEqual(runtime.data.task_macros[branch.id].branches, []);
  assert.equal(runtime.data.task_macros[sequence.id].display_name, 'Debug sequence');
  assert.equal(runtime.data.task_macros[branch.id].display_name, 'Debug branch');
  assert.deepEqual(runtime.data.environment_requirements.tasks, []);
  sequence.parameters = [{ id: crypto.randomUUID(), display_name: 'Input', type: 'number' }];
  assert.ok(compileProject(draft).errors.length, 'empty bodies do not bypass required invocation arguments');
  draft.slots[0].branches[0].task.arguments[sequence.parameters[0].id] = { type: 'constant', value: 1 };
  assert.deepEqual(compileRuntime(draft).errors, []);
});

test('nonempty branch macros and slots still require a final ELSE and complete tasks', () => {
  const draft = createProject(), sequence = createTaskMacro('Empty');
  const branch = createTaskMacro('Incomplete', 'branch'); draft.taskMacros = [sequence, branch];
  assert.ok(compileProject(draft).errors.length, 'unselected task is not an empty macro');
  branch.branches[0] = { uid: crypto.randomUUID(), condition: { kind: 'comparison', operand_a: { type: 'constant', value: 1 }, comparator: '==', operand_b: { type: 'constant', value: 1 } }, task: { task_macro_id: sequence.id, arguments: {} } };
  assert.ok(compileProject(draft).errors.some((error) => error.key === 'elseLast'));
  branch.branches = [];
  const slot = createSlot([], 'Invalid slot'); slot.branches = []; draft.slots = [slot];
  assert.deepEqual(compileProject(draft).errors, [], 'named slots may have no branch rules');
});
