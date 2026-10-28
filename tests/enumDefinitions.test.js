import { workingData } from '../src/core/symbols.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { enumDefinitionsFixture } from './enumDefinitionsFixture.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { compileEnvironment, createProjectWithEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { addEnumNode, changeEnumDefinitions, duplicateEnumSubtree, enumPath, enumSubtree, enumTreeErrors, moveEnumNode } from '../src/core/enumDefinitions.js';
import { simulateSequenceDay } from './reference/daySimulationModel.js';
import { changeMacroParameterType } from '../src/core/taskMacroModel.js';
import { translator } from '../src/i18n/index.js';
const t = translator('en');
test('shared enum definitions and parameter references round-trip without copied options', () => {
  const { draft, macro, property, propertyEnumId, operationEnumId } = enumDefinitionsFixture();
  const result = compileProject(draft); assert.deepEqual(result.errors, []);
  assert.equal(result.data.task_macros[macro.id].parameters[0].enum_id, propertyEnumId);
  assert.equal(result.data.task_macros[macro.id].parameters[0].options, undefined);
  assert.deepEqual(compileProject(projectToDraft(result.data)).data, result.data);
  for (const mutate of [(p) => p.enum_id = crypto.randomUUID(), (p) => p.options = [{ display_name: 'X', value: 'x' }]]) {
    const bad = structuredClone(result.data); mutate(bad.task_macros[macro.id].parameters[0]); assert.ok(validateDocument(bad).length);
  }
  const changed = changeMacroParameterType(draft, macro.id, property.id, { enum_id: operationEnumId }); assert.ok(changed.blocked.length);
});
test('resolved enum references execute and export runtime catalogs with no editor tree or icons', () => {
  const { draft, sequence, group, macro, propertyEnumId, enumGroupId } = enumDefinitionsFixture();
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.task_macros[macro.id].parameters[0].enum_id, propertyEnumId);
  assert.equal(runtime.data.enum_definitions[propertyEnumId].icon, undefined);
  assert.equal(runtime.data.enum_definitions[propertyEnumId].parent_id, undefined);
  assert.equal(runtime.data.enum_definitions[enumGroupId], undefined);
  assert.deepEqual(runtime.data.exports['enums.enum_event_property'], { kind: 'enums', id: propertyEnumId });
  const result = simulateSequenceDay(draft, sequence.id, 0, undefined, undefined, t, {}, { [group.id]: true });
  assert.deepEqual(result.errors, []); assert.equal(result.eventValues[group.id].probability_percent, 15);
  const bad = structuredClone(runtime.data); delete bad.enum_definitions[propertyEnumId]; assert.ok(validateRuntimeDocument(bad).some((error) => error.key === 'missingEnumDefinition'));
});
test('environment exports isolate their definitions and task references; application references cannot leak upward', () => {
  const { draft, property, propertyEnumId, operationEnumId } = enumDefinitionsFixture();
  draft.tasks = [{ id: crypto.randomUUID(), display_name: 'Engine task', symbol: 'engine_task', parameters: [structuredClone(property)] }];
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []);
  assert.equal(env.data.enum_definitions[propertyEnumId].scope, 'environment'); assert.equal(env.data.enum_definitions[operationEnumId], undefined);
  const next = createProjectWithEnvironment('New', 3, env.data); assert.deepEqual(next.enumNodes, workingData(env.data.enum_definitions));
  draft.tasks[0].parameters[0].enum_id = operationEnumId;
  assert.ok(compileProject(draft).errors.some((error) => error.key === 'enumEnvironmentOnly'));
  assert.ok(compileEnvironment(draft).errors.length);
});
test('definition changes keep valid names and order live, protect forwarding, and block referenced subtree deletion', () => {
  const { draft, propertyEnumId, enumGroupId } = enumDefinitionsFixture();
  const renamed = structuredClone(draft.enumNodes); renamed[propertyEnumId].display_name = 'Renamed'; renamed[propertyEnumId].options.reverse(); renamed[propertyEnumId].options[0].display_name = 'New label';
  assert.equal(changeEnumDefinitions(draft, renamed).blocked.length, 0);
  const narrowed = structuredClone(draft.enumNodes); narrowed[propertyEnumId].options = narrowed[propertyEnumId].options.slice(1);
  assert.ok(changeEnumDefinitions(draft, narrowed).blocked.length);
  const expanded = structuredClone(draft.enumNodes); expanded[propertyEnumId].options.push({ display_name: 'Invalid target', value: 'unknown' });
  assert.ok(changeEnumDefinitions(draft, expanded).blocked.length);
  const removed = Object.fromEntries(Object.entries(draft.enumNodes).filter(([id]) => !enumSubtree(draft.enumNodes, enumGroupId).has(id)));
  assert.ok(changeEnumDefinitions(draft, removed).blocked.some((error) => error.key === 'missingEnumDefinition'));
});
test('tree operations preserve scope, prevent cycles, duplicate independent UUIDs and options, and clear keys', () => {
  const { draft, propertyEnumId, enumGroupId, operationEnumId } = enumDefinitionsFixture();
  const copy = duplicateEnumSubtree(draft.enumNodes, enumGroupId);
  assert.equal(enumSubtree(copy.nodes, copy.id).size, 3);
  const copiedChild = Object.values(copy.nodes).find((node) => node.parent_id === copy.id && node.display_name === 'Event property');
  assert.equal(copiedChild.symbol, undefined); copiedChild.options[0].display_name = 'Changed'; assert.notEqual(draft.enumNodes[propertyEnumId].options[0].display_name, 'Changed');
  assert.throws(() => moveEnumNode(draft.enumNodes, enumGroupId, propertyEnumId), /invalidEnumParent/);
  assert.throws(() => moveEnumNode(draft.enumNodes, operationEnumId, enumGroupId), /invalidEnumParent/);
  const moved = moveEnumNode(draft.enumNodes, propertyEnumId, null); assert.equal(enumPath(moved, propertyEnumId), 'Event property'); assert.deepEqual(enumTreeErrors(moved), []);
  const added = addEnumNode(draft.enumNodes, enumGroupId, 'enum', 'Custom', 'application'); assert.equal(added.nodes[added.id].parent_id, null);
});
test('environment replacement reconnects enum references by key and rejects narrowed or missing definitions', () => {
  const { draft, propertyEnumId, macro } = enumDefinitionsFixture();
  const env = compileEnvironment(draft).data, replacement = structuredClone(env), mapping = new Map(Object.keys(env.enum_definitions).map((id) => [id, crypto.randomUUID()]));
  replacement.environment.id = crypto.randomUUID();
  replacement.enum_definitions = Object.fromEntries(Object.entries(env.enum_definitions).map(([id, node]) => [mapping.get(id), { ...node, parent_id: mapping.get(node.parent_id) ?? null }]));
  const result = prepareEnvironmentImport(draft, replacement); assert.deepEqual(result.errors, []);
  assert.equal(result.draft.taskMacros.find((item) => item.id === macro.id).parameters[0].enum_id, mapping.get(propertyEnumId));
  assert.ok(result.draft.enumNodes[draft.taskMacros[0].parameters[1].enum_id]);
  replacement.enum_definitions[mapping.get(propertyEnumId)].options.pop();
  assert.ok(prepareEnvironmentImport(draft, replacement).errors.some((error) => error.key === 'environmentIncompatibleReference'));
  delete replacement.enum_definitions[mapping.get(propertyEnumId)];
  assert.ok(prepareEnvironmentImport(draft, replacement).errors.some((error) => error.key === 'environmentMissingReference'));
});
