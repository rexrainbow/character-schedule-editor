import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { createProject, compileProject, projectToDraft } from '../src/core/model.js';
import { addOperandNode } from '../src/core/operandModel.js';

function example(name) {
  const data = JSON.parse(readFileSync(new URL(`../src/examples/${name}.json`, import.meta.url), 'utf8'));
  const draft = projectToDraft(data);
  draft.builtinTasks = { set_variable: { symbol: 'task_assignment' } };
  for (const [id, node] of Object.entries(draft.operandNodes)) if (node.source !== 'computed') node.symbol = 'var_' + id.replaceAll('-', '_');
  for (const task of draft.tasks) task.symbol = 'task_' + task.id.replaceAll('-', '_');
  return draft;
}
function allKeys(value) { return value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]) : []; }

test('runtime compiler emits standalone schema-valid data, debug names and environment contracts without editor metadata', () => {
  for (const name of ['example', 'expression-example', 'task-example', 'state-example', 'task-macro-example', 'sequence-example']) {
    const draft = example(name), before = structuredClone(draft), result = compileRuntime(draft);
    assert.deepEqual(result.errors, [], name); assert.deepEqual(validateRuntimeDocument(result.data), []);
    assert.deepEqual(draft, before);
    for (const key of ['icon', 'parent_id', 'order', 'owner', 'scope', 'uid', 'week_number', 'target_variable_id', 'task_id']) assert.ok(!allKeys(result.data).includes(key), `${name}: ${key}`);
    assert.equal(result.data.display_name, draft.project.name);
    assert.ok(Object.values(result.data.slots).every((slot) => typeof slot.display_name === 'string'));
    assert.ok(result.data.environment_requirements.tasks.every((task) => task.name.startsWith('task_')));
  }
});

test('application variables form a tree with UUID references and safe optional engine exports', () => {
  let draft = createProject();
  const group = addOperandNode({}, null, 'group', 'Application', 'application');
  const leaf = addOperandNode(group.nodes, group.id, 'value', 'Counter', 'application');
  leaf.nodes[leaf.id].symbol = '__proto__'; draft.operandNodes = leaf.nodes;
  const { data, errors } = compileRuntime(draft);
  assert.deepEqual(errors, []);
  assert.equal(data.application_variables[0].children[0].id, leaf.id);
  assert.equal(data.exports['operands.__proto__'].id, leaf.id);
  assert.equal(Object.getPrototypeOf(data.exports), Object.prototype);
  assert.deepEqual(data.environment_requirements, { variables: [], tasks: [] });
  assert.deepEqual(validateRuntimeDocument({ ...data, icon: 'forbidden' }).some((error) => error.key === 'schema_additionalProperties'), true);
});

test('missing environment keys and duplicate contracts block only runtime export', () => {
  const draft = example('state-example');
  const variable = Object.values(draft.operandNodes).find((node) => node.display_name === 'energy');
  variable.symbol = '';
  assert.ok(compileRuntime(draft).errors.some((error) => error.key === 'invalidSymbol'));
  variable.symbol = 'duplicate'; draft.tasks[0].symbol = 'duplicate';
  assert.deepEqual(compileProject(draft).errors, []);
  assert.deepEqual(compileRuntime(draft).errors, []);
});

test('environment reads/writes are merged and task arguments bind by definition position', () => {
  const draft = example('state-example'), { data, errors } = compileRuntime(draft);
  assert.deepEqual(errors, []);
  const energy = data.environment_requirements.variables.find((item) => item.display_name === 'energy');
  assert.equal(energy.access, 'read_write');
  const taskDraft = example('task-example'), runtime = compileRuntime(taskDraft).data;
  const task = Object.values(runtime.slots)[0].branches[0].task;
  const original = taskDraft.slots[0].branches[0].task;
  const definition = taskDraft.tasks.find((item) => item.id === original.task_id);
  assert.equal(task.task_key, definition.symbol);
  assert.equal(task.arguments.length, definition.parameters.length);
  assert.equal(task.arguments[0].value, original.arguments[definition.parameters[0].id].value);
});

test('sequence overrides belong to entries and private days are embedded without losing snapshots', () => {
  const draft = example('sequence-example'), { data, errors } = compileRuntime(draft);
  assert.deepEqual(errors, []);
  for (const sequence of draft.sequences) sequence.rows.forEach((row, i) => {
    assert.equal(data.sequences[sequence.id].entries[i].week_id, row.weekId);
    assert.deepEqual(data.sequences[sequence.id].entries[i].day_overrides, row.overrides);
  });
  for (const day of draft.days.filter((day) => day.scope === 'week_private')) {
    assert.equal(data.days[day.id], undefined);
    assert.deepEqual(data.weeks[day.owner.week_schedule_id].days[day.owner.weekday].slot_ids, day.slotIds);
  }
});
