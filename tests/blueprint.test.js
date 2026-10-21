import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { importBlueprint, exportBlueprint, parseExpression, formatExpression, blueprintSchema } from '../src/core/blueprint/index.js';
import { projectToDraft } from '../src/core/model.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { simulateSlot, simulationInitialValues } from '../src/core/simulationModel.js';
import { simulateSequenceDay } from '../src/core/daySimulationModel.js';

const example = new URL('./fixtures/life-simulation.yaml', import.meta.url);
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
function good(result) { assert.deepEqual(result.errors, []); return result; }
function roundtrip(draft) {
  const first = good(exportBlueprint(draft)).data;
  const rebuilt = good(importBlueprint(first));
  assert.equal(good(exportBlueprint(rebuilt.draft)).data, first);
  assert.doesNotMatch(first, uuid); assert.doesNotMatch(first, /^\s*icon:/m);
  const originalIds = new Set(Object.keys(draft.operandNodes));
  assert.ok(Object.keys(rebuilt.draft.operandNodes).every((id) => !originalIds.has(id)));
  return rebuilt;
}

test('published blueprint schema is generated from the domain contract', async () => {
  assert.deepEqual(JSON.parse(await readFile(new URL('../src/schemas/blueprint.schema.json', import.meta.url))), blueprintSchema);
});

test('expression parser preserves precedence, nested ALL/ANY, escaped literals and event parameters', () => {
  const resolve = (group, symbol) => `${group}:${symbol}`, symbol = (group, id) => id.slice(group.length + 1);
  for (const source of ['(vars.n * 10) + 20', '-vars.n / 2', '"a\\\"b"', 'ALL(vars.n >= 2, ANY(vars.n < 10, true == false))', 'event("cold", "cooldown_remaining")', 'event("@param:target", "probability_percent")']) {
    const options = { condition: source.startsWith('ALL(') };
    const ast = parseExpression(source, resolve, options);
    assert.deepEqual(parseExpression(formatExpression(ast, symbol), resolve, options), ast);
  }
});

test('condition parser short circuit structure and arithmetic associativity remain explicit', () => {
  const resolve = (_, name) => name;
  const ast = parseExpression('vars.a > 1 or vars.b == 2 and vars.c <= 3', resolve, { condition: true });
  assert.equal(ast.mode, 'ANY'); assert.equal(ast.items[1].mode, 'ALL');
  assert.deepEqual(parseExpression(formatExpression(ast, (_, id) => id), resolve, { condition: true }), ast);
  const arithmetic = parseExpression('10 - 3 - 2', resolve);
  assert.equal(arithmetic.operand_a.operator, '-');
});

test('malformed expressions, arbitrary JS, scalar conditions and resource excess are rejected', () => {
  const resolve = () => { throw new Error('missing symbol'); };
  for (const value of ['', 'process.exit()', 'vars.a[0]', '1; globalThis.x = 2', '1 === 1', '1 +', 'ALL()', '1e999', '"bad\\q"', '(1 < 2) + 1', '('.repeat(80) + '1' + ')'.repeat(80)]) assert.throws(() => parseExpression(value, resolve));
});

test('life blueprint reconstructs rent/payroll overlays and cold interruption with executable formulas', async () => {
  const imported = good(importBlueprint(await readFile(example, 'utf8'))), rebuilt = roundtrip(imported.draft);
  for (const { draft } of [imported, rebuilt]) {
    const ids = Object.fromEntries(Object.entries(draft.operandNodes).map(([id, value]) => [value.display_name, id]));
    const work = draft.slots.find((slot) => slot.name === '工作');
    const worked = simulateSlot(draft, work.id); assert.deepEqual(worked.errors, []);
    assert.equal(worked.state[ids.體力], 48); assert.equal(worked.state[ids.本周完成班數], 1);
    const payroll = draft.slots.find((slot) => slot.name === '薪資結算');
    for (const [shifts, pay] of [[0, 0], [1, -10], [4, -10], [5, 50], [10, 120]]) {
      const initial = { ...simulationInitialValues(draft), [ids.本周完成班數]: shifts };
      const result = simulateSlot(draft, payroll.id, initial); assert.deepEqual(result.errors, []);
      assert.equal(result.state[ids.金錢], 90 + pay); assert.equal(result.state[ids.本周完成班數], 0);
    }
    const sequence = draft.sequences[0];
    const sunday = simulateSequenceDay(draft, sequence.id, 6, { ...simulationInitialValues(draft), [ids.本周完成班數]: 10 });
    assert.deepEqual(sunday.errors, []);
    const events = Object.values(parse(good(exportBlueprint(draft)).data).sequences)[0].events;
    assert.deepEqual(Object.values(events).map((event) => event.execution), ['overlay', 'overlay', 'overlay', 'interrupt_main']);
  }
});

test('all existing example projects rebuild with canonical YAML and fresh UUIDs', async () => {
  const directory = new URL('../src/examples/', import.meta.url);
  for (const name of (await readdir(directory)).filter((item) => item.endsWith('.json'))) roundtrip(projectToDraft(JSON.parse(await readFile(new URL(name, directory), 'utf8'))));
});

test('parameters, enums, scoped event properties, private days, overrides, releases and reservations roundtrip', async () => {
  const input = parse(await readFile(example, 'utf8'));
  input.environment = { name: 'Test environment', version: 'dev' };
  input.enums = { property: { scope: 'environment', options: [{ display_name: 'Chance', value: 'probability_percent' }] } };
  input.tasks = { external: { display_name: 'External', parameters: { amount: { type: 'number' }, target: { type: 'variable_reference', value_type: 'number', access: 'write' }, mode: { type: 'enum', enum: 'property' }, event: { type: 'event_reference', event_kind: 'probability' } } } };
  input.task_macros.scoped = { mode: 'sequence', parameters: { amount: { type: 'number' }, target: { type: 'variable_reference', value_type: 'number', access: 'write' }, mode: { type: 'enum', enum: 'property' }, event: { type: 'event_reference', event_kind: 'probability' } }, eligibility: 'params.amount > 0', steps: [
    { task: 'external', arguments: { amount: 'params.amount', target: { parameter: 'target' }, mode: 'params.mode', event: { parameter: 'event' } } },
    { builtin: 'adjust_probability_event', event: { parameter: 'event' }, property: { parameter: 'mode' }, operation: 'set', value: 'event("@param:event", "probability_percent")' },
    { builtin: 'schedule_event', date: { mode: 'days', offset: 'params.amount' }, source: { mode: 'random', candidates: [{ day: 'cold', weight: 3 }, { day: 'holiday', weight: 1 }] }, execution: 'interrupt_main', priority: 1 },
  ] };
  input.slots.scoped = { mode: 'priority', candidates: [{ macro: 'scoped', arguments: { amount: '2', target: { variable: 'money' }, mode: '"probability_percent"', event: { event: 'cold' } } }] };
  input.days.private_day = { display_name: 'Private', scope: 'week_private', owner: { week: 'normal', weekday: 'tue' }, slots: ['scoped', null], hooks: [{ start: 'work', end: null }, { start: null, end: 'rest' }], releases: [{ when: 'vars.stamina > 50' }, { when: null }] };
  input.weeks.normal.days.tue = 'private_day';
  input.sequences.life.overrides = [{ week: 2, weekday: 'wed', day: null }, { week: 3, weekday: 'wed', day: 'holiday' }];
  input.sequences.life.events.cold.source = { mode: 'sequential', candidates: [{ day: 'cold' }, { day: 'holiday' }] }; delete input.sequences.life.events.cold.day;
  input.builtins.release_slot = { display_name: 'Release', name: 'release', parameter_names: { condition: 'Allow?' } };
  const result = good(importBlueprint(stringify(input)));
  roundtrip(result.draft);
});

test('schema, references, cycles, types and permissions fail without replacing the current project', async () => {
  const original = await readFile(example, 'utf8'), session = createProjectSession(undefined, { mode: 'all' });
  assert.equal(session.importBlueprint(original).ok, true);
  const snapshot = session.getSnapshot();
  const cases = [
    'project: {name: A, name: B}', 'project: !custom value', 'x: &x [*x]', 'project: {slots_per_day: 0}', 'slots: {x: {icon: red}}',
    'expressions: {x: {type: number, value: vars.missing}}',
    'expressions: {x: {type: number, value: expr.x}}',
    'variables: {x: {type: boolean, initial: 1}}',
    'variables: {x: {kind: group, parent: x}}',
    'variables: {x: {read_only: true}}\nslots: {s: {branches: [{when: null, run: {builtin: increment_variable, target: x, value: "1"}}]}}',
  ];
  for (const text of cases) { const result = session.importBlueprint(text); assert.equal(result.ok, false, text); assert.equal(session.getSnapshot(), snapshot); }
});
