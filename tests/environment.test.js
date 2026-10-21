import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/examples/state-example.json' with { type: 'json' };
import { compileProject, projectToDraft } from '../src/core/model.js';
import { compileEnvironment, createEnvironmentInfo, createProjectWithEnvironment, prepareEnvironmentImport, validateEnvironment } from '../src/core/environmentModel.js';
import { addOperandNode } from '../src/core/operandModel.js';
import { compileRuntime } from '../src/core/runtimeModel.js';

function setup() {
  const draft = projectToDraft(example); draft.environment = createEnvironmentInfo('Engine environment');
  for (const [id, node] of Object.entries(draft.operandNodes)) if (node.source !== 'computed') node.symbol = 'var_' + id.replaceAll('-', '_');
  for (const task of draft.tasks) task.symbol = 'task_' + task.id.replaceAll('-', '_');
  draft.builtinTasks = { set_variable: { symbol: 'assign_state' } };
  return { draft, environment: compileEnvironment(draft).data };
}
function regenerateIds(environment) {
  const copy = structuredClone(environment), ids = new Map(Object.keys(copy.operand_nodes).map((id) => [id, crypto.randomUUID()]));
  copy.environment.id = crypto.randomUUID();
  copy.operand_nodes = Object.fromEntries(Object.entries(copy.operand_nodes).map(([id, node]) => [ids.get(id), { ...node, parent_id: ids.get(node.parent_id) ?? null }]));
  copy.tasks = Object.fromEntries(Object.values(copy.tasks).map((task) => [crypto.randomUUID(), { ...task, parameters: task.parameters.map((p) => ({ ...p, id: crypto.randomUUID() })) }]));
  return copy;
}

test('environment export isolates definitions, preserves IDs and metadata, and seeds new projects', () => {
  const { draft, environment } = setup();
  const app = addOperandNode(draft.operandNodes, null, 'value', 'Application counter', 'application'); draft.operandNodes = app.nodes;
  assert.deepEqual(validateEnvironment(environment), []);
  assert.deepEqual(compileEnvironment(draft).data, environment);
  assert.deepEqual(environment.expression_macros, {}); assert.equal(environment.slots, undefined);
  const created = createProjectWithEnvironment('New story', 3, environment);
  assert.equal(created.project.settings.slots_per_day, 6); assert.equal(created.project.name, 'New story'); assert.equal(created.slots.length, 0);
  assert.deepEqual(created.environment, environment.environment);
  assert.deepEqual(compileProject(created).errors, []);
  assert.deepEqual(projectToDraft(compileProject(created).data).environment, environment.environment);
  assert.deepEqual(compileRuntime(draft).data.environment_requirements.environment, environment.environment);
  draft.slots[0].branches[0].condition = { kind: 'group', mode: 'ALL', items: [] };
  assert.deepEqual(compileEnvironment(draft).errors, []); // Incomplete application content does not block environment export.
});

test('replacement reconnects UUID-changed variables, task signatures and macro expressions atomically by engine key', () => {
  const { draft, environment } = setup();
  const application = addOperandNode(draft.operandNodes, null, 'value', 'Application counter', 'application');
  draft.operandNodes = application.nodes;
  const before = structuredClone(draft);
  const replacement = regenerateIds(environment);
  const result = prepareEnvironmentImport(draft, replacement);
  assert.deepEqual(result.errors, []); assert.ok(result.stats.variables > 0); assert.ok(result.stats.tasks > 0);
  assert.deepEqual(draft, before); assert.deepEqual(compileProject(result.draft).errors, []);
  assert.deepEqual(result.draft.days, draft.days); assert.deepEqual(result.draft.weeks, draft.weeks);
  assert.deepEqual(Object.keys(result.draft.operandNodes).filter((id) => result.draft.operandNodes[id].source === 'computed'), Object.keys(draft.operandNodes).filter((id) => draft.operandNodes[id].source === 'computed'));
  assert.deepEqual(result.draft.operandNodes[application.id], draft.operandNodes[application.id]);
  const oldTaskIds = new Set(draft.tasks.map((task) => task.id));
  assert.ok(result.draft.tasks.every((task) => !oldTaskIds.has(task.id)));
});

test('same environment UUID keeps reference identity when display names and contract keys change', () => {
  const { draft, environment } = setup();
  for (const node of Object.values(environment.operand_nodes)) { node.name += '_renamed'; node.display_name += '_renamed'; }
  for (const task of Object.values(environment.tasks)) task.name += '_renamed';
  const result = prepareEnvironmentImport(draft, environment);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.draft.slots, draft.slots);
});

test('incompatible counts, missing/ambiguous references, permissions and task interfaces cannot replace the project', () => {
  const { draft, environment } = setup(), before = structuredClone(draft);
  const cases = [
    (data) => { data.settings.slots_per_day = 3; },
    (data) => { for (const node of Object.values(data.operand_nodes)) node.symbol = ''; },
    (data) => { for (const node of Object.values(data.operand_nodes)) if (node.display_name === 'energy') node.read_only = true; },
    (data) => { for (const task of Object.values(data.tasks)) task.parameters.push({ id: crypto.randomUUID(), display_name: 'Added', type: 'number' }); },
    (data) => { const source = Object.values(data.operand_nodes).find((node) => node.display_name === 'energy'); const siblings = Object.values(data.operand_nodes).filter((node) => node.parent_id === source.parent_id); data.operand_nodes[crypto.randomUUID()] = { ...source, display_name: 'Alias', order: siblings.length }; },
  ];
  for (const mutate of cases) {
    const data = regenerateIds(environment); mutate(data);
    const result = prepareEnvironmentImport(draft, data);
    assert.equal(result.draft, null); assert.ok(result.errors.length); assert.deepEqual(draft, before);
  }
});

test('environment schemas reject application variables and malformed files without changing source data', () => {
  const { environment } = setup();
  environment.operand_nodes[Object.keys(environment.operand_nodes)[0]].scope = 'application';
  assert.ok(validateEnvironment(environment).length);
  assert.ok(validateEnvironment({}).length);
  assert.ok(validateEnvironment({ ...environment, format_version: 99 }).length);
});
