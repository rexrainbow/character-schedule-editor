import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { simulateContinuous, replayContinuousDay } from '../src/simulation/continuous.js';

function fixture(repeat = 'null', formula = '1') {
  const result = importBlueprint(`variables: {n: {initial: 0}, pay: {initial: 0}}
slots:
  inc: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "${formula}", random_amplitude: "1"}}]}
  payday: {branches: [{when: null, run: {builtin: increment_variable, target: pay, value: "10"}}]}
days: {d: {start: inc}, e: {start: payday}}
weeks: {w: {days: {mon: d, tue: d, wed: d, thu: d, fri: d, sat: d, sun: d}}}
sequences: {s: {weeks: [{week: w, repeat: ${repeat}}], events: {weekly: {kind: periodic, start: {week: 1, weekday: sun}, end: {week: 1, weekday: sun}, every: 1, day: e}, chance: {kind: probability, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, probability: 50, cooldown_days: 3, day: e}}}}
`);
  assert.deepEqual(result.errors, []); return result.draft;
}
test('continuous summaries preserve state across weeks and replay a day from the pre-start checkpoint', async () => {
  const draft = fixture(), before = structuredClone(draft), sequenceId = draft.sequences[0].id;
  const first = await simulateContinuous(draft, { sequenceId, days: 21, seed: 'repeatable' });
  const second = await simulateContinuous(draft, { sequenceId, days: 21, seed: 'repeatable' });
  assert.equal(first.status, 'completed'); assert.deepEqual(first.errors, []);
  assert.deepEqual(first.days.map((day) => day.after), second.days.map((day) => day.after));
  assert.deepEqual(first.days.map((day) => day.events.map((event) => event.eventRef)), second.days.map((day) => day.events.map((event) => event.eventRef)));
  assert.equal(first.days.length, 21); assert.equal(first.weeks.length, 3);
  assert.ok(first.weeks.every((week) => week.days === 7 && !week.partial));
  assert.equal(first.days[14].iteration, 3);
  const replay = await replayContinuousDay(draft, first, first.days[14]);
  assert.deepEqual(replay.errors, []); assert.deepEqual(replay.state, first.days[14].after);
  assert.ok(replay.trace.length > 0);
  const n = Object.keys(draft.operandNodes).find((id) => draft.operandNodes[id].symbol === 'n');
  const contribution = Object.values(first.days[0].sourceChanges).flatMap((item) => Object.values(item.changes)).filter((item) => item.id === n).reduce((sum, item) => sum + item.delta, 0);
  assert.equal(contribution, first.days[0].after[n] - first.days[0].before[n]);
  assert.deepEqual(first.weeks[0].after, first.days[6].after);
  assert.equal(first.days[0].taskChanges.increment_variable.changes[n].delta, contribution);
  assert.equal(first.days[0].taskCount, Object.values(first.days[0].tasks).reduce((sum, value) => sum + value, 0));
  assert.deepEqual(draft, before);
});
test('finite ranges stop naturally, partial weeks remain labeled, cancel preserves completed dates', async () => {
  const draft = fixture('1'), sequenceId = draft.sequences[0].id;
  draft.sequences[0].startWeekday = 'thu'; draft.sequences[0].endWeekday = 'sat';
  const finite = await simulateContinuous(draft, { sequenceId, days: 28 });
  assert.equal(finite.days.length, 3); assert.equal(finite.reachedEnd, true); assert.equal(finite.weeks[0].partial, true);
  const endless = fixture(), controller = new AbortController();
  const cancelled = await simulateContinuous(endless, { sequenceId: endless.sequences[0].id, days: 28, signal: controller.signal, onDay: (progress) => { if (progress.days.length === 2) controller.abort(); } });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.days.length, 2);
  assert.deepEqual(cancelled.finalValues, cancelled.days[1].after);
});
test('invalid inputs fail before execution and runtime failures retain already completed days', async () => {
  const draft = fixture('null', '1 / (1 - vars.n)'), sequenceId = draft.sequences[0].id;
  assert.equal((await simulateContinuous(draft, { sequenceId, days: 0 })).status, 'failed');
  const slot = draft.slots.find((item) => item.symbol === 'inc');
  // First day succeeds, next day fails during numeric argument evaluation.
  slot.branches[0].task.random_amplitude = { type: 'constant', value: 0 };

  const result = await simulateContinuous(draft, { sequenceId, days: 5 });
  assert.equal(result.status, 'failed'); assert.equal(result.days.length, 1); assert.equal(result.errorPosition, 1);
});
