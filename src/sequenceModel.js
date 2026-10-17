import { clearEngineKey } from './engineKeyModel.js';
import { clone, nextSlotId, uid } from './model.js';
import { WEEKDAYS } from './scheduleConstants.js';

export function createSequence(draft, name) {
  return { id: nextSlotId(draft.sequences), name, icon: 'tabler:calendar-stats', rows: [] };
}

export function duplicateSequence(draft, sequence) {
  return { ...clearEngineKey(sequence), id: nextSlotId(draft.sequences), name: `${sequence.name} (副本)`, rows: sequence.rows.map((row) => ({ ...clone(row), uid: uid() })) };
}

export function addSequenceRow(draft, sequence, weekId) {
  if (!draft.weeks.some((week) => week.id === weekId)) throw new Error('Unknown week');
  return { ...sequence, rows: [...sequence.rows, { uid: uid(), weekId, overrides: {} }] };
}

export function replaceSequenceWeek(draft, sequence, rowUid, weekId) {
  if (!draft.weeks.some((week) => week.id === weekId)) throw new Error('Unknown week');
  return { ...sequence, rows: sequence.rows.map((row) => row.uid === rowUid ? { ...row, weekId } : row) };
}

export function moveSequenceRow(sequence, rowUid, offset) {
  const index = sequence.rows.findIndex((row) => row.uid === rowUid); const target = index + offset;
  if (index < 0 || target < 0 || target >= sequence.rows.length) return sequence;
  const rows = [...sequence.rows]; const [row] = rows.splice(index, 1); rows.splice(target, 0, row);
  return { ...sequence, rows };
}

export function duplicateSequenceRow(sequence, rowUid) {
  const index = sequence.rows.findIndex((row) => row.uid === rowUid);
  if (index < 0) throw new Error('Unknown row');
  const rows = [...sequence.rows]; rows.splice(index + 1, 0, { ...clone(rows[index]), uid: uid() });
  return { ...sequence, rows };
}

export function removeSequenceRow(sequence, rowUid) {
  return { ...sequence, rows: sequence.rows.filter((row) => row.uid !== rowUid) };
}

export function setSequenceOverride(draft, sequence, rowUid, weekday, choice) {
  if (!WEEKDAYS.includes(weekday)) throw new Error('Unknown weekday');
  if (choice !== 'inherit' && choice !== null && !draft.days.some((day) => day.id === choice && (!day.scope || day.scope === 'shared'))) throw new Error('Expected a shared day');
  if (!sequence.rows.some((row) => row.uid === rowUid)) throw new Error('Unknown row');
  return { ...sequence, rows: sequence.rows.map((row) => {
    if (row.uid !== rowUid) return row;
    const overrides = { ...row.overrides };
    if (choice === 'inherit') delete overrides[weekday]; else overrides[weekday] = choice;
    return { ...row, overrides };
  }) };
}

export function resolveSequenceDay(draft, row, weekday) {
  const overridden = Object.hasOwn(row.overrides, weekday);
  const week = draft.weeks.find((item) => item.id === row.weekId);
  const dayId = overridden ? row.overrides[weekday] : week?.days[weekday];
  return { overridden, day: draft.days.find((day) => day.id === dayId) ?? null };
}

export function weekSequenceReferenceCount(draft, weekId) {
  return (draft.sequences ?? []).reduce((count, sequence) => count + sequence.rows.filter((row) => row.weekId === weekId).length, 0);
}

export function dayOverrideReferenceCount(draft, dayId) {
  return (draft.sequences ?? []).reduce((count, sequence) => count + sequence.rows.reduce((sum, row) => sum + Object.values(row.overrides).filter((id) => id === dayId).length, 0), 0);
}
