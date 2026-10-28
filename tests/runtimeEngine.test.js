import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime, MemoryCheckpointStore } from '../src/runtime/index.js';
import { simulateSequenceDay } from './reference/daySimulationModel.js';
import { simulationInitialValues } from './reference/simulationModel.js';

const good = (result) => { assert.deepEqual(result.errors, []); return result; };
function program(yaml, referenceMode = 'name') { return Program.fromProject(good(importBlueprint(yaml)).draft, { referenceMode }); }
const portable = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const sample = async () => good(importBlueprint(await readFile(new URL('../docs/recipes/examples/life-simulation.yaml', import.meta.url), 'utf8'))).draft;
const nested = `variables:
  n: {initial: 1}
tasks:
  wait: {parameters: {amount: {type: number}}}
task_macros:
  inner:
    parameters: {delta: {type: number}}
    steps:
      - {task: wait, arguments: {amount: params.delta}}
      - {builtin: increment_variable, target: n, value: "3"}
  outer:
    steps:
      - {builtin: increment_variable, target: n, value: "1"}
      - {macro: inner, arguments: {delta: vars.n}}
slots:
  work:
    branches:
      - {when: vars.n < 100, run: {macro: outer}}
      - {when: null, run: {builtin: set_variable, target: n, value: "-1"}}
days:
  d: {slots: [null, work, null]}
weeks:
  w: {days: {mon: d, tue: d, wed: d, thu: d, fri: d, sat: d, sun: d}}
sequences:
  s: {weeks: [w]}
`;

test('UUID/name programs execute the same life-simulation day as the existing simulator', async () => {
  const draft = await sample(), initial = simulationInitialValues(draft), sequence = draft.sequences[0];
  const choices = Object.fromEntries(sequence.eventGroups.filter((event) => event.kind === 'probability').map((event) => [event.id, false]));
  const simulation = simulateSequenceDay(draft, sequence.id, 0, initial, initial, undefined, {}, choices);
  assert.deepEqual(simulation.errors, []);
  for (const referenceMode of ['uuid', 'name']) {
    const p = Program.fromProject(draft, { referenceMode }), r = new Runtime({ program: Program.fromJSON(portable(p.toJSON())), decisions: { occurs: () => false } });
    const order = []; for (const name of ['day.start', 'slot.start', 'slot.body', 'slot.end', 'day.end']) r.on(name, (event) => order.push(`${name}:${event.slotIndex}`));
    await r.runDay({ sequence: 'life' });
    assert.equal(r.status, 'completed');
    for (const [id, value] of Object.entries(simulation.state)) assert.equal(r.getVariable(draft.operandNodes[id].symbol), value);
    assert.deepEqual(order, ['day.start:0', 'slot.start:0', 'slot.body:0', 'slot.end:0', 'slot.start:1', 'slot.body:1', 'slot.end:1', 'slot.start:2', 'slot.body:2', 'slot.end:2', 'day.end:2']);
    if (referenceMode === 'name') assert.doesNotMatch(JSON.stringify(p.toJSON()), /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
  }
});

for (const mode of ['uuid', 'name']) test(`${mode}: pause in slot1.body restores the same call and frozen arguments without replaying previous phases`, async () => {
  const p = program(nested, mode), store = new MemoryCheckpointStore(), entered = deferred();
  const r = new Runtime({ program: p, checkpointStore: store });
  let oldContext, firstId;
  r.registerTask('wait', async (args, context) => { oldContext = context; firstId = context.invocationId; context.setVariable('n', 500); entered.resolve(); await new Promise(() => {}); });
  const running = r.runDay({ sequence: 's' }); await entered.promise;
  await r.pause(); await running;
  assert.equal(r.status, 'paused'); assert.equal(r.getVariable('n'), 2);
  assert.throws(() => oldContext.setVariable('n', 999), /executionPaused/);
  const saved = portable(r.snapshot()), pending = saved.state.execution.pending;
  assert.equal(pending.arguments.amount, 2); assert.equal(pending.context.phase, 'slot.body'); assert.equal(pending.context.slotIndex, 1);
  const restored = await Runtime.load({ program: Program.fromJSON(portable(p.toJSON())), checkpointStore: store, runId: r.runId });
  let replayedDayStart = 0, replayedSlotStart = 0;
  restored.on('day.start', () => replayedDayStart++); restored.on('slot.start', () => replayedSlotStart++);
  await restored.setVariable('n', 200); // Deliberately invalidate the original IF; the selected branch must stay selected.
  restored.registerTask('wait', (args, context) => { assert.equal(context.invocationId, firstId); assert.equal(context.attempt, 2); assert.equal(args.amount, 2); context.setVariable('n', context.getVariable('n') + args.amount); });
  await restored.resume();
  assert.equal(restored.getVariable('n'), 205);
  assert.equal(replayedDayStart, 0); assert.equal(replayedSlotStart, 1); // Only slot2 remains.
  assert.equal(restored.status, 'completed');
});

test('step advances one leaf task; handler failure rolls back writes and retries the same invocation', async () => {
  const r = new Runtime({ program: program(nested) }); await r.startSlot({ slot: 'work' });
  await r.step(); assert.equal(r.getVariable('n'), 2); assert.equal(r.status, 'paused');
  const ids = []; r.on('task.start', (event) => ids.push(event.invocationId));
  r.registerTask('wait', (_, ctx) => { ctx.setVariable('n', 99); throw new Error('handlerFailure'); });
  await assert.rejects(r.resume(), /handlerFailure/); assert.equal(r.getVariable('n'), 2); assert.equal(r.status, 'failed');
  r.registerTask('wait', (_, ctx) => ctx.setVariable('n', 4));
  await r.resume(); assert.equal(r.getVariable('n'), 7); assert.equal(ids[0], ids[1]);
});

test('failed completion persistence keeps a retryable task boundary', async () => {
  const p = program(nested), backing = new MemoryCheckpointStore(); let rejectCommit = true;
  const store = { load: (...args) => backing.load(...args), save: async (id, value) => {
    if (rejectCommit && value.state.variables.n === 4 && !value.state.execution.pending) { rejectCommit = false; throw new Error('diskFailure'); }
    return backing.save(id, value);
  } };
  const r = new Runtime({ program: p, checkpointStore: store, taskHandlers: { wait: (_, ctx) => ctx.setVariable('n', 4) } });
  await assert.rejects(r.runDay({ sequence: 's' }), /diskFailure/);
  assert.equal(r.getVariable('n'), 2); const id = r.snapshot().state.execution.pending.invocationId;
  const restored = await Runtime.load({ program: p, checkpointStore: store, runId: r.runId, taskHandlers: { wait: (_, ctx) => { assert.equal(ctx.invocationId, id); ctx.setVariable('n', 4); } } });
  await restored.resume(); assert.equal(restored.getVariable('n'), 7);
});

test('a failed expression does not consume the failing frame and concurrent operations are rejected', async () => {
  const p = program(`variables: {n: {initial: 0}}
slots: {s: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "1 / vars.n"}}]}}
`);
  const r = new Runtime({ program: p });
  const starting = r.startSlot({ slot: 's' });
  await assert.rejects(r.startSlot({ slot: 's' }), /executionAlreadyActive/);
  await starting;
  await assert.rejects(r.resume(), /divisionByZero/);
  assert.equal(r.status, 'failed');
  const restored = Runtime.restore({ program: p, checkpoint: portable(r.snapshot()) });
  await restored.setVariable('n', 1); await restored.resume(); assert.equal(restored.getVariable('n'), 2);
  const gate = deferred(), entered = deferred(), waiting = new Runtime({ program: program(nested), taskHandlers: { wait: async () => { entered.resolve(); await gate.promise; } } });
  const run = waiting.runSlot({ slot: 'work' }); await entered.promise;
  assert.throws(() => waiting.resume(), /runtimeBusy/);
  await assert.rejects(waiting.setVariable('n', 99), /runtimeBusy/);
  gate.resolve(); await run;
});

test('task writes enforce readonly/type/bounds/integer constraints and failure rolls back every staged write', async () => {
  const p = program(`variables:
  n: {initial: 1, min: 0, max: 10, integer: true}
  locked: {initial: 5, read_only: true}
tasks: {update: {parameters: {target: {type: variable_reference, value_type: number, access: read_write}}}}
slots: {s: {branches: [{when: null, run: {task: update, arguments: {target: {variable: n}}}}]}}
`);
  const r = new Runtime({ program: p, taskHandlers: { update: (args, ctx) => { assert.equal(ctx.setVariable(args.target, 99.9), 10); ctx.setVariable('locked', 2); } } });
  await assert.rejects(r.runSlot({ slot: 's' }), /readonlyTarget/);
  assert.equal(r.getVariable('n'), 1); assert.equal(r.getVariable('locked'), 5);
  r.registerTask('update', (args, ctx) => { assert.throws(() => ctx.setVariable(args.target, 'wrong'), /writeTypeMismatch/); ctx.setVariable(args.target, 7.8); });
  await r.resume(); assert.equal(r.getVariable('n'), 7);
});

test('enum arguments and scoped macro parameters survive name compilation and checkpoint restoration', async () => {
  const p = program(`enums: {mode: {scope: environment, options: [{value: add}, {value: subtract}]}}
tasks: {action: {parameters: {mode: {type: enum, enum: mode}}}}
task_macros:
  forward:
    parameters: {mode: {type: enum, enum: mode}}
    steps: [{task: action, arguments: {mode: {parameter: mode}}}]
slots: {s: {mode: priority, candidates: [{macro: forward, arguments: {mode: '"add"'}}]}}
`);
  const choices = [], r = new Runtime({ program: p, taskHandlers: { action: (args) => { choices.push(args.mode); } } });
  r.once('task.start', () => r.pause());
  await r.runSlot({ slot: 's' }); assert.equal(r.status, 'paused'); assert.deepEqual(choices, []);
  const restored = Runtime.restore({ program: p, checkpoint: portable(r.snapshot()), taskHandlers: { action: (args) => { choices.push(args.mode); } } });
  await restored.resume(); assert.deepEqual(choices, ['add']);
  assert.doesNotMatch(JSON.stringify(p.toJSON()), /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
});

test('multiple event sources and event-setting adjustments agree with the existing simulator', async () => {
  const { reportFixture } = await import('./reportFixture.js');
  const draft = reportFixture().draft, p = Program.fromProject(draft, { referenceMode: 'name' }), sequence = draft.sequences[0];
  const initial = simulationInitialValues(draft), choices = Object.fromEntries(sequence.eventGroups.filter((event) => event.kind === 'probability').map((event) => [event.id, true]));
  const result = simulateSequenceDay(draft, sequence.id, 3, initial, initial, undefined, {}, choices);
  assert.deepEqual(result.errors, []);
  const r = new Runtime({ program: p, decisions: { occurs: () => true }, unhandledTasks: 'record' });
  await r.runDay({ sequence: sequence.symbol ?? p.entries('sequences')[0][0], position: 3 });
  const normalized = Program.fromProject(draft, { referenceMode: 'uuid' });
  for (const [id, value] of Object.entries(result.state)) assert.equal(r.getVariable(normalized.get('variables', id).name), value);
});

test('interrupt-lower claims and conditional release survive a checkpoint between start and body', async () => {
  const yaml = `variables: {n: {initial: 0}}
slots:
  check: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "1"}}]}
  main: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "10"}}]}
  event: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "100"}}]}
  low: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "1000"}}]}
days:
  main: {slots: [main, main, main]}
  event:
    slots: [event, event, event]
    hooks: [{start: check}, {start: check}, {start: check}]
    releases: [{when: vars.n == 1}, {when: vars.n == 1}, {when: vars.n == 1}]
  low: {slots: [low, low, low]}
weeks: {w: {days: {mon: main}}}
sequences:
  s:
    weeks: [w]
    events:
      high: {kind: once, start: {week: 1, weekday: mon}, day: event, execution: interrupt_lower, priority: 10}
      low: {kind: once, start: {week: 1, weekday: mon}, day: low, execution: overlay, priority: -1}
`;
  const draft = good(importBlueprint(yaml)).draft, p = Program.fromProject(draft, { referenceMode: 'name' });
  const r = new Runtime({ program: p }); await r.startDay({ sequence: 's' }); await r.step(); await r.step();
  assert.equal(r.getVariable('n'), 1); assert.equal(r.snapshot().state.execution.released.length, 1);
  const restored = Runtime.restore({ program: p, checkpoint: portable(r.snapshot()) });
  await restored.resume();
  const simulation = simulateSequenceDay(draft, draft.sequences[0].id, 0);
  assert.deepEqual(simulation.errors, []);
  assert.equal(restored.getVariable('n'), 1213);
  assert.equal(restored.getVariable('n'), simulation.state[Object.keys(draft.operandNodes)[0]]);
});

test('progress values follow the actual sequence start and task observers receive committed changes', async () => {
  const p = program(`variables:
  schedule_current_day: {scope: environment, type: number, initial: 1, read_only: true}
  schedule_current_weekday: {scope: environment, type: number, initial: 1, read_only: true}
  schedule_current_slot: {scope: environment, type: number, initial: 1, read_only: true}
  n: {scope: environment, initial: 0}
slots:
  s: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: vars.schedule_current_slot}}]}
days: {d: {slots: [s, s, s]}}
weeks: {w: {days: {thu: d, fri: d}}}
sequences: {s: {weeks: [w], start_weekday: thu}}
`);
  const r = new Runtime({ program: p }), changes = [];
  r.on('variable.change', ({ after }) => { assert.equal(r.getVariable('n'), after); changes.push(after); });
  await r.runDay({ sequence: 's' });
  assert.equal(r.getVariable('schedule_current_day'), 1); assert.equal(r.getVariable('schedule_current_weekday'), 4);
  assert.deepEqual(changes, [1, 3, 6]);
  await r.nextDay(); assert.equal(r.getVariable('schedule_current_day'), 2); assert.equal(r.getVariable('n'), 12);
});

test('cooldown counts eligible dates and sequential choices persist across day checkpoints', async () => {
  const p = program(`variables: {n: {initial: 0}}
slots:
  a: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "1"}}]}
  b: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "10"}}]}
days: {a: {start: a}, b: {start: b}}
weeks: {w: {}}
sequences:
  s:
    weeks: [w]
    events:
      e: {kind: probability, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, probability: 100, cooldown_days: 2, source: {mode: sequential, candidates: [{day: a}, {day: b}]}}
`);
  let r = new Runtime({ program: p }); await r.runDay({ sequence: 's' }); assert.equal(r.getVariable('n'), 1);
  r = Runtime.restore({ program: p, checkpoint: portable(r.snapshot()) });
  await r.nextDay(); await r.nextDay(); assert.equal(r.getVariable('n'), 1);
  await r.nextDay(); assert.equal(r.getVariable('n'), 11);
  await assert.rejects(r.runDay({ sequence: 's', dayIndex: 0 }), /nonSequentialDate/);
});

test('reserved events execute on the future day after snapshot restore', async () => {
  const p = program(`variables: {n: {initial: 0}}
slots:
  reserve:
    branches: [{when: null, run: {builtin: schedule_event, date: {mode: days, offset: "1"}, day: event, execution: interrupt_main, priority: 1}}]
  increment: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "10"}}]}
days: {main: {start: reserve}, event: {slots: [increment, null, null]}}
weeks: {w: {days: {mon: main, tue: main}}}
sequences: {s: {weeks: [w]}}
`);
  const r = new Runtime({ program: p }); await r.runDay({ sequence: 's' }); assert.equal(r.getVariable('n'), 0); assert.equal(r.getState().reservations.length, 1);
  const restored = Runtime.restore({ program: p, checkpoint: portable(r.snapshot()) }); await restored.nextDay(); assert.equal(restored.getVariable('n'), 10);
});

test('random increments reproduce simulator values and restore continues the saved random stream', async () => {
  const yaml = `variables: {n: {initial: 0, integer: true}}
slots: {random: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "10", random_amplitude: "2"}}]}}
days: {d: {slots: [random, random, random]}}
weeks: {w: {days: {mon: d}}}
sequences: {s: {weeks: [w]}}
`;
  const draft = good(importBlueprint(yaml)).draft, p = Program.fromProject(draft, { referenceMode: 'name' });
  const r = new Runtime({ program: p, seed: 'random-test' }); await r.startDay({ sequence: 's' }); await r.step();
  const restored = Runtime.restore({ program: p, checkpoint: portable(r.snapshot()) }); await restored.resume();
  const simulation = simulateSequenceDay(draft, draft.sequences[0].id, 0, undefined, undefined, undefined, {}, {}, 'random-test');
  assert.equal(restored.getVariable('n'), simulation.state[Object.keys(draft.operandNodes)[0]]);
});

test('snapshots reject a different program, observers cannot corrupt state, and unhandled-task policy is explicit', async () => {
  const p = program(nested), r = new Runtime({ program: p, unhandledTasks: 'record' });
  let observerErrors = 0; r.on('observer.error', () => observerErrors++); r.on('task.start', () => { throw new Error('observerFailure'); });
  await r.runSlot({ slot: 'work' }); assert.equal(r.getVariable('n'), 5); assert.equal(r.getState().unmodeled, true); assert.ok(observerErrors > 0);
  assert.throws(() => Runtime.restore({ program: program(nested.replace('initial: 1', 'initial: 9')), checkpoint: r.snapshot() }), /checkpointProgramMismatch/);
  const missing = new Runtime({ program: p }); await assert.rejects(missing.runSlot({ slot: 'work' }), /missingTaskHandler/);
  assert.equal(missing.getVariable('n'), 2);
});
