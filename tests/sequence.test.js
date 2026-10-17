import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/example.json' with { type: 'json' };
import { clone, compileProject, createDay, idPattern, projectToDraft, validateDocument } from '../src/model.js';
import { changeWeekCell, createWeek, deleteSharedDay, deleteWeek, setWeekDay } from '../src/weekModel.js';
import { addSequenceRow, createSequence, dayOverrideReferenceCount, duplicateSequence, duplicateSequenceRow, moveSequenceRow, removeSequenceRow, replaceSequenceWeek, resolveSequenceDay, setSequenceOverride, weekSequenceReferenceCount } from '../src/sequenceModel.js';

function setup() {
  let draft = projectToDraft(example);
  const first = createWeek(draft, 'Normal week'); draft.weeks.push(first);
  const second = createWeek(draft, 'Rest week'); draft.weeks.push(second);
  const holiday = createDay(draft, 'Holiday'); draft.days.push(holiday);
  draft = setWeekDay(draft, first.id, 'mon', draft.days[0].id);
  draft = changeWeekCell(draft, first.id, 'wed', 0, draft.slots[0].id);
  let sequence = createSequence(draft, 'Stage 0');
  sequence = addSequenceRow(draft, sequence, first.id);
  sequence = addSequenceRow(draft, sequence, second.id);
  sequence = addSequenceRow(draft, sequence, first.id);
  sequence = setSequenceOverride(draft, sequence, sequence.rows[0].uid, 'mon', holiday.id);
  sequence = setSequenceOverride(draft, sequence, sequence.rows[1].uid, 'fri', null);
  draft.sequences.push(sequence);
  return { draft, sequence, first, second, holiday };
}
const withSequence = (draft, sequence) => ({ ...draft, sequences: [sequence] });
const check = (draft) => assert.deepEqual(compileProject(draft).errors, []);

test('empty sequences are valid, UUID-based, and old projects normalize missing collections', () => {
  const old = clone(example); delete old.week_sequences;
  assert.deepEqual(validateDocument(old), []);
  const draft = projectToDraft(old); const sequence = createSequence(draft, 'Empty');
  assert.match(sequence.id, idPattern); assert.deepEqual(sequence.rows, []);
  const result = compileProject(withSequence(draft, sequence)); assert.deepEqual(result.errors, []);
  assert.deepEqual(result.data.week_sequences[sequence.id], { display_name: 'Empty', icon: 'tabler:calendar-stats', week_schedule_ids: [], day_overrides: [] });
});
test('sequence references and explicit null override survive full document round-trip', () => {
  const { draft } = setup(); const compiled = compileProject(draft); check(draft);
  assert.deepEqual(compileProject(projectToDraft(compiled.data)).data, compiled.data);
});
test('moving and deleting rows renumber overrides with their original repeated week rows', () => {
  const { draft, sequence } = setup();
  let changed = moveSequenceRow(sequence, sequence.rows[1].uid, -1);
  let result = compileProject(withSequence(draft, changed)).data.week_sequences[sequence.id];
  assert.deepEqual(result.day_overrides.map((item) => [item.week_number, item.weekday]), [[1, 'fri'], [2, 'mon']]);
  changed = removeSequenceRow(changed, changed.rows[0].uid);
  result = compileProject(withSequence(draft, changed)).data.week_sequences[sequence.id];
  assert.deepEqual(result.day_overrides.map((item) => [item.week_number, item.weekday]), [[1, 'mon']]);
  check(withSequence(draft, changed));
});
test('duplicating rows and sequences deep-copies overrides but keeps source references', () => {
  const { draft, sequence, first } = setup(); const copiedRow = duplicateSequenceRow(sequence, sequence.rows[0].uid);
  assert.equal(copiedRow.rows[1].weekId, first.id); assert.notEqual(copiedRow.rows[1].uid, copiedRow.rows[0].uid);
  copiedRow.rows[1].overrides.mon = null; assert.notEqual(sequence.rows[0].overrides.mon, null);
  const copied = duplicateSequence(draft, sequence); assert.notEqual(copied.id, sequence.id);
  assert.equal(copied.name, 'Stage 0 (副本)'); copied.rows[0].overrides.mon = null;
  assert.notEqual(sequence.rows[0].overrides.mon, null); assert.equal(copied.rows[0].weekId, first.id);
  check({ ...draft, sequences: [...draft.sequences, copied] });
});
test('replacing source week preserves overrides, removing overrides restores live inheritance', () => {
  const { draft, sequence, first, second, holiday } = setup();
  let changed = replaceSequenceWeek(draft, sequence, sequence.rows[0].uid, second.id);
  assert.equal(resolveSequenceDay(draft, changed.rows[0], 'mon').day.id, holiday.id);
  changed = setSequenceOverride(draft, changed, changed.rows[0].uid, 'mon', 'inherit');
  assert.equal(resolveSequenceDay(draft, changed.rows[0], 'mon').day, null);
  changed = replaceSequenceWeek(draft, changed, changed.rows[0].uid, first.id);
  assert.equal(resolveSequenceDay(draft, changed.rows[0], 'mon').day.id, draft.days[0].id);
  const updated = setWeekDay(draft, first.id, 'mon', holiday.id);
  assert.equal(resolveSequenceDay(updated, changed.rows[0], 'mon').day.id, holiday.id);
  assert.equal(updated.days.length, draft.days.length);
});
test('the last row can be deleted and no overrides remain', () => {
  const { draft, sequence } = setup(); let changed = sequence;
  for (const row of sequence.rows) changed = removeSequenceRow(changed, row.uid);
  const result = compileProject(withSequence(draft, changed)); assert.deepEqual(result.errors, []);
  assert.deepEqual(result.data.week_sequences[sequence.id].day_overrides, []);
  assert.deepEqual(result.data.week_sequences[sequence.id].week_schedule_ids, []);
});
test('deleting source weeks removes every referencing row with its overrides and may empty sequences', () => {
  const { draft, first, second, sequence } = setup();
  assert.equal(weekSequenceReferenceCount(draft, first.id), 2);
  let changed = deleteWeek(draft, first.id); assert.equal(changed.sequences[0].rows.length, 1);
  let result = compileProject(changed); assert.deepEqual(result.errors, []);
  assert.deepEqual(result.data.week_sequences[sequence.id].day_overrides, [{ week_number: 1, weekday: 'fri', day_schedule_id: null }]);
  changed = deleteWeek(changed, second.id); assert.equal(changed.sequences[0].rows.length, 0); check(changed);
  assert.equal(changed.days.some((day) => day.scope === 'week_private'), false);
});
test('deleting overridden shared day removes the override and restores the inherited day', () => {
  const { draft, holiday } = setup(); assert.equal(dayOverrideReferenceCount(draft, holiday.id), 1);
  const changed = deleteSharedDay(draft, holiday.id); const row = changed.sequences[0].rows[0];
  assert.equal(Object.hasOwn(row.overrides, 'mon'), false);
  assert.equal(resolveSequenceDay(changed, row, 'mon').day.id, draft.days[0].id); check(changed);
});
test('private days cannot be selected as overrides or produce anonymous copies through sequence operations', () => {
  const { draft, sequence } = setup(); const privateDay = draft.days.find((day) => day.scope === 'week_private');
  assert.throws(() => setSequenceOverride(draft, sequence, sequence.rows[0].uid, 'mon', privateDay.id));
  assert.equal(resolveSequenceDay(draft, sequence.rows[0], 'wed').day.id, privateDay.id);
  const copied = duplicateSequence(draft, sequence); assert.equal(draft.days.length, 3);
  check({ ...draft, sequences: [...draft.sequences, copied] });
});
test('import rejects dangling references, duplicate overrides, out-of-range week numbers and private override sources', () => {
  const { draft, sequence } = setup(); const valid = compileProject(draft).data;
  const mutation = (edit, key) => { const data = clone(valid); edit(data.week_sequences[sequence.id], data); assert.ok(validateDocument(data).some((error) => error.key === key)); };
  mutation((seq) => seq.week_schedule_ids[0] = crypto.randomUUID(), 'missingWeek');
  mutation((seq) => seq.day_overrides.push(clone(seq.day_overrides[0])), 'duplicateOverride');
  mutation((seq) => seq.day_overrides[0].week_number = 9, 'overrideRange');
  mutation((seq) => seq.day_overrides[0].week_number = 0, 'overrideRange');
  mutation((seq) => seq.day_overrides[0].day_schedule_id = crypto.randomUUID(), 'missingDay');
  mutation((seq, data) => seq.day_overrides[0].day_schedule_id = Object.keys(data.day_schedules).find((id) => data.day_schedules[id].scope === 'week_private'), 'overrideSharedOnly');
  mutation((seq) => seq.week_schedule_ids[0] = null, 'schema_type');
});
