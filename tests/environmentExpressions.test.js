import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, compileProject, projectToDraft } from '../src/model.js';
import { createProjectWithEnvironment, compileEnvironment, prepareEnvironmentImport, validateEnvironment } from '../src/environmentModel.js';
import { compileRuntime } from '../src/runtimeModel.js';
import { addComputedNode, addOperandNode, isComputed, computedErrors, applyComputedDefinition } from '../src/operandModel.js';
import { addProgressDefinitions } from '../src/progressEnvironment.js';
import { translator } from '../src/i18n.js';

test('new default environments include five read-only progress variables and three scoped boolean macros', () => {
  for (const locale of ['en', 'zh-TW']) {
    const t = translator(locale), draft = createProjectWithEnvironment('Progress', 3, null, undefined, t);
    const nodes = draft.operandNodes, values = Object.values(nodes).filter((n) => !isComputed(n) && n.node_type === 'value');
    assert.equal(values.length, 5); assert.ok(values.every((n) => n.read_only && n.scope === 'environment' && n.value_type === 'number'));
    assert.ok(values.some((n) => n.display_name === t('progressWeek')));
    assert.equal(Object.values(nodes).filter(isComputed).length, 3);
    assert.deepEqual(addProgressDefinitions(nodes, 3, t), nodes, 're-adding preserves UUIDs and definitions');
    const project = compileProject(draft); assert.deepEqual(project.errors, []);
    assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
    const env = compileEnvironment(draft); assert.deepEqual(env.errors, []); assert.equal(Object.keys(env.data.expression_macros).length, 3);
    const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
    const [id] = Object.entries(nodes).find(([, n]) => n.engine_key === 'schedule.is_first_slot');
    const macro = runtime.data.expression_macros[id];
    assert.equal(macro.display_name, t('progressFirstSlot'));
    assert.deepEqual(macro.definition.condition.operand_a, { type: 'environment_reference', engine_key: 'schedule.current_slot' });
    assert.equal(macro.scope, undefined); assert.equal(runtime.data.environment_variables[0].children.length, 5);
  }
});

test('environment expressions cannot depend on application data; application expressions may use both layers', () => {
  let draft = createProjectWithEnvironment('Progress', 3, null);
  const envId = Object.entries(draft.operandNodes).find(([, n]) => n.engine_key === 'schedule.is_first_slot')[0];
  const app = addOperandNode(draft.operandNodes, null, 'value', 'Local', 'application'); draft.operandNodes = app.nodes;
  const definition = { kind: 'number', expression: { type: 'reference', reference_id: app.id } };
  assert.ok(applyComputedDefinition(draft.operandNodes, [], envId, definition).errors.some((e) => e.key === 'environmentExpressionDependency'));
  const user = addComputedNode(draft.operandNodes, null, 'Ready'); draft.operandNodes = user.nodes;
  draft.operandNodes[user.id] = { ...draft.operandNodes[user.id], value_type: 'boolean', definition: { kind: 'boolean', condition: { kind: 'comparison', operand_a: { type: 'expression_macro_reference', expression_macro_id: envId }, comparator: '==', operand_b: { type: 'constant', value: true } } } };
  assert.deepEqual(compileProject(draft).errors, []);
  assert.deepEqual(compileRuntime(draft).errors, []);
  assert.equal(compileEnvironment(draft).data.expression_macros[user.id], undefined);
  draft.operandNodes[envId].definition = { kind: 'boolean', condition: { kind: 'comparison', operand_a: { type: 'expression_macro_reference', expression_macro_id: user.id }, comparator: '==', operand_b: { type: 'constant', value: true } } };
  assert.ok(computedErrors(draft.operandNodes).some((e) => e.key === 'environmentExpressionDependency'));
});

test('environment replacement rebinds application references to environment macros atomically', () => {
  const draft = createProjectWithEnvironment('Progress', 3, null), env = compileEnvironment(draft).data;
  const oldId = Object.keys(env.expression_macros)[0], nextId = crypto.randomUUID();
  const added = addComputedNode(draft.operandNodes, null, 'Application reference'); draft.operandNodes = added.nodes;
  draft.operandNodes[added.id] = { ...draft.operandNodes[added.id], value_type: 'boolean', definition: { kind: 'boolean', condition: { kind: 'comparison', operand_a: { type: 'expression_macro_reference', expression_macro_id: oldId }, comparator: '==', operand_b: { type: 'constant', value: true } } } };
  env.environment.id = crypto.randomUUID(); env.expression_macros[nextId] = env.expression_macros[oldId]; delete env.expression_macros[oldId];
  const result = prepareEnvironmentImport(draft, env); assert.deepEqual(result.errors, []);
  assert.equal(result.draft.operandNodes[added.id].definition.condition.operand_a.expression_macro_id, nextId);
  assert.equal(draft.operandNodes[added.id].definition.condition.operand_a.expression_macro_id, oldId);
  env.expression_macros[nextId].value_type = 'number'; env.expression_macros[nextId].definition = { kind: 'number', expression: { type: 'constant', value: 0 } };
  assert.equal(prepareEnvironmentImport(draft, env).draft, null);
  env.expression_macros[nextId] = { ...Object.values(env.expression_macros)[0], scope: 'application' };
  assert.ok(validateEnvironment(env).length);
  const duplicate = compileEnvironment(draft).data; duplicate.expression_macros[Object.keys(duplicate.operand_nodes)[0]] = duplicate.expression_macros[oldId];
  assert.ok(validateEnvironment(duplicate).some((e) => e.key === 'duplicateId'));
});
