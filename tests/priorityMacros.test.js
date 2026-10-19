import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityMacroFixture, constant, parameter } from './priorityMacroFixture.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { simulateSlot, simulationInitialValues } from '../src/core/simulationModel.js';
import { createTaskMacro, createTaskStep, changeMacroMode, duplicateTaskMacro, deleteTaskMacro, deleteMacroParameter, changeMacroParameterType } from '../src/core/taskMacroModel.js';
import { changeOperandType, deleteOperandNode, nodeReferences, macroEntries, macroReaches } from '../src/core/operandModel.js';
import { compileEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { flowControlFixture } from './flowControlFixture.js';
import { simulateSequenceDay } from '../src/core/daySimulationModel.js';
const flatten = (events) => events.flatMap((event) => [event, ...flatten(event.children ?? [])]);

test('priority candidates evaluate arguments and eligibility once, stop at first match and preserve lazy later candidates', () => {
  const { draft, slot, eligible, amount, number, readonly } = priorityMacroFixture();
  const values = { ...simulationInitialValues(draft), [readonly]: 0 }, before = structuredClone({ draft, values });
  const result = simulateSlot(draft, slot.id, values);
  assert.deepEqual(result.errors, []); assert.equal(result.state[number], 15); assert.equal(result.calls.length, 1);
  const entries = flatten(result.trace), candidates = entries.filter((event) => event.kind === 'candidate');
  assert.deepEqual(candidates.map((event) => [event.result, !!event.skipped]), [[false, false], [true, false], [undefined, true]]);
  assert.equal(entries.filter((event) => event.kind === 'condition' && event.path === `/task_macros/${eligible.id}/eligibility`).length, 2);
  assert.equal(entries.filter((event) => event.kind === 'argument' && event.path.endsWith(`/arguments/${amount.id}`)).length, 2);
  assert.deepEqual({ draft, values }, before);
});

test('standalone conditional calls and sequential conditional steps skip ineligible bodies and see prior writes', () => {
  const { draft, eligible, amount, slot, number } = priorityMacroFixture();
  slot.branches[0].task = { task_macro_id: eligible.id, arguments: { [amount.id]: constant(20) } };
  const skipped = simulateSlot(draft, slot.id); assert.deepEqual(skipped.errors, []); assert.equal(skipped.calls.length, 0); assert.equal(skipped.state[number], 10);
  const sequence = createTaskMacro('Conditional steps');
  sequence.steps = [20, 5, 15].map((value) => ({ ...createTaskStep(), task: { task_macro_id: eligible.id, arguments: { [amount.id]: constant(value) } } }));
  draft.taskMacros.push(sequence); slot.branches[0].task = { task_macro_id: sequence.id, arguments: {} };
  const result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.state[number], 30); assert.equal(result.calls.length, 2);
});

test('empty, unmatched and selected empty actions finish without fallback; visited errors stop rather than count as false', () => {
  const { draft, priority, eligible, amount, slot, readonly } = priorityMacroFixture();
  priority.candidates.splice(1); let result = simulateSlot(draft, slot.id);
  assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0); assert.ok(flatten(result.trace).some((event) => event.label === 'No candidate was eligible; no action performed.'));
  priority.candidates = []; result = simulateSlot(draft, slot.id); assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0);
  const empty = createTaskMacro('Empty action'); draft.taskMacros.push(empty);
  eligible.steps[0].task = { task_macro_id: empty.id, arguments: {} };
  priority.candidates = [{ id: crypto.randomUUID(), task: { task_macro_id: eligible.id, arguments: { [amount.id]: constant(5) } } }, { id: crypto.randomUUID(), task: { task_macro_id: draft.taskMacros[1].id, arguments: {} } }];
  result = simulateSlot(draft, slot.id, { ...simulationInitialValues(draft), [readonly]: 0 }); assert.deepEqual(result.errors, []); assert.equal(result.calls.length, 0);
  priority.candidates.reverse(); result = simulateSlot(draft, slot.id, { ...simulationInitialValues(draft), [readonly]: 0 });
  assert.equal(result.errors[0].key, 'divisionByZero'); assert.ok(result.errors[0].path.includes('/eligibility/operand_a/operand_b')); assert.equal(result.calls.length, 0);
});

test('new macro modes round-trip and runtime exports shared conditions, scoped arguments and ordered candidates', () => {
  const { draft, priority, eligible, amount } = priorityMacroFixture();
  const project = compileProject(draft); assert.deepEqual(project.errors, []); assert.deepEqual(compileProject(projectToDraft(project.data)), project);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.data.task_macros[eligible.id].mode, 'sequence'); assert.equal(runtime.data.task_macros[eligible.id].eligibility.operand_a.type, 'environment_reference');
  assert.equal(runtime.data.task_macros[eligible.id].steps[0].value.parameter_id, amount.id);
  assert.equal(runtime.data.task_macros[priority.id].candidates.length, 3); assert.equal(runtime.data.task_macros[priority.id].candidates[0].id, undefined);
  assert.equal(runtime.data.task_macros[priority.id].candidates[0].task_macro_id, eligible.id);
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []); assert.equal(env.data.task_macros, undefined);
  const imported = prepareEnvironmentImport(draft, env.data); assert.deepEqual(imported.errors, []); assert.deepEqual(imported.draft.taskMacros, draft.taskMacros);
});

test('dependencies protect definitions, parameter types, referenced variables and macro mode changes', () => {
  const { draft, eligible, priority, amount, number } = priorityMacroFixture();
  assert.throws(() => deleteTaskMacro(draft, eligible.id)); assert.throws(() => deleteMacroParameter(draft, eligible.id, amount.id));
  assert.deepEqual(changeMacroMode(draft, eligible.id, 'branch').draft.taskMacros.find((item) => item.id === eligible.id).eligibility, eligible.eligibility);
  assert.ok(changeMacroParameterType(draft, eligible.id, amount.id, 'string').blocked.length);
  assert.ok(nodeReferences(draft.slots, number, draft.operandNodes, new Set(), draft.taskMacros).some((ref) => ref.path === `/task_macros/${eligible.id}/eligibility/operand_a`));
  assert.throws(() => deleteOperandNode(draft.operandNodes, draft.slots, number, draft.taskMacros));
  assert.ok(changeOperandType(draft.operandNodes, draft.slots, number, 'string', draft.tasks, draft.taskMacros).blocked.length);
  const copy = duplicateTaskMacro(eligible); assert.notEqual(copy.parameters[0].id, amount.id); assert.equal(copy.eligibility.operand_b.parameter_id, copy.parameters[0].id); assert.equal(copy.steps[0].task.value.parameter_id, copy.parameters[0].id);
  const listCopy = duplicateTaskMacro(priority); assert.notEqual(listCopy.candidates[0].id, priority.candidates[0].id); assert.equal(listCopy.candidates[0].task.task_macro_id, eligible.id);
  const unused = { id: crypto.randomUUID(), display_name: 'Unused', type: 'number' }; eligible.parameters.push(unused);
  for (const candidate of priority.candidates) if (candidate.task.task_macro_id === eligible.id) candidate.task.arguments[unused.id] = constant(1);
  const removed = deleteMacroParameter(draft, eligible.id, unused.id);
  assert.deepEqual(compileProject(removed).errors, []);
  assert.ok(removed.taskMacros.find((item) => item.id === priority.id).candidates.every((entry) => !Object.hasOwn(entry.task.arguments, unused.id)));
});

test('imports reject primitive candidates, extra fields, duplicate candidate IDs, invalid conditions and call cycles', () => {
  const { draft, priority, eligible, slot } = priorityMacroFixture(), project = compileProject(draft).data;
  for (const mutation of [
    (data) => { data.task_macros[priority.id].candidates[0].task = { builtin: 'cancel_lower_priority_day' }; },
    (data) => { data.task_macros[eligible.id].task = { task_macro_id: priority.id, arguments: {} }; },
    (data) => { data.task_macros[priority.id].candidates[1].id = data.task_macros[priority.id].candidates[0].id; },
    (data) => { data.task_macros[eligible.id].eligibility = { type: 'constant', value: true }; },
  ]) { const data = structuredClone(project); mutation(data); assert.ok(validateDocument(data).length); }
  const sequence = createTaskMacro('Cycle'); sequence.steps = [{ ...createTaskStep(), task: { task_macro_id: eligible.id, arguments: { [eligible.parameters[0].id]: constant(1) } } }]; draft.taskMacros.push(sequence);
  eligible.steps[0].task = { task_macro_id: sequence.id, arguments: {} };
  assert.ok(compileProject(draft).errors.some((error) => error.key === 'taskMacroCycle'));
  assert.equal(macroReaches(draft.taskMacros, sequence.id, eligible.id), true);
  assert.ok(simulateSlot(draft, slot.id).errors.length);
});

test('priority-selected conditional tasks retain overlay source priority for flow control', () => {
  const { draft, sequence, control, macro } = flowControlFixture();
  const eligible = createTaskMacro('Eligible override'); eligible.steps = [{ ...createTaskStep(), task: { task_macro_id: macro.id, arguments: {} } }];
  const priority = createTaskMacro('Choose override', 'priority'); priority.candidates = [{ id: crypto.randomUUID(), task: { task_macro_id: eligible.id, arguments: {} } }];
  draft.taskMacros.push(eligible, priority); control.branches[0].task = { task_macro_id: priority.id, arguments: {} };
  assert.deepEqual(compileProject(draft).errors, []);
  const result = simulateSequenceDay(draft, sequence.id, 0); assert.deepEqual(result.errors, []);
  assert.equal(result.trace.flatMap((phase) => phase.children).filter((entry) => entry.cancelled).length, 12);
  assert.equal(result.calls.find((call) => call.kind === 'control').context.name, 'High');
});

test('environment replacement reconnects condition, body targets and candidate arguments with changed UUIDs', () => {
  const { draft, priority, eligible, amount, number } = priorityMacroFixture();
  priority.candidates[0].task.arguments[amount.id] = { type: 'reference', reference_id: number };
  const environment = compileEnvironment(draft).data, mapping = new Map(Object.keys(environment.operand_nodes).map((id) => [id, crypto.randomUUID()]));
  environment.environment.id = crypto.randomUUID();
  environment.operand_nodes = Object.fromEntries(Object.entries(environment.operand_nodes).map(([id, node]) => [mapping.get(id), { ...node, parent_id: node.parent_id === null ? null : mapping.get(node.parent_id) }]));
  const result = prepareEnvironmentImport(draft, environment); assert.deepEqual(result.errors, []);
  const conditional = result.draft.taskMacros.find((item) => item.id === eligible.id), candidates = result.draft.taskMacros.find((item) => item.id === priority.id);
  assert.equal(conditional.eligibility.operand_a.reference_id, mapping.get(number));
  assert.equal(conditional.steps[0].task.target_variable_id, mapping.get(number));
  assert.equal(candidates.candidates[0].task.arguments[amount.id].reference_id, mapping.get(number));
  assert.deepEqual(compileProject(result.draft).errors, []);
});
