import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint, exportBlueprint } from '../src/core/blueprint/index.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { sequenceExecutionRange, resolveExecutionDate, firstExecutionPosition } from '../src/core/sequenceExecution.js';
import { simulateSequenceDay } from '../src/simulation/index.js';
import { executeCommand } from '../src/core/commands.js';

const good = (result) => { assert.deepEqual(result.errors, []); return result; };
const portable = (value) => JSON.parse(JSON.stringify(value));
const base = `variables: {n: {initial: 0}}
slots: {inc: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "1"}}]}}
days: {d: {start: inc}}
weeks: {w: {days: {mon: d, tue: d, wed: d, thu: d, fri: d, sat: d, sun: d}}}
`;
const make = (sequence) => good(importBlueprint(base + `sequences: {s: ${sequence}}`)).draft;

test('finite week executions map intro, repetitions, outro and partial boundaries without expanding rows', async () => {
  const draft = make('{weeks: [w, {week: w, repeat: 3}, w], start_weekday: thu, end_weekday: tue}');
  const sequence = draft.sequences[0], range = sequenceExecutionRange(sequence);
  assert.equal(range.totalWeeks, 5); assert.equal(range.totalDays, 27);
  assert.equal(firstExecutionPosition(sequence, 14), 28);
  assert.deepEqual([resolveExecutionDate(sequence, 21).rowIndex, resolveExecutionDate(sequence, 21).iteration], [1, 3]);
  for (const referenceMode of ['uuid', 'name']) {
    const program = Program.fromProject(draft, { referenceMode }), runtime = new Runtime({ program });
    await runtime.runDay({ sequence: sequence.symbol });
    for (let i = 1; i < 27; i++) await runtime.nextDay();
    assert.equal(runtime.getVariable('n'), 27);
    assert.equal(runtime.getState().execution.dayNumber, 27);
    assert.equal(runtime.getState().execution.weekNumber, 5);
    await assert.rejects(runtime.nextDay(), { code: 'dateOutsideSequence' });
  }
});

test('single repeated week applies start only to first iteration and end only to last', async () => {
  const draft = make('{weeks: [{week: w, repeat: 3}], start_weekday: thu, end_weekday: tue}');
  assert.equal(sequenceExecutionRange(draft.sequences[0]).totalDays, 13);
  assert.equal(firstExecutionPosition(draft.sequences[0], 0), 7);
  const runtime = new Runtime({ program: Program.fromProject(draft, { referenceMode: 'name' }) });
  await runtime.runDay({ sequence: 's' }); for (let i = 1; i < 13; i++) await runtime.nextDay();
  assert.equal(runtime.getVariable('n'), 13);
  assert.equal(runtime.getState().execution.iteration, 3);
  await assert.rejects(runtime.nextDay(), { code: 'dateOutsideSequence' });
});

test('infinite final week preserves variables and checkpoint progress across repetitions', async () => {
  const draft = make('{weeks: [w, {week: w, repeat: null}], end_weekday: tue}');
  const program = Program.fromProject(draft, { referenceMode: 'name' });
  let runtime = new Runtime({ program }); await runtime.runDay({ sequence: 's' });
  for (let i = 1; i < 35; i++) {
    if (i === 14) runtime = Runtime.restore({ program, checkpoint: portable(runtime.snapshot()) });
    await runtime.nextDay();
  }
  assert.equal(runtime.getVariable('n'), 35);
  assert.equal(runtime.getState().execution.iteration, 4);
  assert.equal(runtime.getState().execution.weekNumber, 5);
  assert.equal(sequenceExecutionRange(draft.sequences[0]).totalWeeks, null);
});

test('project, runtime export, blueprint and editing API retain repeat counts and reject unreachable rows', () => {
  const draft = make('{weeks: [{week: w, repeat: 2}, {week: w, repeat: null}]}');
  const sequence = draft.sequences[0], doc = good(compileProject(draft)).data;
  assert.deepEqual(doc.week_sequences[sequence.id].week_repeat_counts, [2, null]);
  assert.deepEqual(good(compileProject(projectToDraft(doc))).data, doc);
  const output = good(compileRuntime(draft)).data; assert.deepEqual(validateRuntimeDocument(output), []);
  assert.deepEqual(output.sequences[sequence.id].entries.map((entry) => entry.repeat_count), [2, null]);
  const yaml = good(exportBlueprint(draft)).data;
  assert.deepEqual(good(importBlueprint(yaml)).draft.sequences[0].rows.map((row) => row.repeatCount), [2, null]);
  const invalid = structuredClone(doc); invalid.week_sequences[sequence.id].week_repeat_counts = [null, 1];
  assert.ok(validateDocument(invalid).some((error) => error.key === 'infiniteWeekMustBeLast'));
  const session = createProjectSession(draft, { mode: 'all' });
  assert.equal(session.sequences.setRepeat(sequence.id, sequence.rows[0].uid, null).ok, false);
  assert.equal(session.sequences.appendWeek(sequence.id, draft.weeks[0].id).ok, false);
  assert.equal(session.sequences.moveWeek(sequence.id, sequence.rows[1].uid, -1).ok, false);
  assert.equal(session.sequences.setRepeat(sequence.id, sequence.rows[1].uid, 4).ok, true);
  assert.equal(session.sequences.appendWeek(sequence.id, draft.weeks[0].id).ok, true);
  assert.equal(executeCommand(session, { object: 'sequences', action: 'setRepeat', name: sequence.symbol, rowId: sequence.rows[0].uid, count: 5 }).ok, true);
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.equal(session.sequences.setRepeat(sequence.id, sequence.rows[0].uid, count).ok, false);
});

test('periodic events accumulate eligible dates across weeks; once fires only once', async () => {
  const draft = make(`{weeks: [{week: w, repeat: 3}], events: {once: {kind: once, start: {week: 1, weekday: mon}, day: d}, periodic: {kind: periodic, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, every: 3, day: d}}}`);
  const program = Program.fromProject(draft, { referenceMode: 'name' }), runtime = new Runtime({ program });
  const once = [], periodic = [];
  for (let i = 0; i < 21; i++) {
    if (i === 0) await runtime.runDay({ sequence: 's' }); else await runtime.nextDay();
    const sources = runtime.getState().execution.sources;
    if (sources.some((source) => source.eventRef === 'once')) once.push(i);
    if (sources.some((source) => source.eventRef === 'periodic')) periodic.push(i);
  }
  assert.deepEqual(once, [0]); assert.deepEqual(periodic, [0, 3, 6, 9, 12, 15, 18]);
});

test('reservations target actual dates beyond the template and fire once after restore', async () => {
  const draft = good(importBlueprint(`variables: {n: {initial: 0}}
slots:
  reserve: {branches: [{when: null, run: {builtin: schedule_event, date: {mode: days, offset: "7"}, day: event}}]}
  inc: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "10"}}]}
days: {d: {start: reserve}, event: {start: inc}}
weeks: {w: {days: {mon: d}}}
sequences: {s: {weeks: [{week: w, repeat: 3}]}}
`)).draft;
  const program = Program.fromProject(draft, { referenceMode: 'name' });
  let runtime = new Runtime({ program }); await runtime.runDay({ sequence: 's' });
  assert.equal(runtime.getState().reservations[0].position, 7);
  runtime = Runtime.restore({ program, checkpoint: portable(runtime.snapshot()) });
  for (let i = 1; i <= 7; i++) await runtime.nextDay();
  assert.equal(runtime.getVariable('n'), 10);
  await runtime.nextDay(); assert.equal(runtime.getVariable('n'), 10);
});

test('day simulation resolves later template rows to their first actual execution', async () => {
  const draft = make('{weeks: [{week: w, repeat: 3}, w]}'), sequence = draft.sequences[0];
  const result = await simulateSequenceDay(draft, sequence.id, 7);
  assert.deepEqual(result.errors, []);
  assert.equal(result.plan.executionPosition, 21);
  assert.equal(result.plan.dayNumber, 22);
  assert.equal(result.plan.weekNumber, 4);
});

test('probability cooldown and sequential candidates persist across repeated weeks and restore', async () => {
  const draft = good(importBlueprint(base.replace('days: {d: {start: inc}}', 'days: {d: {start: inc}, a: {}, b: {}}') + `sequences: {s: {weeks: [{week: w, repeat: null}], events: {chance: {kind: probability, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, probability: 100, cooldown_days: 3, source: {mode: sequential, candidates: [{day: a}, {day: b}]}}}}}
`)).draft;
  const program = Program.fromProject(draft, { referenceMode: 'name' });
  let runtime = new Runtime({ program }); const days = [], dates = [];
  for (let i = 0; i < 13; i++) {
    if (i === 7) runtime = Runtime.restore({ program, checkpoint: portable(runtime.snapshot()) });
    if (i === 0) await runtime.runDay({ sequence: 's' }); else await runtime.nextDay();
    const source = runtime.getState().execution.sources.find((item) => item.eventRef === 'chance');
    if (source) { days.push(source.dayRef); dates.push(i); }
  }
  assert.deepEqual(dates, [0, 4, 8, 12]); assert.deepEqual(days, ['a', 'b', 'a', 'b']);
});

test('large repeat counts use bounded template data and overrides repeat every iteration', async () => {
  const draft = make('{weeks: [{week: w, repeat: 100000000}], overrides: [{week: 1, weekday: mon, day: null}]}');
  const sequence = draft.sequences[0], program = Program.fromProject(draft, { referenceMode: 'name' });
  const runtime = new Runtime({ program });
  const preview = runtime.previewDay({ sequence: 's', position: 70000000 });
  assert.equal(program.get('sequences', 's').rows.length, 1);
  assert.equal(preview.iteration, 10000001); assert.deepEqual(preview.sources, []);
  assert.equal(sequenceExecutionRange(sequence).totalWeeks, 100000000);
});
