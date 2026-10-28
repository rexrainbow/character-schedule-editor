import { WEEKDAYS } from './scheduleConstants.js';

// repeatCount is total executions, not extra copies. null means unbounded.
export const weekRepeatCount = (row) => row.repeatCount === undefined ? 1 : row.repeatCount;
export function sequenceRepeatErrors(sequence) {
  const errors = [];
  let weeks = 0;
  sequence.rows.forEach((row, index) => {
    const count = weekRepeatCount(row);
    if (count !== null && (!Number.isSafeInteger(count) || count < 1)) errors.push({ path: `/week_repeat_counts/${index}`, key: 'invalidWeekRepeat' });
    if (count === null && index !== sequence.rows.length - 1) errors.push({ path: `/week_repeat_counts/${index}`, key: 'infiniteWeekMustBeLast' });
    if (count !== null) weeks += count;
  });
  if (!Number.isSafeInteger(weeks * 7)) errors.push({ path: '/week_repeat_counts', key: 'invalidWeekRepeat' });
  return errors;
}
export function sequenceExecutionRange(sequence) {
  const start = WEEKDAYS.indexOf(sequence.startWeekday ?? 'mon');
  const infinite = sequence.rows.some((row) => weekRepeatCount(row) === null);
  const totalWeeks = infinite ? null : sequence.rows.reduce((sum, row) => sum + weekRepeatCount(row), 0);
  const end = infinite ? Infinity : sequence.rows.length ? (totalWeeks - 1) * 7 + WEEKDAYS.indexOf(sequence.endWeekday ?? 'sun') : start - 1;
  return { start, end, totalWeeks, totalDays: Math.max(0, end - start + 1), infinite };
}
export function resolveExecutionDate(sequence, position) {
  const range = sequenceExecutionRange(sequence);
  if (!Number.isSafeInteger(position) || position < range.start || position > range.end) return null;
  let firstWeek = 0;
  for (let rowIndex = 0; rowIndex < sequence.rows.length; rowIndex++) {
    const row = sequence.rows[rowIndex], count = weekRepeatCount(row);
    if (count === null || position < (firstWeek + count) * 7) return {
      row, rowIndex, iteration: Math.floor(position / 7) - firstWeek + 1,
      templatePosition: rowIndex * 7 + position % 7, position,
      weekday: WEEKDAYS[position % 7], weekNumber: Math.floor(position / 7) + 1,
      dayNumber: position - range.start + 1,
    };
    firstWeek += count;
  }
  return null;
}
// Earliest active execution of a cell; editor dates stay template coordinates.
export function firstExecutionPosition(sequence, templatePosition) {
  if (!Number.isSafeInteger(templatePosition)) return null;
  const rowIndex = Math.floor(templatePosition / 7), weekday = templatePosition % 7;
  if (rowIndex < 0 || rowIndex >= sequence.rows.length || weekday < 0) return null;
  let firstWeek = 0;
  for (let index = 0; index < rowIndex; index++) {
    const count = weekRepeatCount(sequence.rows[index]);
    if (count === null) return null;
    firstWeek += count;
  }
  let position = firstWeek * 7 + weekday;
  const range = sequenceExecutionRange(sequence), count = weekRepeatCount(sequence.rows[rowIndex]);
  if (position < range.start && (count === null || count > 1)) position += 7;
  return position >= range.start && position <= range.end ? position : null;
}
// Counts using a seven-day template pattern, without expanding repeated weeks.
export function countExecutionDates(sequence, through, matches, from) {
  const range = sequenceExecutionRange(sequence), end = Math.min(through, range.end);
  const startPosition = from ?? range.start;
  if (end < startPosition) return 0;
  let total = 0, firstWeek = 0;
  for (let rowIndex = 0; rowIndex < sequence.rows.length; rowIndex++) {
    const count = weekRepeatCount(sequence.rows[rowIndex]), start = Math.max(startPosition, firstWeek * 7);
    const last = Math.min(end, count === null ? Infinity : (firstWeek + count) * 7 - 1);
    if (last >= start) for (let weekday = 0; weekday < 7; weekday++) if (matches(rowIndex * 7 + weekday)) {
      const first = Math.ceil((start - weekday) / 7), final = Math.floor((last - weekday) / 7);
      total += Math.max(0, final - first + 1);
    }
    if (count === null || last === end) break;
    firstWeek += count;
  }
  return total;
}
