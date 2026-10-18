import { WEEKDAYS } from './scheduleConstants.js';
import { sequenceRange } from './sequenceRange.js';

export const datePosition = (date) => (date?.week - 1) * 7 + WEEKDAYS.indexOf(date?.weekday);
export const positionDate = (position) => ({ week: Math.floor(position / 7) + 1, weekday: WEEKDAYS[((position % 7) + 7) % 7] });
export function newEventGroup(sequence, position = sequenceRange(sequence).start) {
  const date = positionDate(position);
  return { id: crypto.randomUUID(), display_name: '', engine_key: '', dayId: '', start: date, end: { ...date }, interval: 0, priority: 0, countFilter: { kind: 'all' } };
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
    const filter = group.countFilter ?? { kind: 'all' };
    if (!filter || !['all', 'day', 'tag'].includes(filter.kind)) errors.push({ path: `${path}/count_filter`, key: 'eventCountFilterInvalid' });
    else if (filter.kind === 'day' && !days.some((day) => day.id === filter.day_schedule_id && (!day.scope || day.scope === 'shared'))) errors.push({ path: `${path}/count_filter/day_schedule_id`, key: 'eventCountDayRequired' });
    else if (filter.kind === 'tag' && (typeof filter.tag !== 'string' || !filter.tag.trim() || filter.tag !== filter.tag.trim())) errors.push({ path: `${path}/count_filter/tag`, key: 'eventCountTagRequired' });
    if (!Number.isSafeInteger(group.priority)) errors.push({ path: `${path}/priority`, key: 'eventPriorityError' });
    if (datePosition(group.end) < datePosition(group.start) || group.interval === 0 && datePosition(group.start) !== datePosition(group.end)) errors.push({ path: `${path}/end`, key: 'eventEndError' });
  });
  return errors;
}
const countCache = new WeakMap();
// Prefix counts are shared by groups with the same filter; all-date rules stay O(1).
function eligibility(sequence, draft, filter) {
  if (filter.kind === 'all') return { matches: () => true, count: (start, end) => Math.max(0, end - start + 1) };
  if (!draft || !sequence) return { matches: () => false, count: () => 0 };
  let cached = countCache.get(sequence);
  if (!cached || cached.days !== draft.days || cached.weeks !== draft.weeks) {
    cached = { days: draft.days, weeks: draft.weeks, filters: new Map() }; countCache.set(sequence, cached);
  }
  const key = JSON.stringify(filter);
  if (!cached.filters.has(key)) {
    const days = new Map(draft.days.map((day) => [day.id, day])), weeks = new Map(draft.weeks.map((week) => [week.id, week]));
    const prefix = [0];
    for (const row of sequence.rows) for (const weekday of WEEKDAYS) {
      const id = Object.hasOwn(row.overrides ?? {}, weekday) ? row.overrides[weekday] : weeks.get(row.weekId)?.days[weekday];
      const day = days.get(id), match = !!day && (filter.kind === 'day' ? id === filter.day_schedule_id : (day.tags ?? []).includes(filter.tag));
      prefix.push(prefix.at(-1) + Number(match));
    }
    const at = (position) => prefix[Math.max(0, Math.min(prefix.length - 1, position))];
    cached.filters.set(key, { matches: (position) => at(position + 1) > at(position), count: (start, end) => end < start ? 0 : at(end + 1) - at(start) });
  }
  return cached.filters.get(key);
}
export function eventOccurs(group, position, sequence, draft) {
  const start = datePosition(group.start), end = datePosition(group.end);
  if (position < start || position > end || !Number.isSafeInteger(group.interval) || group.interval < 0) return false;
  if (group.interval === 0) return position === start;
  const index = eligibility(sequence, draft, group.countFilter ?? { kind: 'all' });
  const rank = index.count(start, position) - 1;
  return index.matches(position) && rank >= 0 && rank % group.interval === 0;
}
export function eventsOnDate(sequence, position, draft) {
  return (sequence.eventGroups ?? []).map((group, index) => ({ group, index })).filter(({ group }) => eventOccurs(group, position, sequence, draft)).sort((a, b) => b.group.priority - a.group.priority || a.index - b.index).map(({ group }) => group);
}
export function eventCounts(sequence, group, draft) {
  const start = datePosition(group.start), end = datePosition(group.end), range = sequenceRange(sequence);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isSafeInteger(group.interval) || group.interval < 0 || end < start) return { total: 0, active: 0 };
  if (!group.interval) return { total: 1, active: sequence.rows.length && start >= range.start && start <= range.end ? 1 : 0 };
  const index = eligibility(sequence, draft, group.countFilter ?? { kind: 'all' });
  const count = index.count(start, end);
  const first = Math.ceil(index.count(start, Math.max(start, range.start) - 1) / group.interval);
  const last = Math.floor((index.count(start, Math.min(range.end, end)) - 1) / group.interval);
  return { total: count ? Math.floor((count - 1) / group.interval) + 1 : 0, active: sequence.rows.length ? Math.max(0, last - first + 1) : 0 };
}
export function countDayReferences(draft, dayId) {
  return (draft.sequences ?? []).flatMap((sequence) => (sequence.eventGroups ?? []).filter((group) => group.countFilter?.kind === 'day' && group.countFilter.day_schedule_id === dayId).map((group) => ({ sequence, group })));
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
export const eventGroupsToData = (groups, days = [], runtime = false) => groups.map((group) => ({ id: group.id, display_name: eventGroupName(group, days), ...(typeof group.engine_key === 'string' && (!runtime || group.engine_key.trim()) ? { engine_key: runtime ? group.engine_key.trim() : group.engine_key } : {}), day_schedule_id: group.dayId, start: { week_number: group.start.week, weekday: group.start.weekday }, end: { week_number: group.end.week, weekday: group.end.weekday }, interval_days: group.interval, count_filter: structuredClone(group.countFilter ?? { kind: 'all' }), priority: group.priority }));
export const eventGroupsFromData = (groups) => groups.map((group) => ({ id: group?.id, ...(group?.display_name === undefined ? {} : { display_name: group.display_name }), ...(group?.engine_key === undefined ? {} : { engine_key: group.engine_key }), dayId: group?.day_schedule_id, start: { week: group?.start?.week_number, weekday: group?.start?.weekday }, end: { week: group?.end?.week_number, weekday: group?.end?.weekday }, interval: group?.interval_days, countFilter: structuredClone(group?.count_filter ?? { kind: 'all' }), priority: group?.priority }));
export const eventDateLabel = (date, t) => `${t('weekNumber', { count: date.week })} / ${t(date.weekday)}`;
export const eventIntervalText = (group, t, days = []) => group.interval === 0 ? t('eventOnce') : group.countFilter?.kind === 'day' ? t('eventEveryDaySource', { count: group.interval, name: days.find((day) => day.id === group.countFilter.day_schedule_id)?.name || t('unassigned') }) : group.countFilter?.kind === 'tag' ? t('eventEveryTag', { count: group.interval, tag: group.countFilter.tag }) : t('eventEvery', { count: group.interval });
export const eventSummary = (group, t, days = []) => `${t('eventInterval')}: ${eventIntervalText(group, t, days)}\n${eventDateLabel(group.start, t)} – ${eventDateLabel(group.end, t)}\n${t('eventPriority')}: ${group.priority}`;
export const eventTooltip = (group, days, t) => `${eventGroupName(group, days)}\n${eventSummary(group, t, days)}`;
