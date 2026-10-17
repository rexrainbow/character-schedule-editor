import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/expression-example.json' with { type: 'json' };
import { compileProject, duplicateSlot, projectToDraft, validateDocument } from '../src/model.js';
import { changeOperandType, conditionErrors, deleteOperandNode, formatOperand, nodeReferences, operandAt, operandErrors, replaceOperand, wrapExpression } from '../src/operandModel.js';

const constant = (value) => ({ type: 'constant', value });
const expression = (a, operator, b) => ({ type: 'expression', operator, operand_a: a, operand_b: b });
const energy = Object.keys(example.operand_nodes).find((id) => example.operand_nodes[id].display_name === 'energy');
const weather = Object.keys(example.operand_nodes).find((id) => example.operand_nodes[id].display_name === 'weather');
const ref = (reference_id) => ({ type: 'reference', reference_id });
const compare = (a, b) => ({ kind: 'comparison', operand_a: a, comparator: '>=', operand_b: b });

test('nested expression projects round-trip with ALL/ANY, explicit parentheses and independent slot copies', () => {
  assert.deepEqual(validateDocument(example), []);
  const draft = projectToDraft(example), result = compileProject(draft);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.data, example);
  const source = draft.slots[0], copy = duplicateSlot(draft.slots, source);
  assert.equal(formatOperand(source.branches[0].condition.operand_a, draft.operandNodes), '((Character.energy + 10) * 2)');
  copy.branches[0].condition.operand_a.operand_b.value = 99;
  assert.equal(source.branches[0].condition.operand_a.operand_b.value, 2);
  assert.equal(Object.hasOwn(source.branches[0].condition.operand_a, 'id'), false);
});

test('wrapping and replacing any nested subtree preserve grouping, siblings and the original draft', () => {
  const original = expression(ref(energy), '+', constant(10));
  const wrapped = wrapExpression(original); wrapped.operator = '*'; wrapped.operand_b.value = 2;
  assert.equal(formatOperand(wrapped, example.operand_nodes), '((Character.energy + 10) * 2)');
  const nested = replaceOperand(original, ['operand_b'], expression(constant(10), '*', constant(2)));
  assert.equal(formatOperand(nested, example.operand_nodes), '(Character.energy + (10 * 2))');
  assert.equal(operandAt(original, ['operand_b']).value, 10);
  const kept = replaceOperand(nested, ['operand_b'], operandAt(nested, ['operand_b','operand_a']));
  assert.deepEqual(kept, original);
});

test('every expression child requires a valid number, with nested errors reported at their location', () => {
  const cases = [
    [expression(ref(weather), '+', constant(1)), 'numericOperandRequired', '/operand_a'],
    [expression(constant(true), '+', constant(1)), 'numericOperandRequired', '/operand_a'],
    [expression(constant(1), '*', expression(constant('2'), '+', constant(0))), 'numericOperandRequired', '/operand_b/operand_a'],
    [expression(constant(1), '+', null), 'chooseOperand', '/operand_b'],
    [expression(ref(crypto.randomUUID()), '+', constant(1)), 'missingOperand', '/operand_a/reference_id'],
    [expression(constant(Infinity), '+', constant(1)), 'finiteNumber', '/operand_a/value'],
    [expression(constant(1), '%', constant(2)), 'invalidArithmeticOperator', '/operator'],
  ];
  for (const [operand, key, path] of cases) assert.ok(operandErrors(operand, example.operand_nodes).some((e) => e.key === key && e.path === path));
  assert.ok(conditionErrors(compare(expression(constant(1), '+', constant(2)), constant('3')), example.operand_nodes).some((e) => e.key === 'operandTypeMismatch'));
});

test('division rejects direct positive and negative zero without evaluating an expression divisor', () => {
  for (const zero of [0, -0]) assert.ok(operandErrors(expression(constant(1), '/', constant(zero)), {}).some((e) => e.key === 'divisionByZero'));
  assert.deepEqual(operandErrors(expression(constant(-1.5), '/', expression(constant(1), '-', constant(1))), {}), []);
  const data = structuredClone(example); Object.values(data.slots)[0].branches[0].condition.operand_a = expression(ref(energy), '/', constant(0));
  assert.ok(validateDocument(data).some((e) => e.key === 'divisionByZero' && e.path.endsWith('/condition/operand_a/operand_b/value')));
});

test('references nested in arithmetic still block deletion and incompatible type changes', () => {
  const draft = projectToDraft(example);
  const refs = nodeReferences(draft.slots, energy);
  assert.ok(refs.some((e) => e.path.endsWith('/operand_a/operand_a/operand_a')));
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, energy), /nodeInUse/);
  const result = changeOperandType(draft.operandNodes, draft.slots, energy, 'string');
  assert.equal(result.nodes, draft.operandNodes);
  assert.ok(result.blocked.some((e) => e.path.includes('/operand_a/operand_a/operand_a')));
});

test('schema rejects string arithmetic constants, invalid operators and missing nested operands', () => {
  for (const operand of [expression(constant('1'), '+', constant(2)), expression(constant(1), '^', constant(2)), expression(constant(1), '+', null)]) {
    const data = structuredClone(example); Object.values(data.slots)[0].branches[0].condition.operand_a = operand;
    assert.ok(validateDocument(data).some((e) => e.key.startsWith('schema_')));
  }
});
