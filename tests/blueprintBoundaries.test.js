import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { random, seedNumber } from '../src/runtime/utils.js';

function load(input) {
  const result = importBlueprint(JSON.stringify(input)); assert.deepEqual(result.errors, []);
  return Program.fromProject(result.draft, { referenceMode: 'name' });
}
const branch = (task) => ({ branches: [{ when: null, run: task }] });
const calendar = (task) => ({ project: { slots_per_day: 1 }, variables: { n: {} }, slots: { s: branch(task) }, days: { d: { start: 's' } }, weeks: { w: { days: { mon: 'd' } } }, sequences: { life: { weeks: ['w'] } } });
const reserve = (offset, mode = 'days') => ({ builtin: 'schedule_event', date: { mode, offset, ...(mode === 'weeks_weekday' ? { weekday: 'thu' } : {}) }, day: 'd' });

test('randomRange uses declared parameter positions, allowing renamed keys', async () => {
  const input = calendar({ builtin: 'set_variable', target: 'n', value: 'expr.rng(5, 5)' });
  input.expressions = { rng: { type: 'number', scope: 'environment', builtin: 'randomRange', parameters: { foo: { type: 'number' }, bar: { type: 'number' } } } };
  const program = load(input), runtime = new Runtime({ program, seed: 'positions' }), before = runtime.getState().randomState;
  assert.deepEqual(program.get('expressions', 'rng').parameters.map((p) => p.name), ['foo', 'bar']);
  await runtime.runDay({ sequence: 'life' }); assert.equal(runtime.getVariable('n'), 5); assert.equal(runtime.getState().randomState, before);
  input.slots.s = branch({ builtin: 'set_variable', target: 'n', value: 'expr.rng(10, 5)' });
  const invalidRange = new Runtime({ program: load(input) }); await assert.rejects(invalidRange.runDay({ sequence: 'life' }), /invalidRandomRange/);
});

test('reservation constants fail import while computed unsafe offsets reject only the reservation', async () => {
  for (const literal of ['2.5', '-1', '9007199254740992']) assert.ok(importBlueprint(JSON.stringify(calendar(reserve(literal)))).errors.length);
  for (const mode of ['days', 'weeks_weekday']) for (const expression of ['5 / 2', '1 - 2', '4503599627370496 * 2']) {
    const input = calendar({ macro: 'book' });
    input.task_macros = { book: { steps: [reserve(expression, mode), { builtin: 'increment_variable', target: 'n', value: '1' }] } };
    const runtime = new Runtime({ program: load(input) }), rejected = [], completed = [];
    runtime.on('reservation.rejected', (event) => rejected.push(event)); runtime.on('task.completed', (event) => completed.push(event));
    await runtime.runDay({ sequence: 'life' });
    assert.equal(rejected[0].reason, 'scheduleOffsetError'); assert.equal(completed[0].result.accepted, false);
    assert.deepEqual(runtime.getState().reservations, []); assert.equal(runtime.getVariable('n'), 1); assert.equal(runtime.status, 'completed');
  }
  const weekly = new Runtime({ program: load(calendar(reserve('0', 'weeks_weekday'))) });
  await weekly.runDay({ sequence: 'life' }); assert.equal(weekly.getState().reservations[0].position, 3);
  const runtime = new Runtime({ program: load(calendar(reserve('1 / vars.n'))) }), rejected = [];
  runtime.on('reservation.rejected', (event) => rejected.push(event));
  await assert.rejects(runtime.runDay({ sequence: 'life' }), /divisionByZero/); assert.deepEqual(rejected, []);
});

for (const operation of ['read', 'adjust', 'argument']) test(`event ${operation} is confined to the executing sequence even when event names are global`, async () => {
  const use = operation === 'read' ? { builtin: 'set_variable', target: 'n', value: 'event("cold", "probability_percent")' }
    : operation === 'adjust' ? { builtin: 'adjust_probability_event', event: { event: 'cold' }, property: 'probability_percent', operation: 'set', value: '50' }
      : { task: 'inspect', arguments: { target: { event: 'cold' } } };
  const input = calendar(use);
  input.sequences.life.events = { cold: { kind: 'probability', start: { week: 1, weekday: 'mon' }, end: { week: 1, weekday: 'sun' }, probability: 10, cooldown_days: 7, day: 'd' } };
  input.sequences.holiday = { weeks: ['w'] };
  if (operation === 'argument') input.tasks = { inspect: { parameters: { target: { type: 'event_reference', event_kind: 'any' } } } };
  const program = load(input), handlers = { ...(operation === 'argument' ? { inspect: () => {} } : {}) };
  const runtime = new Runtime({ program, taskHandlers: handlers, decisions: { occurs: () => false } });
  await assert.rejects(runtime.runDay({ sequence: 'holiday' }), /invalidEventReference/);
  assert.equal(runtime.getState().events.cold.probability_percent, 10); assert.equal(runtime.getVariable('n'), 0);
  const allowed = new Runtime({ program, taskHandlers: handlers, decisions: { occurs: () => false } });
  await allowed.runDay({ sequence: 'life' }); assert.equal(allowed.status, 'completed');
  assert.equal(allowed.getState().events.cold.probability_percent, operation === 'adjust' ? 50 : 10);
});

test('duplicate override positions are rejected regardless of their day values', () => {
  for (const secondDay of ['d', 'other', null]) {
    const input = calendar({ builtin: 'increment_variable', target: 'n', value: '1' }); input.days.other = {};
    input.sequences.life.overrides = [{ week: 1, weekday: 'mon', day: 'd' }, { week: 1, weekday: 'mon', day: secondDay }];
    assert.ok(importBlueprint(JSON.stringify(input)).errors.some((error) => error.key === 'duplicateOverride' || error.code === 'duplicateOverride'));
  }
});

test('event coordinates use template weeks, reject inverted/outside ranges and allow trimmed dates', async () => {
  const event = { kind: 'periodic', start: { week: 1, weekday: 'mon' }, end: { week: 1, weekday: 'tue' }, every: 1, day: 'd' };
  const input = { project: { slots_per_day: 1 }, days: { d: {} }, weeks: { w: {} }, sequences: { s: { weeks: ['w'], start_weekday: 'thu', end_weekday: 'fri', events: { e: event } } } };
  const runtime = new Runtime({ program: load(input) }); await runtime.runDay({ sequence: 's' }); await runtime.nextDay();
  assert.deepEqual(runtime.getState().execution.sources, []);
  for (const [start, end] of [[{ week: 1, weekday: 'sun' }, { week: 1, weekday: 'mon' }], [{ week: 2, weekday: 'mon' }, { week: 2, weekday: 'tue' }], [event.start, { week: 2, weekday: 'tue' }]]) {
    const copy = structuredClone(input); copy.sequences.s.weeks = [{ week: 'w', repeat: 3 }]; Object.assign(copy.sequences.s.events.e, { start, end });
    assert.ok(importBlueprint(JSON.stringify(copy)).errors.length);
  }
  input.sequences.s.weeks = [{ week: 'w', repeat: 2 }]; input.sequences.s.end_weekday = 'tue';
  input.sequences.s.events.e = { kind: 'once', start: { week: 1, weekday: 'mon' }, day: 'd' };
  const repeated = new Runtime({ program: load(input) }); await repeated.runDay({ sequence: 's' });
  assert.deepEqual(repeated.getState().execution.sources, []);
  for (let day = 0; day < 4; day++) await repeated.nextDay();
  assert.equal(repeated.getState().execution.sources[0].eventRef, 'e');
});

test('weighted RNG order is candidate arguments then eligibility, qualified weights then selection', async () => {
  const program = load({ task_macros: {
    a: { parameters: { p: { type: 'number' } }, eligibility: 'expr.randomRange(10, 11) > 20' },
    b: { parameters: { p: { type: 'number' } }, eligibility: 'expr.randomRange(30, 31) >= 30' },
    choose: { mode: 'random', candidates: [
      { macro: 'a', arguments: { p: 'expr.randomRange(0, 1)' }, weight: 'expr.randomRange(40, 41)' },
      { macro: 'b', arguments: { p: 'expr.randomRange(20, 21)' }, weight: 'expr.randomRange(50, 51)' },
    ] },
  }, slots: { s: branch({ macro: 'choose' }) } });
  const runtime = new Runtime({ program, seed: 'order', diagnostics: true }), draws = [];
  runtime.on('diagnostic', (record) => { if (record.kind === 'expression.random') draws.push(record.arguments[0]); });
  await runtime.runSlot({ slot: 's' }); assert.deepEqual(draws, [0, 10, 20, 30, 50]);
  const expected = { randomState: seedNumber('order') }; for (let i = 0; i < 6; i++) random(expected);
  assert.equal(runtime.getState().randomState, expected.randomState);
});
