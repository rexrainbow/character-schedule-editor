import { eventFirstDayId, eventDaySourceErrors, eventDaySourceToData, eventDaySourceFromData } from './eventDaySource.js';
import { EVENT_EXECUTION_MODES, eventExecutionMode } from './slotRelease.js';
import { eventKind } from './eventReferences.js';
import { WEEKDAYS } from './scheduleConstants.js';
import { sequenceRange } from './sequenceRange.js';

export const datePosition = (date) => (date?.week - 1) * 7 + WEEKDAYS.indexOf(date?.weekday);
export const positionDate = (position) => ({ week: Math.floor(position / 7) + 1, weekday: WEEKDAYS[((position % 7) + 7) % 7] });
export function newEventGroup(sequence, position = sequenceRange(sequence).start) {
  const date = positionDate(position);
  let symbol = 'event', index = 2; while ((sequence.eventGroups ?? []).some((item) => item.symbol === symbol)) symbol = `event_${index++}`;
  return { id: crypto.randomUUID(), display_name: '', symbol, _autoSymbol: true, dayId: '', start: date, end: { ...date }, interval: 0, priority: 0, executionMode: 'overlay', kind: 'once', icon: 'tabler:calendar-event', countFilter: { kind: 'all' } };
}
export function changeEventStart(group, date) {
  const duration = datePosition(group.end) - datePosition(group.start), position = datePosition(date);
  return { ...group, start: { ...date }, end: eventKind(group) === 'once' ? { ...date } : positionDate(position + duration) };
}
export function eventGroupErrors(sequence, days, groups = sequence.eventGroups ?? []) {
  if (!Array.isArray(groups)) return [{ path: '/event_groups', key: 'invalidEventGroups' }];
  const ids = new Set(), errors = [], max = sequence.rows.length * 7;
  groups.forEach((group, i) => {
    const path = `/event_groups/${i}`;
    if (!group || typeof group !== 'object') { errors.push({ path, key: 'invalidEventGroups' }); return; }
    if (ids.has(group.id)) errors.push({ path: `${path}/id`, key: 'duplicateId' }); ids.add(group.id);
    errors.push(...eventDaySourceErrors(group, days, path));
    for (const key of ['start', 'end']) if (!Number.isSafeInteger(group[key]?.week) || group[key].week < 1 || !WEEKDAYS.includes(group[key]?.weekday) || datePosition(group[key]) >= max) errors.push({ path: `${path}/${key}`, key: 'eventDateRange' });
    if (eventKind(group) === 'periodic' && (!Number.isSafeInteger(group.interval) || group.interval < 1)) errors.push({ path: `${path}/interval_days`, key: 'eventIntervalError' });
    if (!['once', 'periodic', 'probability'].includes(eventKind(group))) errors.push({ path: `${path}/kind`, key: 'invalidEventKind' });
    if (eventKind(group) === 'probability') {
      if (!Number.isFinite(group.probability_percent) || group.probability_percent < 0 || group.probability_percent > 100) errors.push({ path: `${path}/probability_percent`, key: 'invalidEventProbability' });
      if (!Number.isSafeInteger(group.cooldown_days) || group.cooldown_days < 0) errors.push({ path: `${path}/cooldown_days`, key: 'invalidEventCooldown' });
    }
    const filter = group.countFilter ?? { kind: 'all' };
    if (!filter || !['all', 'day', 'tag'].includes(filter.kind)) errors.push({ path: `${path}/count_filter`, key: 'eventCountFilterInvalid' });
    else if (eventKind(group) !== 'once' && filter.kind === 'day' && !days.some((day) => day.id === filter.day_schedule_id && (!day.scope || day.scope === 'shared'))) errors.push({ path: `${path}/count_filter/day_schedule_id`, key: 'eventCountDayRequired' });
    else if (eventKind(group) !== 'once' && filter.kind === 'tag' && (typeof filter.tag !== 'string' || !filter.tag.trim() || filter.tag !== filter.tag.trim())) errors.push({ path: `${path}/count_filter/tag`, key: 'eventCountTagRequired' });
    if (!EVENT_EXECUTION_MODES.includes(eventExecutionMode(group))) errors.push({ path: `${path}/execution_mode`, key: 'invalidExecutionMode' });
    if (eventExecutionMode(group) !== 'overlay' && group.priority < 0) errors.push({ path: `${path}/priority`, key: 'interruptPriorityError' });
    if (!Number.isSafeInteger(group.priority)) errors.push({ path: `${path}/priority`, key: 'eventPriorityError' });
    if (datePosition(group.end) < datePosition(group.start) || eventKind(group) === 'once' && datePosition(group.start) !== datePosition(group.end)) errors.push({ path: `${path}/end`, key: 'eventEndError' });
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
  if (position < start || position > end) return false;
  if (eventKind(group) === 'once') return position === start;
  if (eventKind(group) === 'probability') return eligibility(sequence, draft, group.countFilter ?? { kind: 'all' }).matches(position);
  if (!Number.isSafeInteger(group.interval) || group.interval < 1) return false;
  const index = eligibility(sequence, draft, group.countFilter ?? { kind: 'all' });
  const rank = index.count(start, position) - 1;
  return index.matches(position) && rank >= 0 && rank % group.interval === 0;
}
export function eventsOnDate(sequence, position, draft) {
  return (sequence.eventGroups ?? []).map((group, index) => ({ group, index })).filter(({ group }) => eventOccurs(group, position, sequence, draft)).sort((a, b) => b.group.priority - a.group.priority || a.index - b.index).map(({ group }) => group);
}
export function eventCounts(sequence, group, draft) {
  const start = datePosition(group.start), end = datePosition(group.end), range = sequenceRange(sequence);
  if (!Number.isFinite(start) || !Number.isFinite(end) || eventKind(group) === 'periodic' && (!Number.isSafeInteger(group.interval) || group.interval < 1) || end < start) return { total: 0, active: 0 };
  if (eventKind(group) === 'once') return { total: 1, active: sequence.rows.length && start >= range.start && start <= range.end ? 1 : 0 };
  const index = eligibility(sequence, draft, group.countFilter ?? { kind: 'all' });
  const count = index.count(start, end);
  if (eventKind(group) === 'probability') return { total: count, active: index.count(Math.max(start, range.start), Math.min(end, range.end)) };
  const first = Math.ceil(index.count(start, Math.max(start, range.start) - 1) / group.interval);
  const last = Math.floor((index.count(start, Math.min(range.end, end)) - 1) / group.interval);
  return { total: count ? Math.floor((count - 1) / group.interval) + 1 : 0, active: sequence.rows.length ? Math.max(0, last - first + 1) : 0 };
}
export function countDayReferences(draft, dayId) {
  return (draft.sequences ?? []).flatMap((sequence) => (sequence.eventGroups ?? []).filter((group) => eventKind(group) !== 'once' && group.countFilter?.kind === 'day' && group.countFilter.day_schedule_id === dayId).map((group) => ({ sequence, group })));
}
export function fitEventGroups(sequence) {
  if (sequence.eventGroups === undefined) return sequence;
  const max = sequence.rows.length * 7;
  return { ...sequence, eventGroups: sequence.eventGroups.filter((group) => datePosition(group.start) < max && datePosition(group.end) < max) };
}
export const eventGroupName = (group, days) => (typeof group.display_name === 'string' ? group.display_name.trim() : '') || group.symbol || '';
export function duplicateEventGroup(group, days, rename = true) {
  const copy = { ...structuredClone(group), id: crypto.randomUUID(), display_name: eventGroupName(group, days) + (rename ? ' (副本)' : '') }; copy.symbol = `${group.symbol ?? 'event'}_copy`; copy._autoSymbol = true; return copy;
}
export const eventGroupsToData = (groups, days = [], runtime = false) => groups.map((group) => ({
  execution_mode: eventExecutionMode(group),
  ...(!runtime && group.description !== undefined ? { description: group.description } : {}),
  id: group.id, kind: eventKind(group), display_name: eventGroupName(group, days), ...(group._fallbackValue === undefined ? {} : { _fallbackValue: group._fallbackValue }),
  ...(!runtime ? { icon: group.icon ?? days.find((day) => day.id === eventFirstDayId(group))?.icon ?? 'tabler:calendar-event' } : {}),
  ...(typeof group.symbol === 'string' && (!runtime || group.symbol.trim()) ? { symbol: runtime ? group.symbol.trim() : group.symbol } : {}),
  ...eventDaySourceToData(group), start: { week_number: group.start.week, weekday: group.start.weekday }, priority: group.priority,
  ...(eventKind(group) === 'once' ? {} : { end: { week_number: group.end.week, weekday: group.end.weekday }, count_filter: structuredClone(group.countFilter ?? { kind: 'all' }),
    ...(eventKind(group) === 'probability' ? { probability_percent: group.probability_percent, cooldown_days: group.cooldown_days } : { interval_days: group.interval }) }),
}));
export const eventGroupsFromData = (groups) => groups.map((group) => ({
  executionMode: group?.execution_mode ?? 'overlay',
  ...(group?.description === undefined ? {} : { description: group.description }),
  id: group?.id, kind: group?.kind ?? (group?.interval_days === 0 ? 'once' : 'periodic'), icon: group?.icon ?? 'tabler:calendar-event',
  ...(group?.display_name === undefined ? {} : { display_name: group.display_name }), ...(group?.symbol === undefined ? {} : { symbol: group.symbol }),
  ...eventDaySourceFromData(group), start: { week: group?.start?.week_number, weekday: group?.start?.weekday },
  end: { week: (group?.end ?? group?.start)?.week_number, weekday: (group?.end ?? group?.start)?.weekday }, interval: group?.kind === 'once' ? 0 : group?.interval_days ?? 1,
  countFilter: structuredClone(group?.count_filter ?? { kind: 'all' }), priority: group?.priority,
  ...(group?.kind === 'probability' ? { probability_percent: group.probability_percent, cooldown_days: group.cooldown_days } : {}),
}));
export const eventDateLabel = (date, t) => `${t('weekNumber', { count: date.week })} / ${t(date.weekday)}`;
export const eventIntervalText = (group, t, days = []) => eventKind(group) === 'once' ? t('eventOnce') : eventKind(group) === 'probability' ? t('eventProbabilitySummary', { probability: group.probability_percent, cooldown: group.cooldown_days }) : eventKind(group) !== 'once' && group.countFilter?.kind === 'day' ? t('eventEveryDaySource', { count: group.interval, name: days.find((day) => day.id === group.countFilter.day_schedule_id)?.name || t('unassigned') }) : group.countFilter?.kind === 'tag' ? t('eventEveryTag', { count: group.interval, tag: group.countFilter.tag }) : t('eventEvery', { count: group.interval });
export const eventSummary = (group, t, days = []) => `${t('eventInterval')}: ${eventIntervalText(group, t, days)}\n${eventDateLabel(group.start, t)} – ${eventDateLabel(group.end, t)}\n${t('eventPriority')}: ${group.priority}`;
export const eventTooltip = (group, days, t) => `${eventGroupName(group, days)}\n${eventSummary(group, t, days)}`;
