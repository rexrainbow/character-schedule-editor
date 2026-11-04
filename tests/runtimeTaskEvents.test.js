import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';

const yaml = `variables: {n: {initial: 8, min: 0, max: 10, integer: true}, flag: {type: boolean, initial: false}}
task_macros:
  ops:
    steps:
      - {builtin: increment_variable, target: n, value: "5", random_amplitude: "0"}
      - {builtin: increment_variable, target: n, value: "1"}
      - {builtin: toggle_variable, target: flag}
      - {builtin: set_variable, target: n, value: "4"}
      - {builtin: reset_variable, target: n}
slots: {s: {branches: [{when: null, run: {macro: ops}}]}}
`;
function build(source = yaml, referenceMode = 'name') {
  const input = importBlueprint(source); assert.deepEqual(input.errors, []);
  return Program.fromProject(input.draft, { referenceMode });
}

for (const mode of ['name', 'uuid']) test(`${mode}: builtin task notifications expose evaluated arguments and committed results even when clamped`, async () => {
  const program = build(yaml, mode), runtime = new Runtime({ program }), starts = [], completed = [], diagnostics = [];
  runtime.on('task.start', (record) => starts.push(record));
  runtime.on('task.completed', (record) => { completed.push(record); assert.equal(runtime.getVariable(record.result.target_variable_id), record.result.after); });
  runtime.on('diagnostic', (record) => diagnostics.push(record));
  await runtime.runSlot({ slot: 's' });
  assert.equal(completed.length, 5); assert.equal(starts.length, 5); assert.deepEqual(diagnostics, []);
  assert.deepEqual(starts.map((record) => record.arguments), completed.map((record) => record.arguments));
  const first = completed[0]; assert.equal(first.builtin, 'increment_variable');
  assert.deepEqual(first.arguments, { target: { type: 'variable_reference', reference_id: program.resolve('variables', 'n'), access: 'read_write' }, value: 5, random_amplitude: 0 });
  assert.deepEqual(first.result, { target_variable_id: program.resolve('variables', 'n'), before: 8, requested: 13, after: 10, increment: 5, random_amplitude: 0, random_offset: 0 });
  assert.equal(first.changes[0].after, 10);
  assert.deepEqual(completed[1].changes, []); assert.equal(completed[1].result.requested, 11); assert.equal(completed[1].result.after, 10);
  assert.equal(completed[2].result.after, true); assert.equal(completed[3].arguments.value, 4); assert.equal(completed[4].result.after, 8);
  assert.ok(Object.isFrozen(first.arguments.target)); assert.ok(Object.isFrozen(first.result));
  assert.throws(() => { first.result.after = 999; }, TypeError); assert.equal(runtime.getVariable('n'), 8);
});

test('builtin identity stays fixed while configured task and parameter names are honored', async () => {
  const input = importBlueprint(yaml); assert.deepEqual(input.errors, []);
  input.draft.builtinTasks = { increment_variable: { symbol: 'gain', parameters: { target: { symbol: 'destination' }, value: { symbol: 'amount' } } } };
  const runtime = new Runtime({ program: Program.fromProject(input.draft) }); let record;
  runtime.once('task.completed', (value) => { record = value; });
  await runtime.runSlot({ slot: 's' });
  assert.equal(record.builtin, 'increment_variable'); assert.equal(record.name, 'gain');
  assert.equal(record.arguments.amount, 5); assert.ok(record.arguments.destination); assert.equal(record.arguments.value, undefined);
});

test('paused random builtin restores the same evaluated arguments, draw and result without drawing again', async () => {
  const program = build(yaml.replace('random_amplitude: "0"', 'random_amplitude: "2"'));
  const baseline = new Runtime({ program, seed: 'notify' }), original = [];
  baseline.on('task.completed', (record) => original.push(record)); await baseline.runSlot({ slot: 's' });
  const runtime = new Runtime({ program, seed: 'notify' }); let started;
  runtime.once('task.start', (record) => { started = record; runtime.pause(); });
  await runtime.runSlot({ slot: 's' }); assert.equal(runtime.status, 'paused');
  const restored = Runtime.restore({ program, checkpoint: JSON.parse(JSON.stringify(runtime.snapshot())) }), completed = [];
  restored.on('task.completed', (record) => completed.push(record)); await restored.resume();
  assert.deepEqual(completed[0].arguments, started.arguments); assert.deepEqual(completed[0].result, original[0].result);
  assert.equal(restored.getState().randomState, baseline.getState().randomState);
});

test('ordinary task completion includes evaluated arguments, handler result and committed variable changes', async () => {
  const program = build(`variables: {n: {initial: 1}}
tasks: {update: {parameters: {amount: {type: number}}}}
slots: {s: {branches: [{when: null, run: {task: update, arguments: {amount: "2 + 3"}}}]}}
`);
  const runtime = new Runtime({ program, taskHandlers: { update: (args, context) => { context.setVariable('n', args.amount); return { ok: true }; } } }); let record;
  runtime.once('task.completed', (value) => { record = value; }); await runtime.runSlot({ slot: 's' });
  assert.deepEqual(record.arguments, { amount: 5 }); assert.deepEqual(record.result, { ok: true }); assert.equal(record.builtin, undefined);
  assert.deepEqual(record.changes.map(({ before, after }) => [before, after]), [[1, 5]]);
});

test('flow builtins report resolved probability settings, reservation inputs and release decisions', async () => {
  const program = build(`project: {slots_per_day: 1}
task_macros:
  setup:
    steps:
      - {builtin: adjust_probability_event, event: {event: e}, property: probability_percent, operation: increase, value: "2 + 3"}
      - {builtin: schedule_event, date: {mode: days, offset: "1 + 1"}, day: event, execution: overlay, priority: 2}
slots: {setup: {branches: [{when: null, run: {macro: setup}}]}}
days: {main: {start: setup}, event: {releases: [{when: null}]}}
weeks: {w: {days: {mon: main}}}
sequences:
  s:
    weeks: [w]
    events:
      e: {kind: probability, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, probability: 100, cooldown_days: 0, day: event, execution: interrupt_main, priority: 1}
`);
  const runtime = new Runtime({ program }), completed = [];
  runtime.on('task.completed', (record) => completed.push(record)); await runtime.runDay({ sequence: 's' });
  const adjustment = completed.find((record) => record.builtin === 'adjust_probability_event');
  assert.equal(adjustment.arguments.value, 5); assert.equal(adjustment.arguments.event.event_group_id, 'e'); assert.equal(adjustment.result.after, 100);
  const reservation = completed.find((record) => record.builtin === 'schedule_event');
  assert.equal(reservation.arguments.offset, 2); assert.equal(reservation.arguments.day_source.day_schedule_id, 'event'); assert.equal(reservation.result.accepted, true);
  const release = completed.find((record) => record.builtin === 'release_slot');
  assert.deepEqual(release.arguments, { condition: true }); assert.equal(release.result.applied, true);
});

test('failed persistence never emits completion or committed changes for the failed task', async () => {
  let reject = true;
  const runtime = new Runtime({ program: build(), checkpointStore: { async save(id, checkpoint) {
    if (reject && checkpoint.state.variables.n === 10 && checkpoint.state.execution?.pending === null) throw new Error('save failed');
  } } }), completed = [], changes = [];
  runtime.on('task.completed', (record) => completed.push(record)); runtime.on('variable.change', (record) => changes.push(record));
  await assert.rejects(runtime.runSlot({ slot: 's' }), /save failed/);
  assert.equal(runtime.getVariable('n'), 8); assert.deepEqual(completed, []); assert.deepEqual(changes, []);
  reject = false; await runtime.resume(); assert.equal(completed.length, 5);
});
