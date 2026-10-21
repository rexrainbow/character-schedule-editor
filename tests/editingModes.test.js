import { normalizeSymbols } from '../src/core/symbols.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { addOperandNode, duplicateOperandSubtree, moveOperandNode, deleteOperandNode, treeErrors, scopedVariables } from '../src/core/operandModel.js';

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
  assert.deepEqual(projectToDraft(result.data).operandNodes, normalizeSymbols({operandNodes:next}).operandNodes);
  const invalid = structuredClone(result.data);
  invalid.operand_nodes[copy.id].parent_id = env.id;
  assert.ok(validateDocument(invalid).some((error) => error.key === 'invalidParent'));
});

test('display paths may repeat across layers but persistent names may not', () => {
  const env = addOperandNode({}, null, 'value', 'Counter', 'environment');
  const app = addOperandNode(env.nodes, null, 'value', 'Other', 'application');
  app.nodes[app.id].display_name = 'Counter';
  assert.deepEqual(treeErrors(app.nodes), []);
  app.nodes[app.id].symbol = env.nodes[env.id].symbol;
  assert.ok(compileProject({ ...createProject(), operandNodes: app.nodes }).errors.some((error) => error.key === 'duplicateSymbol'));
});
