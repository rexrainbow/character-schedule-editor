import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { createDay, createSlot, assignCell } from '../src/core/model.js';
import { changeWeekCell } from '../src/core/weekModel.js';
import { createTaskMacro, createTaskStep } from '../src/core/taskMacroModel.js';
import { WEEKDAYS } from '../src/core/scheduleConstants.js';

export function reportFixture() {
  let { draft, sequence, main, eventDay, activity } = sequenceEventsFixture();
  draft.project.name = 'Daily routine'; main.tags = ['Office'];
  for (const week of draft.weeks) for (const weekday of WEEKDAYS) week.days[weekday] = main.id;
  const rest = createDay(draft, 'Rest day'); draft.days.push(rest);
  sequence.startWeekday = 'thu'; sequence.endWeekday = 'tue'; sequence.rows[0].overrides.thu = rest.id; sequence.rows[0].overrides.sat = null;
  const high = { ...rule(sequence, eventDay.id, 0, 20, 3, 20), display_name: 'Inspection event', countFilter: { kind: 'tag', tag: 'Office' } };
  const cold = { ...rule(sequence, eventDay.id, 0, 20, 1, 10), kind: 'probability', display_name: 'Cold', probability_percent: 10, cooldown_days: 7 };
  const low = { ...rule(sequence, eventDay.id, 4, 4, 0, -1), display_name: 'Evening event' };
  sequence.eventGroups = [high, cold, low];
  const macro = createTaskMacro('Inspection macro');
  macro.steps = [{ ...createTaskStep(), task: { builtin: 'adjust_probability_event', event: { type: 'event_reference', event_group_id: cold.id }, property: 'probability_percent', operation: 'increase', value: { type: 'constant', value: 5 } } }];
  draft.taskMacros = [macro]; activity.branches = [{ uid: crypto.randomUUID(), condition: null, task: { task_macro_id: macro.id, arguments: {} } }];
  const empty = createSlot(draft.slots, 'Rest'); draft.slots.push(empty);
  draft = assignCell(draft, main.id, 0, activity.id);
  draft = assignCell(draft, main.id, 2, empty.id);
  draft = assignCell(draft, main.id, { index: 0, edge: 'end' }, empty.id);
  draft = changeWeekCell(draft, draft.weeks[1].id, 'wed', 1, empty.id);
  const unusedDay = createDay(draft, 'Unused day'), unusedSlot = createSlot(draft.slots, 'Unused slot');
  draft.days.push(unusedDay); draft.slots.push(unusedSlot);
  return { draft, sequence: draft.sequences[0], main, eventDay, activity, empty, high, cold, low, unusedDay, unusedSlot };
}
