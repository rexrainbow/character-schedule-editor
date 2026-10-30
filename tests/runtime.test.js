import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { runtimeProgramSchema } from '../src/runtime/programSchema.js';
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

test('runtime export is the name Program format, schema-valid, directly loadable and immutable', () => {
  for (const name of ['example', 'expression-example', 'task-example', 'state-example', 'task-macro-example', 'sequence-example']) {
    const draft = example(name), before = structuredClone(draft), result = compileRuntime(draft);
    assert.deepEqual(result.errors, [], name); assert.deepEqual(validateRuntimeDocument(result.data), []);
    assert.deepEqual(draft, before);
    assert.deepEqual(result.data, Program.fromProject(draft, { referenceMode: 'name' }).toJSON());
    assert.equal(result.data.format, 'schedule-runtime-program'); assert.equal(result.data.referenceMode, 'name');
    for (const key of ['icon', 'description', 'uid']) assert.ok(!allKeys(result.data).includes(key));
    assert.equal(result.data.display_name, draft.project.name);
    assert.ok(Object.entries(result.data.tasks).every(([key, item]) => key === item.name));
    assert.equal(new Runtime({ program: Program.fromJSON(result.data) }).status, 'idle');
  }
});

test('name catalogs preserve safe special names, hierarchy and reject unknown document fields', () => {
  let draft = createProject();
  const group = addOperandNode({}, null, 'group', 'Application', 'application');
  const leaf = addOperandNode(group.nodes, group.id, 'value', 'Counter', 'application');
  leaf.nodes[leaf.id].symbol = '__proto__'; draft.operandNodes = leaf.nodes;
  const { data, errors } = compileRuntime(draft); assert.deepEqual(errors, []);
  assert.equal(data.variables.__proto__.name, '__proto__');
  assert.equal(data.variables.__proto__.parent_id, Object.keys(data.variables).find((key) => key !== '__proto__'));
  assert.equal(Object.getPrototypeOf(data.variables), Object.prototype);
  assert.ok(validateRuntimeDocument({ ...data, icon: 'forbidden' }).length);
});

test('published Schema is the canonical Program schema and rejects wrong formats and missing references', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../src/schemas/runtime.schema.json', import.meta.url))), runtimeProgramSchema);
  assert.ok(validateRuntimeDocument({ format_version: 1 }).length);
  const data = compileRuntime(example('sequence-example')).data;
  const week = Object.values(data.weeks)[0]; week.days.mon = 'missing_day';
  assert.ok(validateRuntimeDocument(data).some((error) => error.key === 'missingReference'));
});

test('default export executes named arguments that resemble metadata and keeps all date references in name mode', async () => {
  const source = importBlueprint(`variables: {n: {initial: 0}}
task_macros:
  add:
    parameters: {icon: {type: number}, _amount: {type: number}}
    steps: [{builtin: increment_variable, target: n, value: params.icon + params._amount}]
slots:
  work: {branches: [{when: null, run: {macro: add, arguments: {icon: "2", _amount: "3"}}}]}
days:
  normal: {slots: [work, null, null]}
weeks:
  normal: {days: {mon: normal}}
sequences:
  life:
    weeks: [normal]
    events:
      e:
        kind: periodic
        start: {week: 1, weekday: mon}
        end: {week: 1, weekday: sun}
        every: 1
        day: normal
        count: {kind: day, day: normal}
`);
  assert.deepEqual(source.errors, []);
  const result = compileRuntime(source.draft); assert.deepEqual(result.errors, []);
  const data = result.data;
  assert.deepEqual(Object.keys(data.slots.work.branches[0].task.arguments), ['icon', '_amount']);
  assert.equal(data.sequences.life.eventGroups[0].countFilter.day_schedule_id, 'normal');
  assert.doesNotMatch(JSON.stringify(data), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const runtime = new Runtime({ program: Program.fromJSON(data) });
  await runtime.runDay({ sequence: 'life' });
  assert.equal(runtime.status, 'completed'); assert.equal(runtime.getVariable('n'), 10);
});

test('invalid names reject export while independent types may share names', () => {
  const draft = example('state-example'), variable = Object.values(draft.operandNodes).find((node) => node.display_name === 'energy');
  variable.symbol = ''; assert.ok(compileRuntime(draft).errors.some((error) => error.key === 'invalidSymbol'));
  variable.symbol = 'duplicate'; draft.tasks[0].symbol = 'duplicate';
  assert.deepEqual(compileRuntime(draft).errors, []);
});

test('external task definitions and named arguments use the same executable contract', () => {
  const draft = example('task-example'), runtime = compileRuntime(draft).data;
  const task = Object.values(runtime.slots)[0].branches[0].task;
  const original = draft.slots[0].branches[0].task, definition = draft.tasks.find((item) => item.id === original.task_id);
  assert.equal(task.task_id, definition.symbol);
  assert.equal(Object.keys(task.arguments).length, definition.parameters.length);
  assert.equal(task.arguments[runtime.tasks[definition.symbol].parameters[0].name].value, original.arguments[definition.parameters[0].id].value);
});

test('sequence rows and private days share directly loadable catalogs', () => {
  const draft = example('sequence-example'), { data, errors } = compileRuntime(draft); assert.deepEqual(errors, []);
  for (const sequence of draft.sequences) sequence.rows.forEach((row, i) => {
    const exported = data.sequences[sequence.symbol].rows[i];
    assert.equal(exported.weekId, draft.weeks.find((week) => week.id === row.weekId).symbol);
    for (const [day, id] of Object.entries(row.overrides)) assert.equal(exported.overrides[day], id == null ? id : draft.days.find((item) => item.id === id).symbol);
  });
  for (const day of draft.days.filter((day) => day.scope === 'week_private')) {
    assert.ok(data.days[day.symbol]);
    const week = draft.weeks.find((item) => item.id === day.owner.week_schedule_id);
    assert.equal(data.weeks[week.symbol].days[day.owner.weekday], day.symbol);
  }
});
