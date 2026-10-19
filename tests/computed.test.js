import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/examples/example.json' with { type: 'json' };
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { addComputedNode, addOperandNode, applyComputedDefinition, changeOperandType, computedErrors, defaultDefinition, deleteOperandNode, duplicateOperandSubtree, nodeReferences, subtreeReferences, treeErrors } from '../src/core/operandModel.js';

const c = (value) => ({ type: 'constant', value });
const ref = (reference_id) => ({ type: 'reference', reference_id });
const mref = (expression_macro_id) => ({ type: 'expression_macro_reference', expression_macro_id });
const expr = (a, operator, b) => ({ type: 'expression', operand_a: a, operator, operand_b: b });
const cmp = (a, comparator, b) => ({ kind: 'comparison', operand_a: a, comparator, operand_b: b });
const num = (expression) => ({ kind: 'number', expression });
const bool = (condition) => ({ kind: 'boolean', condition });
function setup() {
  const draft = projectToDraft(example), group = Object.keys(draft.operandNodes)[0];
  const energy = Object.keys(draft.operandNodes).find((id) => draft.operandNodes[id].display_name === 'energy');
  const a = addComputedNode(draft.operandNodes, group, 'A'), b = addComputedNode(a.nodes, group, 'B');
  draft.operandNodes = b.nodes;
  return { draft, group, energy, a: a.id, b: b.id };
}

test('computed number and boolean definitions use existing operands and conditions, round-trip with slot references', () => {
  const { draft, energy, a, b } = setup();
  let result = applyComputedDefinition(draft.operandNodes, draft.slots, a, num(expr(ref(energy), '+', c(10))));
  assert.deepEqual(result.errors, []); draft.operandNodes = result.nodes;
  result = applyComputedDefinition(draft.operandNodes, draft.slots, b, bool({ kind: 'group', mode: 'ANY', items: [cmp(mref(a), '>', c(10)), { kind: 'group', mode: 'ALL', items: [cmp(ref(energy), '<', c(3))] }] }));
  assert.deepEqual(result.errors, []); draft.operandNodes = result.nodes;
  draft.slots[0].branches[0].condition = cmp(mref(b), '==', c(true));
  const compiled = compileProject(draft); assert.deepEqual(compiled.errors, []);
  assert.equal(compiled.data.expression_macros[b].value_type, 'boolean');
  assert.deepEqual(compileProject(projectToDraft(compiled.data)).data, compiled.data);
});

test('direct and indirect cycles are rejected atomically with dependency paths', () => {
  const { draft, a, b } = setup(); const nodes = draft.operandNodes;
  const self = applyComputedDefinition(nodes, [], a, num(mref(a)));
  assert.equal(self.nodes, nodes); assert.ok(self.errors.some((e) => e.key === 'computedCycle' && e.path.endsWith('/expression/expression_macro_id')));
  const first = applyComputedDefinition(nodes, [], a, num(mref(b))); assert.deepEqual(first.errors, []);
  const second = applyComputedDefinition(first.nodes, [], b, num(expr(c(1), '+', mref(a))));
  assert.equal(second.nodes, first.nodes);
  assert.ok(second.errors.some((e) => e.key === 'computedCycle' && e.field.includes('A') && e.field.includes('B')));
});

test('computed definitions protect external dependencies and prevent incompatible result type changes', () => {
  const { draft, energy, a, b } = setup();
  let nodes = applyComputedDefinition(draft.operandNodes, [], a, num(ref(energy))).nodes;
  nodes = applyComputedDefinition(nodes, [], b, num(expr(mref(a), '*', c(2)))).nodes;
  assert.throws(() => deleteOperandNode(nodes, [], energy), /nodeInUse/);
  assert.throws(() => deleteOperandNode(nodes, [], a), /nodeInUse/);
  const externalType = changeOperandType(nodes, [], energy, 'string');
  assert.equal(externalType.nodes, nodes); assert.equal(externalType.blocked[0].ownerId, a);
  const resultType = applyComputedDefinition(nodes, [], a, defaultDefinition('boolean'));
  assert.equal(resultType.nodes, nodes); assert.ok(resultType.errors.some((e) => e.key === 'numericOperandRequired'));
  assert.throws(() => changeOperandType(nodes, [], a, 'boolean'), /invalidDefinition/);
  draft.slots[0].branches[0].condition = cmp(mref(b), '<', c(3));
  assert.ok(applyComputedDefinition(nodes, draft.slots, b, defaultDefinition('boolean')).errors.some((e) => e.key === 'operandTypeMismatch'));
});

test('variable subtree copies exclude expression macros; copying a macro retains its dependencies', () => {
  const { draft, group, energy, a, b } = setup();
  let nodes = applyComputedDefinition(draft.operandNodes, [], a, num(expr(ref(energy), '+', c(1)))).nodes;
  nodes = applyComputedDefinition(nodes, [], b, bool(cmp(mref(a), '>', c(10)))).nodes;
  const copy = duplicateOperandSubtree(nodes, group);
  assert.ok(!Object.values(copy.nodes).some((node) => node.parent_id === copy.id && node.source === 'computed'));
  assert.equal(copy.nodes[a], nodes[a]); assert.equal(copy.nodes[b], nodes[b]);
  const single = duplicateOperandSubtree(nodes, a);
  assert.equal(single.nodes[single.id].definition.expression.operand_a.reference_id, energy);
  single.nodes[single.id].definition.expression.operand_b.value = 99;
  assert.equal(nodes[a].definition.expression.operand_b.value, 1);
  assert.deepEqual(computedErrors(single.nodes), []); assert.deepEqual(treeErrors(single.nodes), []);
});

test('standalone expression consumers protect variable subtree and dependent macro deletion', () => {
  const root = addOperandNode({}, null, 'group', 'Root'), external = addOperandNode(root.nodes, root.id, 'value', 'Input');
  const macro = addComputedNode(external.nodes, root.id, 'Macro');
  const nodes = applyComputedDefinition(macro.nodes, [], macro.id, num(ref(external.id))).nodes;
  assert.equal(subtreeReferences(nodes, [], root.id).length, 1);
  assert.throws(() => deleteOperandNode(nodes, [], root.id), /nodeInUse/);
  const outside = addComputedNode(nodes, null, 'Outside'), withConsumer = applyComputedDefinition(outside.nodes, [], outside.id, num(mref(macro.id))).nodes;
  assert.throws(() => deleteOperandNode(withConsumer, [], macro.id), /nodeInUse/);
  const removed = deleteOperandNode(deleteOperandNode(nodes, [], macro.id), [], root.id);
  assert.deepEqual(removed, {});
});

test('imports reject malformed definitions, missing refs, mismatched result types and dependency cycles', () => {
  const { draft, a } = setup();
  const base = compileProject(draft).data;
  const changes = [
    (node) => { delete node.definition; },
    (node) => { node.value_type = 'boolean'; },
    (node) => { node.definition = num(c('text')); },
    (node) => { node.definition = bool(null); node.value_type = 'boolean'; },
    (node) => { node.definition = bool({ kind: 'group', mode: 'ANY', items: [] }); node.value_type = 'boolean'; },
    (node) => { node.definition = num(ref(crypto.randomUUID())); },
    (node) => { node.definition = num(mref(a)); },
    (node) => { node.source = 'external'; },
  ];
  for (const change of changes) { const data = structuredClone(base); change(data.expression_macros[a]); assert.ok(validateDocument(data).length); }
});
