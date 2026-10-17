import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, compileProject, projectToDraft, validateDocument } from '../src/model.js';
import { addOperandNode, duplicateOperandSubtree, moveOperandNode, deleteOperandNode, treeErrors, scopedVariables } from '../src/operandModel.js';

test('variable layers persist independently and cannot move across parents in another layer', () => {
  const env = addOperandNode({}, null, 'group', 'Engine', 'environment');
  const app = addOperandNode(env.nodes, env.id, 'group', 'Application', 'application');
  assert.equal(app.nodes[app.id].parent_id, null);
  let value = addOperandNode(app.nodes, app.id, 'value', 'Counter', 'application');
  assert.throws(() => moveOperandNode(value.nodes, value.id, env.id, 0), /invalidParent/);
  const copy = duplicateOperandSubtree(value.nodes, app.id);
  assert.equal(Object.keys(scopedVariables(copy.nodes, 'environment')).length, 1);
  assert.deepEqual(treeErrors(copy.nodes), []);
  const next = deleteOperandNode(copy.nodes, [], app.id);
  assert.equal(next[env.id].order, 0);
  assert.equal(next[copy.id].order, 0);
  const result = compileProject({ ...createProject(), operandNodes: next });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(projectToDraft(result.data).operandNodes, next);
  const invalid = structuredClone(result.data);
  invalid.operand_nodes[copy.id].parent_id = env.id;
  assert.ok(validateDocument(invalid).some((error) => error.key === 'invalidParent'));
});

test('identical full paths across variable layers are rejected', () => {
  const env = addOperandNode({}, null, 'value', 'Counter', 'environment');
  const app = addOperandNode(env.nodes, null, 'value', 'Other', 'application');
  app.nodes[app.id].display_name = 'Counter';
  assert.ok(treeErrors(app.nodes).some((error) => error.key === 'duplicateNodeName'));
});
