import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { addOperandNode, changeOperandType, duplicateOperandSubtree } from '../src/core/operandModel.js';
import { compileEnvironment, createEnvironmentInfo, createProjectWithEnvironment, prepareEnvironmentImport, validateEnvironment } from '../src/core/environmentModel.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';

function fixture() {
  const draft = createProject(); draft.environment = createEnvironmentInfo('Initial values');
  let result = addOperandNode({}, null, 'group', 'Engine');
  const root = result.id;
  result = addOperandNode(result.nodes, root, 'value', 'Counter'); const counter = result.id;
  result.nodes[counter] = { ...result.nodes[counter], symbol: 'counter', initial_value: 12.5, read_only: true };
  result = addOperandNode(result.nodes, root, 'value', 'Label'); const label = result.id;
  result.nodes[label] = { ...result.nodes[label], symbol: 'label', value_type: 'string', initial_value: '起點' };
  result = addOperandNode(result.nodes, null, 'value', 'Enabled', 'application'); const local = result.id;
  result.nodes[local] = { ...result.nodes[local], value_type: 'boolean', initial_value: true };
  draft.operandNodes = result.nodes;
  return { draft, counter, label, local };
}

test('typed initial values survive project/environment round trips, copies and environment replacement', () => {
  const { draft, counter, local } = fixture();
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(projectToDraft(project.data).operandNodes, draft.operandNodes);
  const environment = compileEnvironment(draft); assert.deepEqual(environment.errors, []);
  assert.equal(createProjectWithEnvironment('Imported', 3, environment.data).operandNodes[counter].initial_value, 12.5);
  const replacement = structuredClone(environment.data); replacement.operand_nodes[counter].initial_value = 25;
  const applied = prepareEnvironmentImport(draft, replacement); assert.deepEqual(applied.errors, []);
  assert.equal(applied.draft.operandNodes[counter].initial_value, 25);
  assert.equal(applied.draft.operandNodes[local].initial_value, true);
  const copy = duplicateOperandSubtree(draft.operandNodes, counter);
  assert.equal(copy.nodes[copy.id].initial_value, 12.5);
  const changed = changeOperandType(draft.operandNodes, [], counter, 'string');
  assert.deepEqual(changed.blocked, []); assert.equal(changed.nodes[counter].initial_value, '');
  assert.equal(draft.operandNodes[counter].initial_value, 12.5);
});

test('runtime includes unused environment variables and typed defaults but only used requirements', () => {
  const { draft, counter, local } = fixture();
  const before = structuredClone(draft), result = compileRuntime(draft);
  assert.deepEqual(result.errors, []); assert.deepEqual(draft, before);
  assert.equal(result.data.environment_variables[0].children[0].initial_value, 12.5);
  assert.equal(result.data.application_variables[0].initial_value, true);
  assert.deepEqual(result.data.environment_requirements.variables, []);
  delete draft.operandNodes[local].initial_value;
  assert.equal(compileRuntime(draft).data.application_variables[0].initial_value, false);
  const invalid = structuredClone(result.data); invalid.application_variables[0].initial_value = 1;
  assert.ok(validateRuntimeDocument(invalid).length);
  draft.operandNodes[counter].symbol = '';
  assert.ok(compileRuntime(draft).errors.some((e) => e.key === 'invalidSymbol'));
});

test('wrong types, null and non-finite initial values fail with field locations', () => {
  const { draft, counter } = fixture(), document = compileProject(draft).data;
  for (const value of ['12', true, null, {}, { type: 'constant', value: 12 }]) {
    const invalid = structuredClone(document); invalid.operand_nodes[counter].initial_value = value;
    assert.ok(validateDocument(invalid).some((e) => e.path.endsWith('/initial_value')));
  }
  const invalidEnvironment = compileEnvironment(draft).data;
  invalidEnvironment.operand_nodes[counter].initial_value = false;
  assert.ok(validateEnvironment(invalidEnvironment).some((e) => e.path.endsWith('/initial_value')));
  for (const value of [NaN, Infinity, -Infinity]) {
    draft.operandNodes[counter].initial_value = value;
    assert.ok(compileProject(draft).errors.some((e) => e.key === 'invalidInitialValue'));
  }
});
