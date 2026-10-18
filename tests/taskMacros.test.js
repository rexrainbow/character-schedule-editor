import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/task-macro-example.json' with { type: 'json' };
import { addBranch, compileProject, moveBranch, projectToDraft, removeBranch, validateDocument } from '../src/model.js';
import { applyComputedDefinition, changeOperandType, deleteOperandNode, formatCondition, nodeReferences } from '../src/operandModel.js';
import { changeMacroMode, changeMacroParameterType, createTaskMacro, deleteMacroParameter, deleteTaskMacro, duplicateTaskMacro, macroParameterReferences, macroUses } from '../src/taskMacroModel.js';
import { changeParameterType, deleteParameter, taskUses } from '../src/taskModel.js';

const constant = (value) => ({ type: 'constant', value });
function setup() { const draft = projectToDraft(example); return { draft, branch: draft.taskMacros.find((m) => m.mode === 'branch'), sequence: draft.taskMacros.find((m) => m.mode === 'sequence') }; }
test('both macro modes round-trip without branch editor metadata; branch operations keep ELSE last', () => {
  const { draft, branch } = setup(); assert.deepEqual(validateDocument(example), []);
  assert.deepEqual(compileProject(draft), { data: example, errors: [] });
  assert.ok(branch.branches.every((b) => b.uid));
  assert.match(formatCondition(branch.branches[0].condition, draft.operandNodes, '?', branch.parameters), /Parameters.Speed/);
  const added = addBranch(branch.branches); assert.equal(added.at(-1).condition, null);
  assert.equal(moveBranch(added, 1, -1)[0].uid, added[1].uid);
  assert.deepEqual(removeBranch(added, added.length - 1), added);
  assert.ok(!JSON.stringify(compileProject(draft).data).includes('"uid"'));
});
test('direct and indirect circular macro calls are rejected', () => {
  const { branch, sequence } = setup();
  for (const [owner, target] of [[branch, branch], [sequence, branch], [sequence, sequence]]) {
    const data = structuredClone(example), macro = data.task_macros[owner.id], entry = owner.mode === 'branch' ? macro.branches[0] : macro.steps[0];
    entry.task = { task_macro_id: target.id, arguments: {} };
    assert.ok(validateDocument(data).some((e) => e.key === 'taskMacroCycle'));
  }
  const bad = structuredClone(example); bad.task_macros[branch.id].branches.at(-1).condition = constant(true);
  assert.ok(validateDocument(bad).some((e) => e.key === 'elseLast'));
  const both = structuredClone(example); both.task_macros[branch.id].steps = [];
  assert.ok(validateDocument(both).some((e) => e.key === 'schema_additionalProperties'));
});
test('condition and call expressions resolve in the caller scope and reject foreign/global leaks', () => {
  const { branch, sequence } = setup();
  const data = structuredClone(example);
  data.task_macros[branch.id].branches[0].condition.items[0].operand_a.parameter_id = sequence.parameters[2].id;
  assert.ok(validateDocument(data).some((e) => e.key === 'missingMacroParameter' && e.path.includes('/condition/')));
  data.task_macros[branch.id].branches[0].condition = structuredClone(example.task_macros[branch.id].branches[0].condition);
  data.task_macros[branch.id].branches[0].task.arguments[sequence.parameters[1].id].operand_a.parameter_id = sequence.parameters[1].id;
  assert.ok(validateDocument(data).some((e) => e.key === 'missingMacroParameter' && e.path.includes('/task/arguments/')));
});
test('copying branch macros remaps local conditions and call values while retaining target UUIDs', () => {
  const { draft, branch, sequence } = setup(), copy = duplicateTaskMacro(branch);
  assert.notEqual(copy.id, branch.id); assert.equal(copy.mode, 'branch');
  assert.notEqual(copy.branches[0].uid, branch.branches[0].uid);
  assert.equal(copy.branches[0].condition.items[0].operand_a.parameter_id, copy.parameters[2].id);
  assert.equal(copy.branches[0].task.task_macro_id, sequence.id);
  assert.equal(copy.branches[0].task.arguments[sequence.parameters[1].id].operand_a.parameter_id, copy.parameters[1].id);
  draft.taskMacros.push(copy); assert.deepEqual(compileProject(draft).errors, []);
  assert.ok(macroParameterReferences(copy, copy.parameters[1].id).some((ref) => ref.path.includes('/condition/')));
});
test('mode changes preserve identity and parameters, clear content and protect incoming callers', () => {
  const { draft, branch, sequence } = setup();
  assert.notEqual(changeMacroMode(draft, sequence.id, 'branch').draft, draft);
  assert.deepEqual(changeMacroMode(draft, sequence.id, 'branch').blocked, []);
  const changed = changeMacroMode(draft, branch.id, 'sequence').draft.taskMacros.find((m) => m.id === branch.id);
  assert.deepEqual(changed.parameters, branch.parameters); assert.equal(changed.display_name, branch.display_name); assert.deepEqual(changed.steps, []); assert.ok(!('branches' in changed));
  const unused = createTaskMacro('Unused'); draft.taskMacros.push(unused);
  const converted = changeMacroMode(draft, unused.id, 'branch').draft.taskMacros.at(-1);
  assert.equal(converted.branches.length, 1); assert.equal(converted.branches[0].condition, null); assert.ok(!('steps' in converted));
});
test('macro and parameter deletion/type changes protect conditions and inter-macro arguments', () => {
  const { draft, branch, sequence } = setup();
  assert.throws(() => deleteTaskMacro(draft, sequence.id), /taskMacroInUse/);
  assert.ok(macroUses(draft.slots, sequence.id, draft.taskMacros).some((use) => use.ownerId === branch.id));
  assert.throws(() => deleteMacroParameter(draft, branch.id, branch.parameters[2].id), /macroParameterInUse/);
  assert.equal(changeMacroParameterType(draft, branch.id, branch.parameters[1].id, 'string').draft, draft);
  // Remove the target's internal usage; incoming branch expressions still constrain its signature.
  sequence.steps = [sequence.steps[1]];
  assert.ok(changeMacroParameterType(draft, sequence.id, sequence.parameters[1].id, 'string').blocked.some((use) => use.ownerId === branch.id));
  const removed = deleteMacroParameter(draft, sequence.id, sequence.parameters[1].id);
  assert.ok(!(sequence.parameters[1].id in removed.taskMacros.find((m) => m.id === branch.id).branches[0].task.arguments));
  assert.deepEqual(compileProject(removed).errors, []);
});
test('global variable and computed result protection include macro branch conditions', () => {
  const { draft, branch } = setup(), id = crypto.randomUUID();
  draft.operandNodes[id] = { node_type: 'value', display_name: 'ConditionOnly', value_type: 'number', parent_id: null, order: 1 };
  branch.branches[0].condition.items[1].items[0].operand_b = { type: 'reference', reference_id: id };
  assert.ok(nodeReferences(draft.slots, id, draft.operandNodes, new Set(), draft.taskMacros).some((ref) => ref.path.includes('/branches/0/condition/')));
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, id, draft.taskMacros), /nodeInUse/);
  assert.equal(changeOperandType(draft.operandNodes, draft.slots, id, 'string', draft.tasks, draft.taskMacros).nodes, draft.operandNodes);
  draft.operandNodes[id] = { ...draft.operandNodes[id], source: 'computed', definition: { kind: 'number', expression: constant(1) } };
  branch.branches[0].condition.items[1].items[0].operand_b = { type: 'expression_macro_reference', expression_macro_id: id };
  const result = applyComputedDefinition(draft.operandNodes, draft.slots, id, { kind: 'boolean', condition: { kind: 'comparison', operand_a: constant(1), comparator: '==', operand_b: constant(1) } }, draft.tasks, draft.taskMacros);
  assert.ok(result.errors.some((e) => e.path.includes('/branches/0/condition/')));
});
test('primitive task parameter deletion and type edits include branch macro uses', () => {
  const { draft, branch } = setup(), use = branch.branches.at(-1).task, task = draft.tasks.find((t) => t.id === use.task_id), parameter = task.parameters[0];
  assert.ok(taskUses(draft.slots, task.id, draft.taskMacros).some((ref) => ref.path.includes('/branches/1/task')));
  assert.ok(changeParameterType(draft, task.id, parameter.id, 'number').blocked.some((ref) => ref.path.includes('/branches/')));
  const removed = deleteParameter(draft, task.id, parameter.id);
  assert.ok(!(parameter.id in removed.taskMacros.find((m) => m.id === branch.id).branches.at(-1).task.arguments));
  assert.deepEqual(compileProject(removed).errors, []);
});
