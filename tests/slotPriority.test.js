import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityMacroFixture, constant, reference } from './priorityMacroFixture.js';
import { compileProject, projectToDraft, duplicateSlot, validateDocument, taskSummary } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { simulateSlot, simulationInitialValues } from '../src/core/simulationModel.js';
import { nodeReferences, changeOperandType, deleteOperandNode } from '../src/core/operandModel.js';
import { macroUses, deleteTaskMacro, deleteMacroParameter } from '../src/core/taskMacroModel.js';
import { compileEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { flowControlFixture } from './flowControlFixture.js';
import { simulateSequenceDay } from '../src/core/daySimulationModel.js';

function fixture() {
  const result = priorityMacroFixture(), { draft, slot, priority } = result;
  slot.mode = 'priority'; slot.candidates = structuredClone(priority.candidates); slot.branches = [];
  draft.taskMacros = draft.taskMacros.filter((macro) => macro.id !== priority.id);
  return result;
}
test('inline priority slots round-trip and export ordered macro calls without creating a priority macro definition', () => {
  const { draft, slot } = fixture(), original = structuredClone(draft), project = compileProject(draft);
  assert.deepEqual(project.errors, []); assert.equal(project.data.slots[slot.id].mode, 'priority'); assert.equal(project.data.slots[slot.id].branches, undefined);
  assert.deepEqual(compileProject(projectToDraft(project.data)), project); assert.deepEqual(draft, original);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.data.slots[slot.id].candidates.length, 3); assert.equal(runtime.data.slots[slot.id].candidates[0].id, undefined);
  assert.equal(runtime.data.slots[slot.id].candidates[0].task_macro_id, slot.candidates[0].task.task_macro_id);
  assert.equal(runtime.data.slots[slot.id].branches, undefined);
  assert.match(taskSummary(slot, '?', draft.tasks, draft.taskMacros), /Eligible increase/);
  const copy = duplicateSlot(draft.slots, slot); assert.notEqual(copy.id, slot.id); assert.notEqual(copy.candidates[0].id, slot.candidates[0].id); assert.equal(copy.candidates[0].task.task_macro_id, slot.candidates[0].task.task_macro_id);
});
test('inline candidates use the shared first-match evaluator, skip unsafe later guards, and permit empty lists', () => {
  const { draft, slot, number, readonly } = fixture();
  let result = simulateSlot(draft, slot.id, { ...simulationInitialValues(draft), [readonly]: 0 });
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 15); assert.deepEqual(result.trace.map((entry) => [entry.result, !!entry.skipped]), [[false, false], [true, false], [undefined, true]]);
  assert.equal(result.trace[0].path, `/slots/${slot.id}/candidates/0/task`);
  slot.candidates = []; result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.trace[0].empty, true); assert.deepEqual(compileProject(draft).errors, []);
});
test('candidate references protect macro and variable edits, clear removed parameters and reconnect imported environments', () => {
  const { draft, slot, eligible, amount, number } = fixture();
  slot.candidates[0].task.arguments[amount.id] = reference(number);
  assert.ok(macroUses(draft.slots, eligible.id).some((use) => use.path === `/slots/${slot.id}/candidates/0/task`));
  assert.throws(() => deleteTaskMacro(draft, eligible.id));
  assert.ok(nodeReferences(draft.slots, number, draft.operandNodes, new Set(), draft.taskMacros).some((ref) => ref.path.includes('/candidates/0/task/arguments/')));
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, number, draft.taskMacros));
  assert.ok(changeOperandType(draft.operandNodes, draft.slots, number, 'string', draft.tasks, draft.taskMacros).blocked.length);
  const unused = { id: crypto.randomUUID(), display_name: 'Unused', type: 'number' }; eligible.parameters.push(unused);
  for (const item of slot.candidates) if (item.task.task_macro_id === eligible.id) item.task.arguments[unused.id] = constant(1);
  const cleared = deleteMacroParameter(draft, eligible.id, unused.id); assert.deepEqual(compileProject(cleared).errors, []); assert.ok(!Object.hasOwn(cleared.slots[0].candidates[0].task.arguments, unused.id));
  const env = compileEnvironment(draft).data, mapping = new Map(Object.keys(env.operand_nodes).map((id) => [id, crypto.randomUUID()]));
  env.environment.id = crypto.randomUUID(); env.operand_nodes = Object.fromEntries(Object.entries(env.operand_nodes).map(([id, node]) => [mapping.get(id), { ...node, parent_id: node.parent_id === null ? null : mapping.get(node.parent_id) }]));
  const imported = prepareEnvironmentImport(draft, env); assert.deepEqual(imported.errors, []); assert.equal(imported.draft.slots[0].candidates[0].task.arguments[amount.id].reference_id, mapping.get(number));
});
test('inline priority slots reject mixed content, duplicate IDs, primitive candidates and missing macro links', () => {
  const { draft, slot } = fixture(), project = compileProject(draft).data;
  for (const mutation of [
    (item) => { item.branches = []; },
    (item) => { item.candidates[0].task = { builtin: 'cancel_lower_priority_day' }; },
    (item) => { item.candidates[1].id = item.candidates[0].id; },
    (item) => { item.candidates[0].task.task_macro_id = crypto.randomUUID(); },
    (item) => { delete item.candidates; },
  ]) { const data = structuredClone(project); mutation(data.slots[slot.id]); assert.ok(validateDocument(data).length); }
});
test('day simulation runs direct candidates with overlay source context and flow-control priority', () => {
  const { draft, sequence, control } = flowControlFixture();
  control.mode = 'priority'; control.candidates = [{ id: crypto.randomUUID(), task: control.branches[0].task }]; control.branches = [];
  assert.deepEqual(compileProject(draft).errors, []);
  const result = simulateSequenceDay(draft, sequence.id, 0); assert.deepEqual(result.errors, []);
  assert.equal(result.trace.flatMap((phase) => phase.children).filter((entry) => entry.cancelled).length, 12);
  assert.equal(result.calls.find((call) => call.kind === 'control').context.name, 'High');
});
