import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { random, seedNumber } from '../src/runtime/utils.js';

function load(input) {
  const source = importBlueprint(JSON.stringify(input)); assert.deepEqual(source.errors, []);
  return Program.fromProject(source.draft, { referenceMode: 'name' });
}
const branch = (run) => ({ branches: [{ when: null, run }] });
const increment = (value) => ({ builtin: 'increment_variable', target: 'money', value: String(value) });
const reserve = (day, offset, display_name) => ({ builtin: 'schedule_event', date: { mode: 'days', offset: String(offset) }, day, ...(display_name ? { display_name } : {}) });
const restore = (program, runtime) => Runtime.restore({ program, checkpoint: JSON.parse(JSON.stringify(runtime.snapshot())) });
const advancedSeed = (seed, count) => { const expected = { randomState: seedNumber(seed) }; for (let i = 0; i < count; i++) random(expected); return expected.randomState; };

test('same-priority due reservations retain insertion order after declarations and checkpoint restore', async () => {
  const input = { project: { slots_per_day: 1 }, variables: { money: {} }, task_macros: { book: { steps: [
    ...Array.from({ length: 8 }, () => increment(0)), reserve('a', 1, 'Z first'), reserve('b', 1, 'A second'), reserve('c', 1, 'M third'),
  ] } }, slots: { book: branch({ macro: 'book' }), declared: branch({ builtin: 'set_variable', target: 'money', value: '5' }),
    a: branch({ builtin: 'set_variable', target: 'money', value: '100' }), b: branch(increment(20)), c: branch(increment(3)) },
  days: { main: { start: 'book' }, declared: { start: 'declared' }, a: { start: 'a' }, b: { start: 'b' }, c: { start: 'c' } },
  weeks: { w: { days: { mon: 'main' } } }, sequences: { life: { weeks: ['w'], end_weekday: 'tue', events: { fixed: { kind: 'once', start: { week: 1, weekday: 'tue' }, day: 'declared' } } } } };
  const program = load(input), runtime = new Runtime({ program, runId: 'ties' }); await runtime.runDay({ sequence: 'life' });
  const ids = runtime.getState().reservations.map((item) => item.id);
  assert.equal(ids.length, 3); // this fixture crosses the current invocation counter's digit boundary
  const resumed = restore(program, runtime), calls = [];
  assert.deepEqual(resumed.getState().reservations.map((item) => item.id), ids);
  resumed.on('task.completed', (record) => calls.push(record.dayRef)); await resumed.nextDay();
  assert.deepEqual(calls, ['declared', 'a', 'b', 'c']); assert.equal(resumed.getVariable('money'), 123);
});

test('sequence switching preserves reservation ownership and independent date progress without catch-up', async () => {
  const program = load({ project: { slots_per_day: 1 }, variables: { money: {} }, slots: { book: branch(reserve('special', 3)), pay: branch(increment(100)) },
    days: { main: { start: 'book' }, special: { start: 'pay' } }, weeks: { life: { days: { mon: 'main' } }, holiday: {} },
    sequences: { life: { weeks: ['life'] }, holiday: { weeks: ['holiday'] } } });
  let runtime = new Runtime({ program }); await runtime.runDay({ sequence: 'life' });
  assert.equal(runtime.getState().reservations[0].sequenceRef, 'life');
  await runtime.runDay({ sequence: 'holiday' }); for (let day = 0; day < 3; day++) await runtime.nextDay();
  assert.equal(runtime.getState().execution.position, 3); assert.equal(runtime.getVariable('money'), 0);
  runtime = restore(program, runtime);
  await assert.rejects(runtime.runDay({ sequence: 'life', dayIndex: 4 }), /nonSequentialDate/);
  await runtime.runDay({ sequence: 'life' }); assert.equal(runtime.getState().execution.position, 1);
  await runtime.nextDay(); assert.equal(runtime.getVariable('money'), 0);
  await runtime.nextDay(); assert.equal(runtime.getVariable('money'), 100);
  await runtime.nextDay(); assert.equal(runtime.getVariable('money'), 100); // past reservation is not replayed
});

const eventCalendar = (event) => ({ project: { slots_per_day: 1 }, days: { d: {} }, weeks: { w: {} }, sequences: { s: { weeks: ['w'], events: { e: event } } } });
const probability = (percent, source) => ({ kind: 'probability', probability: percent, cooldown_days: 0, start: { week: 1, weekday: 'mon' }, end: { week: 1, weekday: 'sun' }, ...source });

test('0/100 probability and single random sources consume their specified RNG draws', async () => {
  const randomSource = { source: { mode: 'random', candidates: [{ day: 'd' }] } };
  for (const [event, count, occurs] of [
    [probability(0, { day: 'd' }), 1, false], [probability(100, { day: 'd' }), 1, true],
    [probability(0, randomSource), 1, false], [probability(100, randomSource), 2, true],
    [{ kind: 'once', start: { week: 1, weekday: 'mon' }, ...randomSource }, 1, true],
    [{ kind: 'periodic', start: { week: 1, weekday: 'mon' }, end: { week: 1, weekday: 'sun' }, every: 1, source: { mode: 'sequential', candidates: [{ day: 'd' }] } }, 0, true],
  ]) {
    const runtime = new Runtime({ program: load(eventCalendar(event)), seed: 'boundary-rng' });
    await runtime.runDay({ sequence: 's' });
    assert.equal(runtime.getState().randomState, advancedSeed('boundary-rng', count));
    assert.equal(runtime.getState().execution.sources.length > 0, occurs);
  }
});

test('date/cooldown skips and manual decisions omit only their corresponding RNG draws', async () => {
  const event = probability(100, { day: 'd' }); event.cooldown_days = 1;
  const runtime = new Runtime({ program: load(eventCalendar(event)), seed: 'skip' });
  await runtime.runDay({ sequence: 's' }); assert.equal(runtime.getState().randomState, advancedSeed('skip', 1));
  await runtime.nextDay(); assert.equal(runtime.getState().randomState, advancedSeed('skip', 1)); assert.deepEqual(runtime.getState().execution.sources, []);
  await runtime.nextDay(); assert.equal(runtime.getState().randomState, advancedSeed('skip', 2));
  const later = probability(100, { day: 'd' }); later.start.weekday = 'tue';
  const inactive = new Runtime({ program: load(eventCalendar(later)), seed: 'skip' }); await inactive.runDay({ sequence: 's' });
  assert.equal(inactive.getState().randomState, advancedSeed('skip', 0));
  const manual = new Runtime({ program: load(eventCalendar(probability(0, { source: { mode: 'random', candidates: [{ day: 'd' }] } }))), seed: 'skip',
    decisions: { occurs: () => true, chooseDay: (event, candidates) => candidates[0].dayId } });
  await manual.runDay({ sequence: 's' }); assert.equal(manual.getState().randomState, advancedSeed('skip', 0)); assert.equal(manual.getState().execution.sources.length, 1);
});

for (const kind of ['task', 'macro']) test(`named ${kind} arguments evaluate by callee declaration, not caller mapping order`, async () => {
  const definition = { parameters: { first: { type: 'number' }, second: { type: 'number' } } };
  const program = load({ ...(kind === 'task' ? { tasks: { consume: definition } } : {}),
    task_macros: { ...(kind === 'macro' ? { consume: definition } : {}), caller: { steps: [{ [kind]: 'consume', arguments: { second: 'expr.randomRange(20, 21)', first: 'expr.randomRange(10, 11)' } }] } },
    slots: { s: branch({ macro: 'caller' }) } });
  const calls = [], runtime = new Runtime({ program, seed: 'args', diagnostics: true, ...(kind === 'task' ? { taskHandlers: { consume: (args) => calls.push(args) } } : {}) }), draws = [];
  runtime.on('diagnostic', (record) => { if (record.kind === 'expression.random') draws.push(record.arguments[0]); });
  runtime.on('macro.start', (record) => { if (record.macroRef === 'consume') calls.push(record.arguments); });
  await runtime.runSlot({ slot: 's' }); assert.deepEqual(draws, [10, 20]);
  assert.ok(calls[0].first >= 10 && calls[0].first < 11 && calls[0].second >= 20 && calls[0].second < 21);
  assert.equal(runtime.getState().randomState, advancedSeed('args', 2));
});

test('single-item randomItem draws once in addition to evaluating its candidate', async () => {
  for (const [expression, count] of [['expr.randomItem(10)', 1], ['expr.randomItem(expr.randomRange(10, 10))', 1], ['expr.randomItem(expr.randomRange(10, 11))', 2]]) {
    const program = load({ variables: { money: {} }, slots: { s: branch({ builtin: 'set_variable', target: 'money', value: expression }) } });
    const runtime = new Runtime({ program, seed: 'singleton' }); await runtime.runSlot({ slot: 's' });
    assert.equal(runtime.getState().randomState, advancedSeed('singleton', count));
    assert.ok(runtime.getVariable('money') >= 10 && runtime.getVariable('money') < 11);
  }
});

test('interleaved sequences share one RNG stream and checkpoint restore retains its current position', async () => {
  const program = load({ project: { slots_per_day: 1 }, variables: { money: {} }, slots: { roll: branch({ builtin: 'set_variable', target: 'money', value: 'expr.randomRange(0, 1)' }) },
    days: { d: { start: 'roll' } }, weeks: { w: { days: { mon: 'd', tue: 'd' } } }, sequences: { life: { weeks: ['w'] }, holiday: { weeks: ['w'] } } });
  const first = new Runtime({ program, seed: 'shared-stream' }); await first.runDay({ sequence: 'life' });
  const resumed = restore(program, first); await resumed.runDay({ sequence: 'holiday' }); const secondDraw = resumed.getVariable('money');
  await resumed.runDay({ sequence: 'life' }); const thirdDraw = resumed.getVariable('money');
  const consecutive = new Runtime({ program, seed: 'shared-stream' }); await consecutive.runDay({ sequence: 'life' });
  assert.equal(consecutive.getVariable('money'), first.getVariable('money'));
  await consecutive.nextDay(); assert.equal(consecutive.getVariable('money'), secondDraw); assert.notEqual(consecutive.getVariable('money'), thirdDraw);
  await consecutive.runDay({ sequence: 'holiday' }); assert.equal(consecutive.getVariable('money'), thirdDraw);
  assert.equal(resumed.getState().randomState, advancedSeed('shared-stream', 3));
  assert.equal(consecutive.getState().randomState, resumed.getState().randomState);
});
