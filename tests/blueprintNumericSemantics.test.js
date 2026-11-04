import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime, MemoryCheckpointStore } from '../src/runtime/index.js';
import { random, seedNumber } from '../src/runtime/utils.js';

function load(input) {
  const source = importBlueprint(JSON.stringify(input)); assert.deepEqual(source.errors, []);
  return Program.fromProject(source.draft, { referenceMode: 'name' });
}
const branch = (run) => ({ branches: [{ when: null, run }] });
const calendar = (steps) => ({ project: { slots_per_day: 1 }, variables: { money: {}, delay: { initial: -1 } },
  task_macros: { prepare: { steps } }, slots: { s: branch({ macro: 'prepare' }) }, days: { d: { start: 's' }, event: {} },
  weeks: { w: { days: { mon: 'd' } } }, sequences: { life: { weeks: ['w'] } } });
const adjust = (property, operation, value) => ({ builtin: 'adjust_probability_event', event: { event: 'cold' }, property, operation, value });
function eventProgram(steps, cooldown = 3) {
  const input = calendar(steps);
  input.sequences.life.events = { cold: { kind: 'probability', start: { week: 1, weekday: 'mon' }, end: { week: 1, weekday: 'sun' }, probability: 10, cooldown_days: cooldown, day: 'event' } };
  return load(input);
}

test('direct Program JSON rejects fractional integer bounds before any write can break the invariant', async () => {
  const program = load({ variables: { n: { integer: true, initial: 1, min: 0, max: 2 } } });
  for (const [key, value] of Object.entries({ min_value: 0.5, max_value: 1.5, initial_value: 1.5 })) {
    const data = program.toJSON(); data.variables.n[key] = value;
    assert.throws(() => Program.fromJSON(data), (error) => error.code === 'invalidRuntimeProgram' && error.issues.some((issue) => issue.key === 'integerValueRequired'));
  }
  for (const value of ['1', null, true]) {
    const data = program.toJSON(); data.variables.n.initial_value = value;
    assert.throws(() => Program.fromJSON(data), (error) => error.code === 'invalidRuntimeProgram' && error.path === '/variables/n/initial_value');
  }
  const runtime = new Runtime({ program });
  for (const value of [-2.8, 0, 1.9, 8.5]) { await runtime.setVariable('n', value); assert.ok(Number.isInteger(runtime.getVariable('n'))); }
  assert.equal(runtime.getVariable('n'), 2);
});

test('all builtin candidate expressions draw before selection; only the winner draws its actual offset', async () => {
  const program = load({ variables: { money: {}, stamina: {} }, task_macros: { lottery: { mode: 'random', candidates: [
    { builtin: 'increment_variable', target: 'money', value: 'expr.randomRange(10, 100)', random_amplitude: 'expr.randomRange(2, 3)', weight: '0' },
    { builtin: 'increment_variable', target: 'stamina', value: 'expr.randomRange(1, 20)', random_amplitude: 'expr.randomRange(5, 6)', weight: '1' },
  ] } }, slots: { s: branch({ macro: 'lottery' }) } });
  const runtime = new Runtime({ program, seed: 'builtin-order', diagnostics: true }), draws = [], completed = [];
  runtime.on('diagnostic', (record) => { if (record.kind === 'expression.random') draws.push(record); });
  runtime.on('task.completed', (record) => completed.push(record)); await runtime.runSlot({ slot: 's' });
  assert.deepEqual(draws.map((record) => record.arguments[0]), [10, 2, 1, 5]);
  assert.equal(completed.length, 1); assert.equal(completed[0].arguments.value, draws[2].result);
  assert.equal(completed[0].arguments.random_amplitude, draws[3].result);
  assert.equal(runtime.getVariable('money'), 0); assert.equal(runtime.getVariable('stamina'), completed[0].result.after);
  const expected = { randomState: seedNumber('builtin-order') }; for (let draw = 0; draw < 6; draw++) random(expected);
  assert.equal(runtime.getState().randomState, expected.randomState);
});

test('rejected reservation commits normally and restore continues without rechecking eligibility or fallback', async () => {
  const input = calendar([{ builtin: 'schedule_event', date: { mode: 'days', offset: 'vars.delay' }, day: 'event' }, { builtin: 'increment_variable', target: 'money', value: '100' }]);
  input.task_macros.prepare.eligibility = 'expr.randomRange(1, 2) > 0';
  input.task_macros.choose = { mode: 'random', candidates: [{ macro: 'prepare', weight: '1' }], fallback: { builtin: 'increment_variable', target: 'money', value: '1000' } };
  input.slots.s = branch({ macro: 'choose' });
  const program = load(input), store = new MemoryCheckpointStore(), runtime = new Runtime({ program, checkpointStore: store, diagnostics: true }), completed = [], guards = [];
  const watch = (record) => { if (record.kind === 'expression.random') guards.push(record); };
  runtime.on('diagnostic', watch); runtime.on('task.completed', (record) => completed.push(record));
  await runtime.startDay({ sequence: 'life' }); await runtime.step();
  assert.equal(completed[0].result.accepted, false); assert.equal(completed[0].builtin, 'schedule_event');
  const checkpoint = await store.load(runtime.runId);
  assert.equal(checkpoint.state.execution.pending, null); assert.deepEqual(checkpoint.state.reservations, []);
  const restored = Runtime.restore({ program, checkpoint, checkpointStore: store, diagnostics: true }), resumed = [], ended = [];
  restored.on('diagnostic', watch); restored.on('task.completed', (record) => resumed.push(record)); restored.on('macro.end', (record) => ended.push(record.macroRef));
  await restored.resume();
  assert.equal(restored.status, 'completed'); assert.equal(restored.getVariable('money'), 100);
  assert.deepEqual(resumed.map((record) => record.builtin), ['increment_variable']); assert.equal(guards.length, 1); assert.ok(ended.includes('prepare'));
  const again = Runtime.restore({ program, checkpoint: await store.load(runtime.runId) }); await again.resume(); assert.equal(again.getVariable('money'), 100);
});

test('event property writes clamp finite probability and integer cooldown without resetting remaining cooldown', async () => {
  const runtime = new Runtime({ program: eventProgram([
    adjust('probability_percent', 'increase', '200'), adjust('probability_percent', 'set', '12.5'), adjust('probability_percent', 'increase', '-200'),
    adjust('cooldown_days', 'increase', '-10'), adjust('cooldown_days', 'set', '4'), adjust('cooldown_days', 'increase', '2'), adjust('cooldown_days', 'set', '-3'),
  ]), decisions: { occurs: () => true } }), completed = [];
  runtime.on('task.completed', (record) => completed.push(record)); await runtime.runDay({ sequence: 'life' });
  assert.deepEqual(completed.map((record) => record.result.after), [100, 12.5, 0, 0, 4, 6, 0]);
  assert.equal(runtime.getState().events.cold.cooldown_remaining, 3);
});

test('fractional/unsafe cooldown requests and nonfinite probability fail without committing the task', async () => {
  for (const [step, cooldown, code] of [
    [adjust('cooldown_days', 'set', '1.5'), 3, 'invalidEventCooldown'],
    [adjust('cooldown_days', 'increase', '0.5'), 3, 'invalidEventCooldown'],
    [adjust('cooldown_days', 'set', '-9007199254740992'), 3, 'invalidEventCooldown'],
    [adjust('cooldown_days', 'increase', '1'), Number.MAX_SAFE_INTEGER, 'invalidEventCooldown'],
    [adjust('probability_percent', 'set', '1e308 * 1e308'), 3, 'finiteNumber'],
  ]) {
    const runtime = new Runtime({ program: eventProgram([step], cooldown), decisions: { occurs: () => false } }), completed = [];
    runtime.on('task.completed', (record) => completed.push(record));
    await assert.rejects(runtime.runDay({ sequence: 'life' }), (error) => error.code === code);
    assert.equal(runtime.getState().events.cold.probability_percent, 10); assert.equal(runtime.getState().events.cold.cooldown_days, cooldown); assert.deepEqual(completed, []);
  }
});
