import { WEEKDAYS } from './scheduleConstants.js';

export function sequenceRange(sequence) {
  const startWeekday = sequence.startWeekday ?? 'mon', endWeekday = sequence.endWeekday ?? 'sun';
  const start = WEEKDAYS.indexOf(startWeekday), end = (sequence.rows.length - 1) * 7 + WEEKDAYS.indexOf(endWeekday);
  return { startWeekday, endWeekday, start, end, totalDays: sequence.rows.length ? end - start + 1 : 0 };
}

export function normalizeSequenceRange(sequence) {
  const range = sequenceRange(sequence);
  return sequence.rows.length === 1 && range.start > range.end ? { ...sequence, endWeekday: range.startWeekday } : sequence;
}

export function setSequenceBoundary(sequence, boundary, weekday) {
  if (!['start', 'end'].includes(boundary) || !WEEKDAYS.includes(weekday)) throw new Error('Invalid sequence boundary');
  const range = sequenceRange(sequence);
  const next = { ...sequence, startWeekday: range.startWeekday, endWeekday: range.endWeekday, [boundary === 'start' ? 'startWeekday' : 'endWeekday']: weekday };
  if (next.rows.length === 1 && WEEKDAYS.indexOf(next.startWeekday) > WEEKDAYS.indexOf(next.endWeekday)) {
    if (boundary === 'start') next.endWeekday = weekday; else next.startWeekday = weekday;
  }
  return next;
}

export function sequenceDate(sequence, rowIndex, weekday) {
  const range = sequenceRange(sequence), position = rowIndex * 7 + WEEKDAYS.indexOf(weekday);
  const before = position < range.start, after = position > range.end;
  return { before, after, active: !before && !after, dayNumber: before || after ? null : position - range.start + 1,
    isStart: rowIndex === 0 && weekday === range.startWeekday, isEnd: rowIndex === sequence.rows.length - 1 && weekday === range.endWeekday };
}
