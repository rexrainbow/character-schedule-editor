import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, compileProject, projectToDraft, validateDocument } from '../src/model.js';
import { createWeek, deleteWeek } from '../src/weekModel.js';
import { createSequence, addSequenceRow, removeSequenceRow, duplicateSequence, moveSequenceRow } from '../src/sequenceModel.js';
import { sequenceDate, sequenceRange, setSequenceBoundary } from '../src/sequenceRange.js';
import { compileRuntime, validateRuntimeDocument } from '../src/runtimeModel.js';

function fixture() {
  const draft = createProject(); draft.weeks = [createWeek(draft, 'First'), createWeek(draft, 'Last')];
  let sequence = createSequence(draft, 'Range');
  for (const week of draft.weeks) sequence = addSequenceRow(draft, sequence, week.id);
  draft.sequences = [sequence]; return { draft, sequence };
}

test('inclusive ranges count from the start date and round-trip/export without losing out-of-range dates', () => {
  const { draft, sequence } = fixture();
  const changed = setSequenceBoundary(setSequenceBoundary(sequence, 'start', 'thu'), 'end', 'tue');
  assert.equal(sequenceRange(changed).totalDays, 6);
  assert.equal(sequenceDate(changed, 0, 'wed').before, true);
  assert.equal(sequenceDate(changed, 0, 'thu').dayNumber, 1);
  assert.equal(sequenceDate(changed, 1, 'tue').dayNumber, 6);
  assert.equal(sequenceDate(changed, 1, 'wed').after, true);
  draft.sequences = [changed]; const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.sequences[changed.id].start_weekday, 'thu');
  assert.equal(runtime.data.sequences[changed.id].end_weekday, 'tue');
  assert.equal(runtime.data.sequences[changed.id].entries.length, 2);
  assert.equal(duplicateSequence(draft, changed).startWeekday, 'thu');
  assert.equal(moveSequenceRow(changed, changed.rows[1].uid, -1).endWeekday, 'tue');
  const legacy = structuredClone(project.data); delete legacy.week_sequences[changed.id].start_weekday; delete legacy.week_sequences[changed.id].end_weekday;
  assert.equal(sequenceRange(projectToDraft(legacy).sequences[0]).totalDays, 14);
});

test('single-week edits move the opposite boundary; row/source deletions normalize and empty sequences retain preferences', () => {
  const { draft, sequence } = fixture();
  let one = removeSequenceRow(sequence, sequence.rows[1].uid);
  one = setSequenceBoundary(one, 'start', 'sat'); one = setSequenceBoundary(one, 'end', 'tue');
  assert.equal(one.startWeekday, 'tue'); assert.equal(one.endWeekday, 'tue');
  one = setSequenceBoundary(one, 'start', 'sun'); assert.equal(one.endWeekday, 'sun');
  assert.equal(sequenceRange(one).totalDays, 1);
  const changed = setSequenceBoundary(setSequenceBoundary(sequence, 'start', 'fri'), 'end', 'mon');
  assert.equal(removeSequenceRow(changed, changed.rows[1].uid).endWeekday, 'fri');
  draft.sequences = [changed]; assert.equal(deleteWeek(draft, draft.weeks[1].id).sequences[0].endWeekday, 'fri');
  const empty = { ...changed, rows: [] }; assert.equal(sequenceRange(empty).totalDays, 0);
  assert.equal(addSequenceRow(draft, empty, draft.weeks[0].id).endWeekday, 'fri');
  const invalid = compileProject({ ...draft, sequences: [one] }).data;
  invalid.week_sequences[one.id].start_weekday = 'fri'; invalid.week_sequences[one.id].end_weekday = 'mon';
  assert.ok(validateDocument(invalid).some((e) => e.key === 'invalidSequenceRange' && e.path.endsWith('/end_weekday')));
  invalid.week_sequences[one.id].start_weekday = 'bad'; assert.ok(validateDocument(invalid).some((e) => e.key === 'schema_enum'));
});
