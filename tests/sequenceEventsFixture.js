import { createProject, createDay, createSlot, assignCell } from '../src/core/model.js';
import { createWeek } from '../src/core/weekModel.js';
import { createSequence, addSequenceRow } from '../src/core/sequenceModel.js';
import { newEventGroup, positionDate } from '../src/core/sequenceEvents.js';

export function sequenceEventsFixture() {
  let draft = createProject();
  const activity = createSlot([], 'Inspection task'); draft.slots = [activity];
  const main = createDay(draft, 'Workday'), eventDay = createDay(draft, 'Inspection'); draft.days = [main, eventDay];
  draft = assignCell(draft, eventDay.id, 'dayStart', activity.id);
  draft.weeks = [createWeek(draft, 'Work week'), createWeek(draft, 'Rest week')];
  draft.weeks[0].days.mon = main.id;
  let sequence = createSequence(draft, 'Schedule');
  for (const week of [draft.weeks[0], draft.weeks[1], draft.weeks[0]]) sequence = addSequenceRow(draft, sequence, week.id);
  draft.sequences = [sequence];
  return { draft, sequence, main, eventDay, activity };
}
export function rule(sequence, dayId, start = 0, end = 20, interval = 7, priority = 0) {
  return { ...newEventGroup(sequence, start), dayId, kind: interval === 0 ? 'once' : 'periodic', end: positionDate(end), interval, priority };
}
