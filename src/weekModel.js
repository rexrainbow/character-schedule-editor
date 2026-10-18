import { clearEngineKey } from './engineKeyModel.js';
import { clone, compileDraft, nextSlotId } from './model.js';
import { WEEKDAYS } from './scheduleConstants.js';
import { normalizeSequenceRange } from './sequenceRange.js';
import { dayAssignment, setDayAssignment, dayEventsFromData, dayEventsToData } from './dayEvents.js';
import { countDayReferences, fitEventGroups } from './sequenceEvents.js';

export const isPrivateDay = (day) => day?.scope === 'week_private';
export const sharedDays = (draft) => draft.days.filter((day) => !isPrivateDay(day));

export function createWeek(draft, name) {
  return { id: nextSlotId(draft.weeks), name, icon: 'tabler:calendar-week', days: Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, null])) };
}

export function weekDay(draft, weekId, weekday) {
  const week = draft.weeks.find((item) => item.id === weekId);
  if (!week || !WEEKDAYS.includes(weekday)) throw new Error('Unknown week or weekday');
  return draft.days.find((day) => day.id === week.days[weekday]);
}

export function setWeekDay(draft, weekId, weekday, dayId) {
  const current = weekDay(draft, weekId, weekday);
  const target = draft.days.find((day) => day.id === dayId);
  if (dayId !== null && (!target || isPrivateDay(target))) throw new Error('Expected a shared day');
  if (current?.id === dayId) return draft;
  return { ...draft,
    days: isPrivateDay(current) ? draft.days.filter((day) => day.id !== current.id) : draft.days,
    weeks: draft.weeks.map((week) => week.id === weekId ? { ...week, days: { ...week.days, [weekday]: dayId } } : week) };
}

export function changeWeekCell(draft, weekId, weekday, index, slotId, editedSlot = null) {
  const current = weekDay(draft, weekId, weekday);
  const emptyDay = { slotIds: Array(draft.project.settings.slots_per_day).fill(null) };
  setDayAssignment(current ?? emptyDay, index, slotId); // Validate the main cell or event target.
  let slots = draft.slots;
  if (editedSlot) {
    if (editedSlot.id !== slotId || compileDraft([editedSlot], draft.operandNodes, draft.tasks, draft.taskMacros).errors.length) throw new Error('Invalid slot draft');
    slots = slots.some((slot) => slot.id === editedSlot.id)
      ? slots.map((slot) => slot.id === editedSlot.id ? clone(editedSlot) : slot) : [...slots, clone(editedSlot)];
  }
  if (slotId !== null && !slots.some((slot) => slot.id === slotId)) throw new Error('Unknown slot');
  const next = slots === draft.slots ? draft : { ...draft, slots };
  // Editing a global definition is separate from changing the day's references.
  if (dayAssignment(current ?? emptyDay, index) === slotId) return next;
  const day = isPrivateDay(current) ? { ...current, slotIds: [...current.slotIds] } : {
    id: nextSlotId(draft.days), name: `${weekday} custom`, scope: 'week_private', icon: current?.icon ?? 'tabler:calendar',
    owner: { week_schedule_id: weekId, weekday },
    slotIds: current ? [...current.slotIds] : Array(draft.project.settings.slots_per_day).fill(null),
    ...(current?.tags === undefined ? {} : { tags: [...current.tags] }),
    ...(current ? clone(dayEventsFromData(dayEventsToData(current))) : {}),
  };
  const changedDay = setDayAssignment(day, index, slotId);
  return { ...next,
    days: isPrivateDay(current) ? draft.days.map((item) => item.id === day.id ? changedDay : item) : [...draft.days, changedDay],
    weeks: draft.weeks.map((week) => week.id === weekId ? { ...week, days: { ...week.days, [weekday]: day.id } } : week) };
}

export function duplicateWeek(draft, source) {
  const copy = { ...clearEngineKey(source), id: nextSlotId(draft.weeks), name: `${source.name} (副本)` };
  const days = [...draft.days];
  for (const weekday of WEEKDAYS) {
    const day = draft.days.find((item) => item.id === source.days[weekday]);
    if (!isPrivateDay(day)) continue;
    const copied = { ...clone(clearEngineKey(day)), id: nextSlotId(days), owner: { week_schedule_id: copy.id, weekday } };
    days.push(copied); copy.days[weekday] = copied.id;
  }
  return { ...draft, days, weeks: [...draft.weeks, copy] };
}

export function deleteWeek(draft, weekId) {
  return { ...draft, weeks: draft.weeks.filter((week) => week.id !== weekId),
    sequences: (draft.sequences ?? []).map((sequence) => fitEventGroups(normalizeSequenceRange({ ...sequence, rows: sequence.rows.filter((row) => row.weekId !== weekId) }))),
    days: draft.days.filter((day) => !isPrivateDay(day) || day.owner.week_schedule_id !== weekId) };
}

export function dayReferenceCount(draft, dayId) {
  return draft.weeks.reduce((count, week) => count + WEEKDAYS.filter((weekday) => week.days[weekday] === dayId).length, 0);
}

export function deleteSharedDay(draft, dayId) {
  if (countDayReferences(draft, dayId).length) throw new Error('eventCountDayInUse');
  if (isPrivateDay(draft.days.find((day) => day.id === dayId))) throw new Error('Private days belong to weeks');
  return { ...draft, days: draft.days.filter((day) => day.id !== dayId),
    sequences: (draft.sequences ?? []).map((sequence) => ({ ...sequence, ...(sequence.eventGroups === undefined ? {} : { eventGroups: sequence.eventGroups.filter((group) => group.dayId !== dayId) }), rows: sequence.rows.map((row) => ({ ...row,
      overrides: Object.fromEntries(Object.entries(row.overrides).filter(([, id]) => id !== dayId)) })) })),
    weeks: draft.weeks.map((week) => ({ ...week, days: Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, week.days[weekday] === dayId ? null : week.days[weekday]])) })) };
}
