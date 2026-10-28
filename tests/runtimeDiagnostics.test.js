import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { Diagnostics } from '../src/runtime/Diagnostics.js';

const blueprint = `variables: {n: {initial: 1}}
expressions:
  value:
    type: number
    branches:
      - {when: vars.n > 0, value: vars.n * 2}
      - {when: null, value: '1 / vars.n'}
tasks: {notify: {}}
task_macros:
  work:
    steps:
      - {builtin: increment_variable, target: n, value: expr.value, random_amplitude: '2'}
      - {task: notify}
slots:
  s:
    branches:
      - {when: 'ANY(vars.n > 0, 1 / (vars.n - 1) > 0)', run: {macro: work}}
      - {when: null, run: {task: notify}}
`;
const program = () => Program.fromProject(importBlueprint(blueprint).draft, { referenceMode: 'name' });

test('disabled diagnostics skip record factories and emit no records while lifecycle events remain available', async () => {
  let factories = 0, actions = 0;
  const disabled = new Diagnostics(false, () => { throw new Error('must not emit'); });
  disabled.begin('condition', () => { factories++; return {}; });
  disabled.note('value', () => { factories++; return {}; });
  disabled.end('condition', () => { factories++; return {}; });
  assert.equal(disabled.observe('value', () => { factories++; return {}; }, () => ++actions), 1);
  assert.equal(factories, 0); assert.equal(actions, 1);
  const results = [];
  for (const diagnostics of [false, true]) {
    const records = [], lifecycle = [], runtime = new Runtime({ program: program(), diagnostics, seed: 'same', unhandledTasks: 'record' });
    runtime.on('diagnostic', (record) => records.push(record));
    for (const name of ['slot.body', 'task.start', 'task.completed', 'variable.change']) runtime.on(name, () => lifecycle.push(name));
    await runtime.runSlot({ slot: 's' });
    results.push({ n: runtime.getVariable('n'), random: runtime.getState().randomState, lifecycle });
    if (!diagnostics) assert.equal(records.length, 0);
    else {
      assert.ok(records.length > 10); assert.ok(records.some((record) => record.kind === 'condition' && record.skipped));
      assert.ok(records.some((record) => record.kind === 'branch' && record.skipped));
      assert.ok(records.some((record) => record.kind === 'return' && record.value === 2));
      assert.ok(records.some((record) => record.kind === 'variable.staged' && !record.committed));
      assert.ok(records.some((record) => record.kind === 'variable.committed' && record.committed));
      const begins = records.filter((record) => record.type === 'enter'), ends = records.filter((record) => record.type === 'exit');
      for (const entry of begins) assert.equal(ends.filter((record) => record.id === entry.id).length, 1);
      assert.ok(records.every((record, index) => record.sequence === index + 1 && Object.isFrozen(record)));
      assert.throws(() => { records[0].kind = 'changed'; }, TypeError);
    }
    assert.equal(runtime.getState().diagnostics, undefined); assert.equal(runtime.snapshot().state.records, undefined);
  }
  assert.deepEqual(results[0], results[1]);
});

test('failed tasks distinguish staged from committed writes; retries have one invocation and separate attempts', async () => {
  const records = [], runtime = new Runtime({ program: program(), diagnostics: true });
  runtime.on('diagnostic', (record) => records.push(record));
  runtime.registerTask('notify', (_, context) => { context.setVariable('n', 99); throw new Error('failed'); });
  await assert.rejects(runtime.runSlot({ slot: 's' }), /failed/);
  const committed = runtime.getVariable('n'); assert.notEqual(committed, 99);
  assert.ok(records.some((record) => record.kind === 'variable.staged' && record.after === 99));
  assert.ok(!records.some((record) => record.kind === 'variable.committed' && record.after === 99));
  const failure = records.find((record) => record.kind === 'task.failed'); assert.equal(failure.attempt, 1);
  runtime.registerTask('notify', () => {}); await runtime.resume();
  const completion = records.find((record) => record.completed && record.pending?.name === 'notify');
  assert.equal(completion.invocationId, failure.invocationId); assert.equal(completion.attempt, 2);
});

test('previewing a day neither mutates runtime state nor emits diagnostic history', () => {
  const input = importBlueprint(`days: {d: {}}
weeks: {w: {}}
sequences: {s: {weeks: [w], events: {e: {kind: probability, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, probability: 50, cooldown_days: 2, day: d}}}}
`);
  assert.deepEqual(input.errors, []);
  const runtime = new Runtime({ program: Program.fromProject(input.draft), diagnostics: true });
  const before = runtime.snapshot(), records = []; runtime.on('diagnostic', (record) => records.push(record));
  const first = runtime.previewDay({ sequence: 's' }), second = runtime.previewDay({ sequence: 's' });
  assert.deepEqual(first, second); assert.deepEqual(runtime.snapshot(), before); assert.equal(records.length, 0);
});

test('diagnostic observation frames do not change the execution nesting limit', async () => {
  let yaml = 'variables: {n: {initial: 0}}\ntask_macros:\n';
  for (let index = 0; index < 30; index++) yaml += `  m${index}: {steps: [{${index === 29 ? 'builtin: increment_variable, target: n, value: "1"' : `macro: m${index + 1}`}}]}\n`;
  yaml += 'slots: {s: {branches: [{when: null, run: {macro: m0}}]}}\n';
  const imported = importBlueprint(yaml); assert.deepEqual(imported.errors, []);
  const p = Program.fromProject(imported.draft);
  for (const diagnostics of [false, true]) { const runtime = new Runtime({ program: p, diagnostics }); await runtime.runSlot({ slot: 's' }); assert.equal(runtime.getVariable('n'), 1); }
});
