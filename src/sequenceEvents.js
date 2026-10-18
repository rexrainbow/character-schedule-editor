import { WEEKDAYS } from './scheduleConstants.js';
import { sequenceRange } from './sequenceRange.js';

export const datePosition = (date) => (date?.week - 1) * 7 + WEEKDAYS.indexOf(date?.weekday);
export const positionDate = (position) => ({ week: Math.floor(position / 7) + 1, weekday: WEEKDAYS[((position % 7) + 7) % 7] });
export function newEventGroup(sequence, position = sequenceRange(sequence).start) {
  const date = positionDate(position);
  return { id: crypto.randomUUID(), display_name: '', engine_key: '', dayId: '', start: date, end: { ...date }, interval: 0, priority: 0, skipWeekdays: [] };
}
export function changeEventStart(group, date) {
  const duration = datePosition(group.end) - datePosition(group.start), position = datePosition(date);
  return { ...group, start: { ...date }, end: group.interval === 0 ? { ...date } : positionDate(position + duration) };
}
export function eventGroupErrors(sequence, days, groups = sequence.eventGroups ?? []) {
  if (!Array.isArray(groups)) return [{ path: '/event_groups', key: 'invalidEventGroups' }];
  const ids = new Set(), errors = [], max = sequence.rows.length * 7;
  groups.forEach((group, i) => {
    const path = `/event_groups/${i}`;
    if (!group || typeof group !== 'object') { errors.push({ path, key: 'invalidEventGroups' }); return; }
    if (ids.has(group.id)) errors.push({ path: `${path}/id`, key: 'duplicateId' }); ids.add(group.id);
    if (!days.some((day) => day.id === group.dayId && (!day.scope || day.scope === 'shared'))) errors.push({ path: `${path}/day_schedule_id`, key: 'eventSharedDayRequired' });
    for (const key of ['start', 'end']) if (!Number.isSafeInteger(group[key]?.week) || group[key].week < 1 || !WEEKDAYS.includes(group[key]?.weekday) || datePosition(group[key]) >= max) errors.push({ path: `${path}/${key}`, key: 'eventDateRange' });
    if (!Number.isSafeInteger(group.interval) || group.interval < 0) errors.push({ path: `${path}/interval_days`, key: 'eventIntervalError' });
    const skip = group.skipWeekdays ?? [];
    if (!Array.isArray(skip) || skip.some((day) => !WEEKDAYS.includes(day)) || new Set(skip).size !== skip.length) errors.push({ path: `${path}/skip_weekdays`, key: 'eventSkipInvalid' });
    else if (group.interval > 0 && skip.length === 7) errors.push({ path: `${path}/skip_weekdays`, key: 'eventSkipAll' });
    if (!Number.isSafeInteger(group.priority)) errors.push({ path: `${path}/priority`, key: 'eventPriorityError' });
    if (datePosition(group.end) < datePosition(group.start) || group.interval === 0 && datePosition(group.start) !== datePosition(group.end)) errors.push({ path: `${path}/end`, key: 'eventEndError' });
  });
  return errors;
}
export function eventOccurs(group, position) {
  const start = datePosition(group.start), end = datePosition(group.end);
  if (position < start || position > end) return false;
  if (group.interval === 0) return position === start;
  const skip = Array.isArray(group.skipWeekdays) ? group.skipWeekdays : [];
  if (skip.includes(WEEKDAYS[position % 7])) return false;
  const rank = eligibleDays(start, position, skip) - 1;
  return rank >= 0 && rank % group.interval === 0;
}
// Count full weeks plus at most six trailing days, without expanding the timeline.
function eligibleDays(start, end, skip) {
  const length = Math.max(0, end - start + 1);
  let count = Math.floor(length / 7) * (7 - new Set(skip).size);
  for (let i = 0; i < length % 7; i++) if (!skip.includes(WEEKDAYS[(start + i) % 7])) count++;
  return count;
}
export function eventsOnDate(sequence, position) {
  return (sequence.eventGroups ?? []).map((group, index) => ({ group, index })).filter(({ group }) => eventOccurs(group, position)).sort((a, b) => b.group.priority - a.group.priority || a.index - b.index).map(({ group }) => group);
}
export function eventCounts(sequence, group) {
  const start = datePosition(group.start), end = datePosition(group.end), range = sequenceRange(sequence);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isSafeInteger(group.interval) || group.interval < 0 || end < start) return { total: 0, active: 0 };
  if (!group.interval) return { total: 1, active: sequence.rows.length && start >= range.start && start <= range.end ? 1 : 0 };
  const skip = Array.isArray(group.skipWeekdays) ? group.skipWeekdays : [];
  const count = eligibleDays(start, end, skip);
  const first = Math.ceil(eligibleDays(start, Math.max(start, range.start) - 1, skip) / group.interval);
  const last = Math.floor((eligibleDays(start, Math.min(range.end, end), skip) - 1) / group.interval);
  return { total: count ? Math.floor((count - 1) / group.interval) + 1 : 0, active: sequence.rows.length ? Math.max(0, last - first + 1) : 0 };
}
export function fitEventGroups(sequence) {
  if (sequence.eventGroups === undefined) return sequence;
  const max = sequence.rows.length * 7;
  return { ...sequence, eventGroups: sequence.eventGroups.filter((group) => datePosition(group.start) < max && datePosition(group.end) < max) };
}
export const eventGroupName = (group, days) => (typeof group.display_name === 'string' ? group.display_name.trim() : '') || days.find((day) => day.id === group.dayId)?.name || '';
export function duplicateEventGroup(group, days, rename = true) {
  const copy = { ...structuredClone(group), id: crypto.randomUUID(), display_name: eventGroupName(group, days) + (rename ? ' (副本)' : '') }; delete copy.engine_key; return copy;
}
export const eventGroupsToData = (groups, days = [], runtime = false) => groups.map((group) => ({ id: group.id, display_name: eventGroupName(group, days), ...(typeof group.engine_key === 'string' && (!runtime || group.engine_key.trim()) ? { engine_key: runtime ? group.engine_key.trim() : group.engine_key } : {}), day_schedule_id: group.dayId, start: { week_number: group.start.week, weekday: group.start.weekday }, end: { week_number: group.end.week, weekday: group.end.weekday }, interval_days: group.interval, skip_weekdays: [...(group.skipWeekdays ?? [])], priority: group.priority }));
export const eventGroupsFromData = (groups) => groups.map((group) => ({ id: group?.id, ...(group?.display_name === undefined ? {} : { display_name: group.display_name }), ...(group?.engine_key === undefined ? {} : { engine_key: group.engine_key }), dayId: group?.day_schedule_id, start: { week: group?.start?.week_number, weekday: group?.start?.weekday }, end: { week: group?.end?.week_number, weekday: group?.end?.weekday }, interval: group?.interval_days, skipWeekdays: group?.skip_weekdays ?? [], priority: group?.priority }));
export const eventDateLabel = (date, t) => `${t('weekNumber', { count: date.week })} / ${t(date.weekday)}`;
export const eventIntervalText = (group, t) => group.interval === 0 ? t('eventOnce') : group.skipWeekdays?.length ? t('eventEveryEligible', { count: group.interval, days: group.skipWeekdays.map((day) => t(day)).join(', ') }) : t('eventEvery', { count: group.interval });
export const eventSummary = (group, t) => `${t('eventInterval')}: ${eventIntervalText(group, t)}\n${eventDateLabel(group.start, t)} – ${eventDateLabel(group.end, t)}\n${t('eventPriority')}: ${group.priority}`;
export const eventTooltip = (group, days, t) => `${eventGroupName(group, days)}\n${eventSummary(group, t)}`;
