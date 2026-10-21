import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProjectSession } from '../src/core/projectApi.js';
import { executeCommand, executeBatch } from '../src/core/commands.js';
import { importBlueprint, exportBlueprint } from '../src/core/blueprint/index.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { parse } from 'yaml';

function good(result) { assert.deepEqual(result.errors, []); return result; }
test('persistent names resolve through API without UUIDs and are distinct from display labels', () => {
  const p = createProjectSession(undefined, { mode: 'all' });
  const created = good(executeCommand(p, { object: 'variables', action: 'create', values: { name: 'stamina', display_name: 'Energy', initial_value: 60 } }));
  const id = created.id;
  assert.equal(good(executeCommand(p, { object: 'variables', action: 'get', name: 'stamina' })).value.id, id);
  good(executeCommand(p, { object: 'variables', action: 'update', name: 'stamina', values: { name: 'energy', display_name: '' } }));
  const current = good(executeCommand(p, { object: 'variables', action: 'get', id: 'energy' })).value;
  assert.equal(current.id, id); assert.equal(current.name, 'energy'); assert.equal(current.display_name, '');
  assert.equal(p.getSnapshot().operandNodes[id].display_name, 'energy');
  const before = p.getSnapshot();
  for (const name of ['', 'bad name', 'bad.name', '1bad']) assert.equal(executeCommand(p, { object: 'variables', action: 'update', name: 'energy', values: { name } }).ok, false);
  assert.equal(p.getSnapshot(), before);
  assert.equal(executeCommand(p, { object: 'variables', action: 'create', values: { name: 'energy' } }).ok, false);
  good(executeCommand(p, { object: 'variables', action: 'create', values: { name: 'Energy' } }));
  good(executeCommand(p, { object: 'variables', action: 'create', values: { name: 'other_energy', display_name: 'Energy' } }));
  good(executeCommand(p, { object: 'slots', action: 'create', values: { name: 'energy' } }));
  const inherited = good(executeCommand(p, { object: 'variables', action: 'create', values: { name: 'inherit' } }));
  assert.equal(good(executeCommand(p, { object: 'variables', action: 'get', name: 'inherit' })).value.id, inherited.id);
});

test('name-only atomic API builds linked slots/days/weeks and copies do not collide', () => {
  const p = createProjectSession(undefined, { mode: 'all' });
  good(executeBatch(p, [
    { object: 'variables', action: 'create', values: { name: 'money', initial_value: 90 } },
    { object: 'taskMacros', action: 'create', values: { name: 'rest' } },
    { object: 'slots', action: 'create', values: { name: 'rest' } },
    { object: 'days', action: 'create', values: { name: 'holiday', slotIds: ['rest', null, null] } },
    { object: 'weeks', action: 'create', values: { name: 'normal', days: { mon: 'holiday', tue: null, wed: null, thu: null, fri: null, sat: null, sun: null } } },
  ]));
  const slot = good(executeCommand(p, { object: 'slots', action: 'get', name: 'rest' })).value;
  assert.equal(good(executeCommand(p, { object: 'days', action: 'get', name: 'holiday' })).value.slotIds[0], slot.id);
  good(executeCommand(p, { object: 'slots', action: 'duplicate', name: 'rest' }));
  good(executeCommand(p, { object: 'slots', action: 'duplicate', name: 'rest' }));
  const names = p.slots.list().map((item) => item.symbol);
  assert.equal(new Set(names).size, 3); assert.ok(names.includes('rest_copy'));
});

test('mapping blueprint roundtrip retains symbols; API rename updates expressions without broken UUID links', async () => {
  const source = await readFile(new URL('../docs/recipes/examples/life-simulation.yaml', import.meta.url), 'utf8');
  const imported = good(importBlueprint(source)), p = createProjectSession(imported.draft, { mode: 'all' });
  const old = good(executeCommand(p, { object: 'variables', action: 'get', name: 'stamina' })).value;
  good(executeCommand(p, { object: 'variables', action: 'update', name: 'stamina', values: { name: 'energy' } }));
  const output = good(p.exportBlueprint()).data;
  assert.match(output, /energy:/); assert.doesNotMatch(output, /\bstamina\b|engine_key|[0-9a-f]{8}-[0-9a-f]{4}-/);
  const rebuilt = good(importBlueprint(output));
  assert.ok(!rebuilt.draft.operandNodes[old.id]);
  assert.equal(good(exportBlueprint(rebuilt.draft)).data, output);
  const runtime = good(compileRuntime(p.getSnapshot())).data;
  assert.ok(Object.values(runtime.task_macros).some((item) => item.name === 'work'));
  assert.ok(Object.values(runtime.slots).some((item) => item.name === 'work'));
  assert.doesNotMatch(JSON.stringify(runtime), /engine_key/);
});

test('parameters and event references resolve in their owning scope by name', () => {
  const input = `variables:\n  n: {initial: 1}\ntask_macros:\n  increment:\n    parameters:\n      amount: {type: number}\n    steps:\n      - {builtin: increment_variable, target: n, value: params.amount}\nslots:\n  increment:\n    branches:\n      - {when: null, run: {macro: increment, arguments: {amount: "2"}}}\ndays:\n  d: {slots: [increment, null, null]}\nweeks:\n  w: {days: {mon: d}}\nsequences:\n  s:\n    weeks: [w]\n    events:\n      e: {kind: once, start: {week: 1, weekday: mon}, day: d}\n`;
  const p = createProjectSession(good(importBlueprint(input)).draft, { mode: 'all' });
  assert.equal(good(executeCommand(p, { object: 'events', action: 'get', sequenceId: 's', name: 'e' })).value.name, 'e');
  good(executeCommand(p, { object: 'slots', action: 'update', name: 'increment', values: { branches: [{ condition: null, task: { task_macro_id: 'increment', arguments: { amount: { type: 'constant', value: 3 } } } }] } }));
  assert.equal(parse(good(p.exportBlueprint()).data).slots.increment.branches[0].run.arguments.amount, '3');
  good(executeCommand(p, { object: 'taskMacros.parameters', action: 'update', ownerId: 'increment', name: 'amount', values: { name: 'delta' } }));
  const renamed = parse(good(p.exportBlueprint()).data);
  assert.equal(renamed.slots.increment.branches[0].run.arguments.delta, '3');
  assert.equal(renamed.task_macros.increment.steps[0].value, 'params.delta');
  const builtin = good(executeCommand(p, { object: 'tasks.builtins', action: 'list' })).value.find((item) => item.name === 'increment_variable');
  good(executeCommand(p, { object: 'tasks.builtins', action: 'update', name: 'increment_variable', values: { name: 'increase', parameters: builtin.parameters.map((parameter) => ({ ...parameter, name: parameter.id === 'value' ? 'amount' : parameter.name })) } }));
  const blueprint = good(p.exportBlueprint()).data;
  assert.equal(parse(blueprint).builtins.increment_variable.parameter_symbols.value, 'amount');
  const rebuilt = good(importBlueprint(blueprint));
  assert.equal(rebuilt.draft.builtinTasks.increment_variable.parameters.value.symbol, 'amount');
  assert.ok(good(compileRuntime(rebuilt.draft)).data.environment_requirements.tasks.some((item) => item.name === 'increase' && item.parameters.some((parameter) => parameter.name === 'amount')));
  assert.equal(p.validate().errors.length, 0);
});
