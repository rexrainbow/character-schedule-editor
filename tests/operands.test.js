import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/examples/example.json' with { type: 'json' };
import { compileDraft, compileProject, createProject, documentToDraft, projectToDraft, validateDocument } from '../src/core/model.js';
import { addOperandNode, changeOperandType, childrenOf, conditionErrors, deleteOperandNode, duplicateOperandSubtree, moveOperandNode, nodePath, nodeReferences, subtreeIds, treeErrors } from '../src/core/operandModel.js';

function setup() {
  const draft = projectToDraft(example), nodes = draft.operandNodes;
  const root = Object.keys(nodes).find((id) => nodes[id].node_type === 'group');
  const leaf = Object.keys(nodes).find((id) => nodes[id].display_name === 'energy');
  return { draft, nodes, root, leaf };
}
const constant = (value) => ({ type: 'constant', value });
const reference = (reference_id) => ({ type: 'reference', reference_id });
const compare = (a, comparator, b) => ({ kind: 'comparison', operand_a: a, comparator, operand_b: b });

test('new projects contain an empty tree, new nodes get UUIDs, unique names and stable consecutive order', () => {
  const draft = createProject(); assert.deepEqual(draft.operandNodes, {});
  let a = addOperandNode({}, null, 'group', 'New Group');
  let b = addOperandNode(a.nodes, a.id, 'value', 'New Value');
  let c = addOperandNode(b.nodes, a.id, 'value', 'New Value');
  assert.equal(c.nodes[c.id].display_name, 'New Value 2'); assert.equal(c.nodes[c.id].value_type, 'number');
  assert.deepEqual(treeErrors(c.nodes), []); assert.match(c.id, /^[0-9a-f-]{36}$/);
  const rootValue = addOperandNode(c.nodes, c.id, 'value', 'Root value');
  assert.equal(rootValue.nodes[rootValue.id].parent_id, null);
});

test('moving, reordering and deleting keep both sibling sets consecutive and IDs stable', () => {
  const { nodes, root, leaf } = setup();
  const other = addOperandNode(nodes, null, 'group', 'Other');
  const moved = moveOperandNode(other.nodes, leaf, other.id, 0);
  assert.equal(moved[leaf].parent_id, other.id); assert.equal(nodePath(moved, leaf), 'Other.energy');
  assert.deepEqual(treeErrors(moved), []);
  assert.throws(() => moveOperandNode(moved, other.id, other.id, 0), /invalidParent/);
  assert.throws(() => moveOperandNode(moved, root, leaf, 0), /invalidParent/);
  assert.throws(() => moveOperandNode(moved, leaf, null, 100), /invalidOrder/);
  const rootChildren = childrenOf(moved, root); const lastId = rootChildren.at(-1)[0];
  const sorted = moveOperandNode(moved, lastId, root, 0); assert.equal(sorted[lastId].order, 0);
  const removed = deleteOperandNode(sorted, [], lastId); assert.deepEqual(treeErrors(removed), []);
  assert.ok(nodes[lastId]);
});

test('subtree copies use independent IDs and parents, keep descendant names and leave conditions unchanged', () => {
  const { draft, nodes, root, leaf } = setup();
  const nested = addOperandNode(nodes, root, 'group', 'Status');
  const deep = moveOperandNode(nested.nodes, leaf, nested.id, 0);
  const copied = duplicateOperandSubtree(deep, root);
  const originalIds = subtreeIds(deep, root), copiedIds = subtreeIds(copied.nodes, copied.id);
  assert.equal(originalIds.size, copiedIds.size);
  for (const id of copiedIds) assert.ok(!originalIds.has(id));
  assert.equal(copied.nodes[copied.id].display_name, 'Character (副本)');
  assert.equal(childrenOf(copied.nodes, null)[1][0], copied.id);
  const again = duplicateOperandSubtree(copied.nodes, root);
  assert.equal(again.nodes[again.id].display_name, 'Character (副本 2)');
  const copiedLeaf = duplicateOperandSubtree(deep, leaf); assert.equal(subtreeIds(copiedLeaf.nodes, copiedLeaf.id).size, 1);
  assert.deepEqual(treeErrors(again.nodes), []);
  assert.equal(nodeReferences(draft.slots, leaf).length, 1);
  for (const id of copiedIds) assert.equal(nodeReferences(draft.slots, id).length, 0);
});

test('nested references block deletion and incompatible type changes, compatible changes remain possible', () => {
  const { draft, nodes, root, leaf } = setup();
  assert.throws(() => deleteOperandNode(nodes, draft.slots, root), /nodeInUse/);
  assert.throws(() => deleteOperandNode(nodes, draft.slots, leaf), /nodeInUse/);
  const blocked = changeOperandType(nodes, draft.slots, leaf, 'string');
  assert.equal(blocked.nodes, nodes); assert.equal(blocked.blocked.length, 1);
  assert.ok(blocked.blocked[0].path.includes('/items/0/'));
  const unused = addOperandNode(nodes, root, 'value', 'Unused');
  assert.equal(changeOperandType(unused.nodes, draft.slots, unused.id, 'boolean').nodes[unused.id].value_type, 'boolean');
  const slot = documentToDraft(example)[0]; slot.branches = [{ condition: compare(reference(leaf), '==', reference(leaf)) }];
  assert.equal(changeOperandType(nodes, [slot], leaf, 'boolean').blocked.length, 0);
});

test('recursive conditions support mixed leaf types, native constants and reference/reference comparisons', () => {
  const { nodes, leaf } = setup();
  const tree = { kind: 'group', mode: 'ALL', items: [compare(reference(leaf), '>=', constant(-1.25)), { kind: 'group', mode: 'ANY', items: [compare(constant(''), '==', constant('  ')), compare(constant(true), '!=', constant(false)), compare(reference(leaf), '<=', reference(leaf))] }] };
  assert.deepEqual(conditionErrors(tree, nodes), []);
  assert.ok(conditionErrors(compare(constant('30'), '==', constant(30)), nodes).some((e) => e.key === 'operandTypeMismatch'));
  assert.ok(conditionErrors(compare(constant(false), '>', constant(true)), nodes).some((e) => e.key === 'comparatorMismatch'));
  assert.ok(conditionErrors(compare(constant(Infinity), '==', constant(0)), nodes).some((e) => e.key === 'finiteNumber'));
  assert.ok(conditionErrors(compare(reference(crypto.randomUUID()), '==', constant(0)), nodes).some((e) => e.key === 'missingOperand'));
});

test('import rejects cycles, invalid parents, names, orders, references, types and old condition shape with locations', () => {
  const { root, leaf } = setup();
  const cases = [
    [(d) => { d.operand_nodes[root].parent_id = root; }, 'cyclicParent'],
    [(d) => { d.operand_nodes[leaf].parent_id = leaf; }, 'invalidParent'],
    [(d) => { d.operand_nodes[leaf].parent_id = crypto.randomUUID(); }, 'invalidParent'],
    [(d) => { d.operand_nodes[leaf].display_name = ' '; }, 'requiredText'],
    [(d) => { d.operand_nodes[leaf].display_name = 123; }, 'requiredText'],
    [(d) => { d.operand_nodes[leaf].order = 10; }, 'invalidOrder'],
    [(d) => { Object.values(d.slots)[0].branches[0].condition.operand_a.reference_id = root; }, 'missingOperand'],
    [(d) => { Object.values(d.slots)[0].branches[0].condition.operand_b.value = true; }, 'operandTypeMismatch'],
  ];
  for (const [mutate, key] of cases) { const data = structuredClone(example); mutate(data); assert.ok(validateDocument(data).some((e) => e.key === key && e.path.startsWith('/'))); }
  const old = structuredClone(example); Object.values(old.slots)[0].branches[0].condition = { kind: 'comparison', opA: 'a', operator: '==', opB: 'b' };
  assert.ok(validateDocument(old).length);
  const names = structuredClone(example); const siblings = childrenOf(names.operand_nodes, root); names.operand_nodes[siblings[0][0]].name = siblings[1][1].name;
  assert.ok(validateDocument(names).filter((e) => e.key === 'duplicateNodeName').length >= 2);
});

test('full round-trip preserves tree and native constants; per-slot and week/day edits validate references', () => {
  const { draft } = setup();
  assert.deepEqual(compileProject(draft).data, example);
  const slot = structuredClone(draft.slots[0]); slot.branches[0].condition.operand_a.reference_id = crypto.randomUUID();
  assert.ok(compileDraft([slot], draft.operandNodes).errors.some((e) => e.key === 'missingOperand'));
});

test('deleting an unused subtree removes every descendant atomically and renumbers only its siblings', () => {
  const { draft, nodes, root } = setup();
  const copied = duplicateOperandSubtree(nodes, root);
  const nested = addOperandNode(copied.nodes, copied.id, 'group', 'Nested');
  const deep = addOperandNode(nested.nodes, nested.id, 'value', 'Deep value');
  const removedIds = subtreeIds(deep.nodes, copied.id);
  const next = deleteOperandNode(deep.nodes, draft.slots, copied.id);
  for (const id of removedIds) { assert.equal(next[id], undefined); assert.ok(deep.nodes[id]); }
  assert.deepEqual(next, nodes);
  assert.deepEqual(treeErrors(next), []);
  assert.deepEqual(deleteOperandNode(nodes, [], root), {});
  assert.throws(() => deleteOperandNode(nodes, draft.slots, root), /nodeInUse/);
  assert.deepEqual(compileProject({ ...draft, operandNodes: nodes }).errors, []);
});
