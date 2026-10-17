import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/state-example.json' with { type: 'json' };
import { compileProject, projectToDraft, validateDocument } from '../src/model.js';
import { addComputedNode, applyComputedDefinition, changeOperandType, changeReadOnly, defaultDefinition, deleteOperandNode, documentNodes, duplicateOperandSubtree, expressionNodes, nodeReferences, referenceOperand, variableNodes } from '../src/operandModel.js';
import { changeMacroParameterType, deleteMacroParameter, duplicateTaskMacro, macroParameterReferences } from '../src/taskMacroModel.js';
const constant = (value) => ({ type: 'constant', value });
function setup() {
  const draft = projectToDraft(example), find = (name) => Object.keys(draft.operandNodes).find((id) => draft.operandNodes[id].display_name === name);
  return { draft, energy: find('energy'), mood: find('mood'), ready: find('ready'), readonly: find('max_energy'), macro: find('can_act'), branch: draft.taskMacros.find((m) => m.mode === 'branch'), sequence: draft.taskMacros.find((m) => m.mode === 'sequence') };
}
test('variable-space and expression macro collections are distinct and assignments round-trip', () => {
  assert.deepEqual(validateDocument(example), []);
  const { draft } = setup(), compiled = compileProject(draft);
  assert.deepEqual(compiled, { data: example, errors: [] });
  assert.ok(Object.values(compiled.data.operand_nodes).every((node) => !node.source && !node.definition));
  assert.ok(Object.values(compiled.data.expression_macros).every((macro) => !Object.hasOwn(macro, 'parent_id') && !Object.hasOwn(macro, 'read_only')));
  assert.ok(Object.values(variableNodes(draft.operandNodes)).every((node) => node.node_type !== 'value' || typeof node.read_only === 'boolean'));
  assert.equal(Object.keys(expressionNodes(draft.operandNodes)).length, 3);
});
test('read-reference variants cannot cross collections or become write targets', () => {
  const { energy, macro } = setup();
  for (const value of [{ type: 'reference', reference_id: macro }, { type: 'expression_macro_reference', expression_macro_id: energy }]) {
    const bad = structuredClone(example); Object.values(bad.slots)[1].branches[0].task.value = value;
    assert.ok(validateDocument(bad).some((e) => e.key === 'missingOperand'));
  }
  for (const id of [macro, Object.keys(example.operand_nodes)[0], crypto.randomUUID()]) {
    const bad = structuredClone(example); Object.values(bad.slots)[1].branches[0].task.target_variable_id = id;
    assert.ok(validateDocument(bad).some((e) => e.key === 'invalidWriteTarget' && e.path.endsWith('/target_variable_id')));
  }
});
test('write references prevent read-only conversion and deletion in slots and both macro modes', () => {
  const { draft, energy, mood, ready, readonly } = setup();
  for (const id of [energy, mood, ready]) {
    const refs = nodeReferences(draft.slots, id, draft.operandNodes, new Set(), draft.taskMacros).filter((ref) => ref.access === 'write');
    assert.equal(refs.length, 1);
    assert.equal(changeReadOnly(draft.operandNodes, draft.slots, id, true, draft.taskMacros).nodes, draft.operandNodes);
    assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, id, draft.taskMacros), /nodeInUse/);
  }
  assert.equal(changeReadOnly(draft.operandNodes, draft.slots, readonly, false, draft.taskMacros).blocked.length, 0);
});
test('target type edits check assigned values even when the value never reads the target', () => {
  const { draft, ready, macro } = setup();
  const changed = changeOperandType(draft.operandNodes, draft.slots, ready, 'string', draft.tasks, draft.taskMacros);
  assert.equal(changed.nodes, draft.operandNodes); assert.ok(changed.blocked.some((ref) => ref.access === 'write'));
  const result = applyComputedDefinition(draft.operandNodes, draft.slots, macro, defaultDefinition('number'), draft.tasks, draft.taskMacros);
  assert.ok(result.errors.some((e) => e.key === 'writeTypeMismatch' && e.path.endsWith('/task/value')));
});
test('assignment expressions participate in local parameter typing, deletion and copy remapping', () => {
  const { draft, branch, mood } = setup(), p = branch.parameters[0], refs = macroParameterReferences(branch, p.id);
  assert.ok(refs.some((ref) => ref.path.endsWith('/task/value')));
  assert.throws(() => deleteMacroParameter(draft, branch.id, p.id), /macroParameterInUse/);
  assert.equal(changeMacroParameterType(draft, branch.id, p.id, 'number').draft, draft);
  const copy = duplicateTaskMacro(branch), assignment = copy.branches.at(-1).task;
  assert.equal(assignment.target_variable_id, mood); assert.equal(assignment.value.parameter_id, copy.parameters[0].id);
  draft.taskMacros.push(copy); assert.deepEqual(compileProject(draft).errors, []);
});
test('imports reject read-only writes, incompatible/native malformed values and conflicting actions', () => {
  const { readonly } = setup();
  for (const change of [
    (use) => { use.target_variable_id = readonly; },
    (use) => { use.value = constant('wrong'); },
    (use) => { use.task_id = crypto.randomUUID(); },
    (use) => { use.value = null; },
    (use) => { use.builtin = 'unknown'; },
  ]) { const bad = structuredClone(example); change(Object.values(bad.slots)[1].branches[0].task); assert.ok(validateDocument(bad).length); }
  const bad = structuredClone(example), leaf = Object.values(bad.operand_nodes).find((n) => n.node_type === 'value'); leaf.read_only = 'false';
  assert.ok(validateDocument(bad).some((e) => e.key === 'schema_type' && e.path.endsWith('/read_only')));
});
test('cross-collection UUID collisions and macro-in-namespace persistence reject', () => {
  const { energy, macro } = setup();
  const collision = structuredClone(example); collision.expression_macros[energy] = collision.expression_macros[macro];
  assert.ok(validateDocument(collision).some((e) => e.key === 'duplicateId'));
  const old = structuredClone(example); old.operand_nodes[macro] = documentNodes(example)[macro];
  assert.ok(validateDocument(old).some((e) => e.key === 'schema_additionalProperties'));
});
test('copying variable space does not copy expression macros and macro copies preserve read dependencies', () => {
  const { draft, energy } = setup(), group = Object.keys(example.operand_nodes)[0];
  const before = Object.keys(expressionNodes(draft.operandNodes)), copy = duplicateOperandSubtree(draft.operandNodes, group);
  assert.deepEqual(Object.keys(expressionNodes(copy.nodes)), before);
  const macro = addComputedNode(draft.operandNodes, group, 'New');
  const nodes = applyComputedDefinition(macro.nodes, [], macro.id, { kind: 'number', expression: referenceOperand(energy, macro.nodes) }).nodes;
  const copied = duplicateOperandSubtree(nodes, macro.id);
  assert.deepEqual(copied.nodes[copied.id].definition.expression, { type: 'reference', reference_id: energy });
});
