import { WEEKDAYS } from './scheduleConstants.js';
import { eventDaySourceFromData, eventDaySourceErrors, eventDayIds, eventDayCandidates } from './eventDaySource.js';

export const createScheduleEvent = () => ({ builtin: 'schedule_event', display_name: '', icon: 'tabler:calendar-event', date: { mode: 'days', offset: { type: 'constant', value: 1 } }, day_schedule_id: '', execution_mode: 'overlay', priority: 0 });
export function scheduleTaskErrors(use, nodes, path, scope, validateOperand) {
  const errors = validateOperand(use.date?.offset, nodes, `${path}/date/offset`, true, scope);
  if (!['days', 'weeks_weekday'].includes(use.date?.mode)) errors.push({ path: `${path}/date/mode`, key: 'scheduleDateModeError' });
  if (use.date?.mode === 'weeks_weekday' && !WEEKDAYS.includes(use.date.weekday)) errors.push({ path: `${path}/date/weekday`, key: 'scheduleWeekdayError' });
  if (use.date?.offset?.type === 'constant' && (!Number.isSafeInteger(use.date.offset.value) || use.date.offset.value < (use.date.mode === 'days' ? 1 : 0))) errors.push({ path: `${path}/date/offset`, key: 'scheduleOffsetError' });
  if (!['overlay', 'interrupt_main', 'interrupt_lower'].includes(use.execution_mode)) errors.push({ path: `${path}/execution_mode`, key: 'invalidExecutionMode' });
  if (!Number.isSafeInteger(use.priority)) errors.push({ path: `${path}/priority`, key: 'eventPriorityError' });
  if (use.execution_mode !== 'overlay' && use.priority < 0) errors.push({ path: `${path}/priority`, key: 'interruptPriorityError' });
  if (use.day_source && use.day_source.mode !== 'random') errors.push({ path: `${path}/day_source/mode`, key: 'invalidEventDaySource' });
  return errors;
}
export function scheduleEventUses(draft) {
  const result = [];
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    if (value.builtin === 'schedule_event') { result.push({ task: value, path }); return; }
    for (const [key, item] of Object.entries(value)) walk(item, `${path}/${key}`);
  }
  for (const slot of draft.slots ?? []) walk(slot, `/slots/${slot.id}`);
  for (const macro of draft.taskMacros ?? []) walk(macro, `/task_macros/${macro.id}`);
  return result;
}
export const scheduledDayReferences = (draft, id) => scheduleEventUses(draft).filter(({ task }) => eventDayIds(eventDaySourceFromData(task)).includes(id));
export const scheduledEventErrors = (draft) => scheduleEventUses(draft).flatMap(({ task, path }) => eventDaySourceErrors(eventDaySourceFromData(task), draft.days, path));
export function scheduledPosition(date, offset, current) {
  if (!Number.isSafeInteger(offset) || offset < (date.mode === 'days' ? 1 : 0)) return { error: 'scheduleOffsetError' };
  const position = date.mode === 'days' ? current + offset : (Math.floor(current / 7) + offset) * 7 + WEEKDAYS.indexOf(date.weekday);
  return !Number.isSafeInteger(position) || position <= current ? { error: 'scheduleFutureRequired' } : { position };
}
export function reservationSourceText(value, days, t) {
  const source = eventDaySourceFromData(value), candidates = eventDayCandidates(source);
  const max = candidates.reduce((n, item) => Math.max(n, item.weight || 0), 1), sum = candidates.reduce((n, item) => n + (item.weight || 0) / max, 0);
  return candidates.map((item) => `${days.find((day) => day.id === item.dayId)?.name || t('unassigned')}${source.sourceMode === 'random' ? ` ${(item.weight / max / sum * 100).toFixed(1)}%` : ''}`).join(', ');
}
