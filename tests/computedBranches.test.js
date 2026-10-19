import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileEnvironment, createProjectWithEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { changeComputedMode, applyComputedDefinition, duplicateOperandSubtree, deleteOperandNode, changeOperandType, computedErrors } from '../src/core/operandModel.js';
import { evaluateSimulationExpressions, simulateSlot, simulationInitialValues } from '../src/core/simulationModel.js';
import { computedBranchFixture, constant, numeric, boolean } from './computedBranchFixture.js';

test('numeric and boolean branch definitions preserve project/environment/runtime structure and typed results', () => {
  const { draft, reward, later } = computedBranchFixture();
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const environment = compileEnvironment(draft); assert.deepEqual(environment.errors, []);
  assert.equal(environment.data.expression_macros[reward], undefined);
  assert.deepEqual(createProjectWithEnvironment('Imported', 3, environment.data).operandNodes[later].definition, draft.operandNodes[later].definition);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.expression_macros[reward].definition.branches[0].condition.operand_a.engine_key, 'schedule.current_weekday');
  const invalid = structuredClone(runtime.data); invalid.expression_macros[reward].definition.branches[0].result = boolean(true);
  assert.ok(validateRuntimeDocument(invalid).length);
});

test('mode conversion wraps and unwraps ELSE losslessly and requires an explicit retained result for multiple branches', () => {
  for (const scalar of [numeric(7), boolean(false)]) {
    const branch = changeComputedMode(scalar, 'branch');
    assert.deepEqual(branch.branches, [{ condition: null, result: scalar }]);
    assert.deepEqual(changeComputedMode(branch, 'single'), scalar);
  }
  const { draft, reward } = computedBranchFixture(), definition = draft.operandNodes[reward].definition;
  assert.throws(() => changeComputedMode(definition, 'single'), /chooseComputedResult/);
  assert.deepEqual(changeComputedMode(definition, 'single', 1), numeric(20));
  assert.equal(definition.branches.length, 2);
});

test('branch conditions and every result participate in dependency, type, cycle and layer checks', () => {
  const { draft, reward, later, balance, weekday } = computedBranchFixture();
  assert.throws(() => deleteOperandNode(draft.operandNodes, [], weekday), /nodeInUse/);
  assert.ok(changeOperandType(draft.operandNodes, [], weekday, 'boolean').blocked.length);
  const copy = duplicateOperandSubtree(draft.operandNodes, reward);
  assert.deepEqual(copy.nodes[copy.id].definition, draft.operandNodes[reward].definition); assert.equal(copy.nodes[copy.id].engine_key, undefined);
  for (const change of ['empty', 'missingElse', 'wrongType', 'nested']) {
    const data = compileProject(draft).data, definition = data.expression_macros[reward].definition;
    if (change === 'empty') definition.branches = [];
    if (change === 'missingElse') definition.branches.pop();
    if (change === 'wrongType') definition.branches[0].result = boolean(true);
    if (change === 'nested') definition.branches[0].result = structuredClone(definition);
    assert.ok(validateDocument(data).length, change);
  }
  const cyclic = structuredClone(draft.operandNodes[reward].definition); cyclic.branches[1].result.expression = { type: 'expression_macro_reference', expression_macro_id: reward };
  assert.ok(applyComputedDefinition(draft.operandNodes, draft.slots, reward, cyclic).errors.some((e) => e.key === 'computedCycle'));
  draft.operandNodes[later].definition.branches[0].condition.operand_a = { type: 'reference', reference_id: balance };
  assert.ok(computedErrors(draft.operandNodes).some((e) => e.key === 'environmentExpressionDependency'));
});

test('simulation lazily returns the first matching value and reports only selected runtime errors', () => {
  const { draft, reward, later, balance, weekday, currentSlot, slot } = computedBranchFixture();
  const values = { ...simulationInitialValues(draft), [weekday]: 6, [currentSlot]: 2 };
  draft.operandNodes[reward].definition.branches[1].result.expression = { type: 'expression', operator: '/', operand_a: constant(1), operand_b: constant(0) };
  assert.deepEqual(compileProject(draft).errors, [], 'potential runtime failure in an unselected result is allowed');
  assert.deepEqual(compileRuntime(draft).errors, []);
  const computed = evaluateSimulationExpressions(draft, values); assert.equal(computed[reward].value, 5); assert.equal(computed[later].value, true);
  const result = simulateSlot(draft, slot.id, values); assert.deepEqual(result.errors, []); assert.equal(result.state[balance], 5);
  const json = JSON.stringify(result.trace); assert.ok(json.includes('Return value')); assert.ok(json.includes('skipped'));
  values[weekday] = 1;
  assert.ok(simulateSlot(draft, slot.id, values).errors.some((e) => e.key === 'divisionByZero' && e.path.includes('/result/expression')));
});

test('environment replacement reconnects references inside branch guards and results', () => {
  const { draft, reward, later, weekday } = computedBranchFixture(), environment = compileEnvironment(draft).data;
  environment.environment.id = crypto.randomUUID();
  const nextWeekday = crypto.randomUUID(); environment.operand_nodes[nextWeekday] = environment.operand_nodes[weekday]; delete environment.operand_nodes[weekday];
  function reconnect(value) { if (!value || typeof value !== 'object') return; if (value.reference_id === weekday) value.reference_id = nextWeekday; Object.values(value).forEach(reconnect); }
  reconnect(environment.expression_macros);
  const result = prepareEnvironmentImport(draft, environment); assert.deepEqual(result.errors, []);
  assert.equal(result.draft.operandNodes[reward].definition.branches[0].condition.operand_a.reference_id, nextWeekday);
  assert.equal(result.draft.operandNodes[later].definition.kind, 'branch');
});
