import test from 'node:test';
import assert from 'node:assert/strict';
import { enumFixture, constant, parameterRef } from './enumFixture.js';
import { enumAccepts, enumArgumentErrors, enumDefinitionErrors } from '../src/core/enumParameters.js';
import { argumentErrors, conditionErrors, operandType } from '../src/core/operandModel.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { compileEnvironment, createEnvironmentInfo, createProjectWithEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { changeParameterType, duplicateTask } from '../src/core/taskModel.js';
import { changeMacroParameterType, deleteMacroParameter, duplicateTaskMacro } from '../src/core/taskMacroModel.js';
import { simulateSequenceDay } from './reference/daySimulationModel.js';
import { simulateSlot } from './reference/simulationModel.js';
import { slotLogicText } from '../src/core/logicOverviewModel.js';
import { translator } from '../src/i18n/index.js';
const t = translator('en');
test('enum contracts round-trip in projects, runtime macros, requirements and environments', () => {
  const { draft, macro, property, sequence } = enumFixture();
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.deepEqual(runtime.data.task_macros[macro.id].parameters[0].options, property.options);
  assert.deepEqual(runtime.data.task_macros[macro.id].steps[0].property, parameterRef(property));
  assert.equal(runtime.data.environment_requirements.tasks[0].parameters[1].type, 'enum');
  draft.tasks = [{ id: crypto.randomUUID(), display_name: 'Engine action', symbol: 'engine_action', parameters: [structuredClone(property)] }];
  draft.environment = createEnvironmentInfo('Engine');
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []);
  const created = createProjectWithEnvironment('New', 3, env.data);
  assert.deepEqual(created.tasks[0].parameters[0].options, property.options);
  for (const mutate of [(p) => p.options = [], (p) => p.options[0].value = '', (p) => p.type = 'string', (p) => p.options[0].extra = true]) {
    const bad = structuredClone(project.data); mutate(bad.task_macros[macro.id].parameters[0]); assert.ok(validateDocument(bad).length);
  }
  const duplicate = structuredClone(project.data); duplicate.task_macros[macro.id].parameters[0].options[1].value = property.options[0].value;
  assert.ok(validateDocument(duplicate).some((error) => error.key === 'enumOptionValueDuplicate'));
});
test('only declared constants and compatible enum parameters can supply option arguments', () => {
  const { property } = enumFixture(), narrow = { ...property, id: crypto.randomUUID(), options: property.options.slice(0, 1) };
  assert.equal(enumAccepts(property, narrow), true); assert.equal(enumAccepts(narrow, property), false);
  assert.deepEqual(enumArgumentErrors(parameterRef(narrow), property, [narrow]), []);
  for (const value of [constant('unknown'), constant(1), { type: 'reference', reference_id: crypto.randomUUID() }, { type: 'expression_macro_reference', expression_macro_id: crypto.randomUUID() }, parameterRef({ id: 'text' })]) assert.ok(argumentErrors(value, property, {}, '', [{ id: 'text', type: 'string' }]).length);
  assert.deepEqual(argumentErrors(constant('probability_percent'), property, {}), []);
  assert.ok(enumDefinitionErrors({ ...property, options: [{ display_name: '', value: ' bad ' }] }).length);
});
test('enum parameters compare as strings and drive builtin property/operation in day simulation', () => {
  const { draft, macro, property, operation, sequence, group, activity } = enumFixture();
  macro.eligibility = { kind: 'comparison', comparator: '==', operand_a: parameterRef(property), operand_b: constant('probability_percent') };
  assert.equal(operandType(parameterRef(property), {}, macro.parameters), 'string'); assert.deepEqual(conditionErrors(macro.eligibility, {}, '', macro.parameters), []);
  assert.deepEqual(compileProject(draft).errors, []);
  const result = simulateSequenceDay(draft, sequence.id, 0, undefined, undefined, t, {}, { [group.id]: true });
  assert.deepEqual(result.errors, []); assert.equal(result.eventValues[group.id].probability_percent, 15);
  assert.equal(result.calls[0].operation, 'increase');
  const text = slotLogicText(activity, { nodes: draft.operandNodes, macros: draft.taskMacros, depth: 'all', t });
  assert.ok(text.includes('"probability_percent"')); assert.ok(text.includes('"increase"'));
  assert.throws(() => deleteMacroParameter(draft, macro.id, operation.id), /macroParameterInUse/);
  const copy = duplicateTaskMacro(macro); assert.notEqual(copy.parameters[0].id, property.id); assert.deepEqual(copy.steps[0].task.property, parameterRef(copy.parameters[0])); assert.deepEqual(copy.steps[0].task.operation, parameterRef(copy.parameters[1]));
});
test('edits protect used option values and forwarding contracts while allowing label and order changes', () => {
  const { draft, macro, property } = enumFixture();
  assert.ok(changeMacroParameterType(draft, macro.id, property.id, { options: property.options.slice(1) }).blocked.length);
  assert.ok(changeMacroParameterType(draft, macro.id, property.id, { options: [...property.options, { display_name: 'Unsupported', value: 'unknown' }] }).blocked.length);
  assert.equal(changeMacroParameterType(draft, macro.id, property.id, { options: [...property.options].reverse().map((o) => ({ ...o, display_name: `Renamed ${o.display_name}` })) }).blocked.length, 0);
  const p = { ...structuredClone(property), id: crypto.randomUUID() }, task = { id: crypto.randomUUID(), display_name: 'Engine task', parameters: [p] };
  draft.tasks = [task]; macro.steps[0].task = { task_id: task.id, arguments: { [p.id]: constant('probability_percent') } };
  assert.ok(changeParameterType(draft, task.id, p.id, { options: p.options.slice(1) }).blocked.length);
  assert.equal(changeParameterType(draft, task.id, p.id, { options: p.options.slice(0, 1) }).blocked.length, 0);
});
test('environment replacement rejects narrowed enum contracts and accepts equivalent or broader options', () => {
  const { draft, property, macro } = enumFixture();
  draft.environment = createEnvironmentInfo('Engine');
  const task = { id: crypto.randomUUID(), display_name: 'Engine task', symbol: 'engine_task', parameters: [structuredClone(property)] }; draft.tasks = [task];
  macro.steps[0].task = { task_id: task.id, arguments: { [property.id]: parameterRef(property) } };
  const env = compileEnvironment(draft).data;
  assert.deepEqual(prepareEnvironmentImport(draft, env).errors, []);
  env.tasks[task.id].parameters[0].options = property.options.slice(0, 1);
  assert.ok(prepareEnvironmentImport(draft, env).errors.some((error) => error.key === 'environmentIncompatibleReference'));
});
test('engine task enum arguments export as positional strings and copied options are independent', () => {
  const { draft, property, activity } = enumFixture();
  const task = { id: crypto.randomUUID(), display_name: 'Engine task', symbol: 'engine_task', parameters: [structuredClone(property)] }; draft.tasks = [task];
  activity.branches[0].task = { task_id: task.id, arguments: { [property.id]: constant('probability_percent') } };
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.data.slots[activity.id].branches[0].task.arguments, [constant('probability_percent')]);
  assert.deepEqual(runtime.data.environment_requirements.tasks.find((item) => item.name === 'engine_task').parameters[0].options, property.options);
  const result = simulateSlot(draft, activity.id); assert.deepEqual(result.errors, []); assert.equal(result.calls[0].arguments[0].value, 'probability_percent');
  const copy = duplicateTask(task); copy.parameters[0].options[0].display_name = 'Renamed';
  assert.notEqual(task.parameters[0].options[0].display_name, 'Renamed');
});
