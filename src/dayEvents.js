export function dayAssignment(day, target) {
  if (typeof target === 'number') return day.slotIds[target] ?? null;
  if (target === 'dayStart' || target === 'dayEnd') return day[`${target}Id`] ?? null;
  return day.slotEvents?.[target.index]?.[`${target.edge}Id`] ?? null;
}
export function assignmentLabel(target, t) {
  return typeof target === 'number' ? t('cell', { count: target + 1 }) : typeof target === 'string' ? t(target + 'Event') : t(target.edge === 'start' ? 'slotStartEvent' : 'slotEndEvent', { count: target.index + 1 });
}
export function setDayAssignment(day, target, slotId) {
  if (target === 'dayStart' || target === 'dayEnd') return { ...day, [`${target}Id`]: slotId };
  const index = typeof target === 'number' ? target : target?.index;
  if (!Number.isInteger(index) || index < 0 || index >= day.slotIds.length) throw new Error('Unknown cell');
  if (typeof target === 'number') return { ...day, slotIds: day.slotIds.map((id, i) => i === index ? slotId : id) };
  if (!['start', 'end'].includes(target.edge)) throw new Error('Unknown event');
  const slotEvents = day.slotIds.map((_, i) => ({ startId: day.slotEvents?.[i]?.startId ?? null, endId: day.slotEvents?.[i]?.endId ?? null }));
  slotEvents[index][`${target.edge}Id`] = slotId;
  return { ...day, slotEvents };
}
export function dayAssignments(day) {
  const entries = [{ target: 'dayStart', id: day.dayStartId ?? null, path: '/day_start_slot_id' }];
  day.slotIds.forEach((id, index) => entries.push(
    { target: { index, edge: 'start' }, id: day.slotEvents?.[index]?.startId ?? null, path: `/slot_events/${index}/start_slot_id` },
    { target: index, id, path: `/slot_ids/${index}` },
    { target: { index, edge: 'end' }, id: day.slotEvents?.[index]?.endId ?? null, path: `/slot_events/${index}/end_slot_id` }));
  entries.push({ target: 'dayEnd', id: day.dayEndId ?? null, path: '/day_end_slot_id' });
  return entries;
}
export const dayEventCount = (day) => dayAssignments(day).filter((entry) => typeof entry.target !== 'number' && entry.id !== null).length;
export function dayEventsToData(day) {
  return { ...(day.dayStartId === undefined ? {} : { day_start_slot_id: day.dayStartId }), ...(day.dayEndId === undefined ? {} : { day_end_slot_id: day.dayEndId }),
    ...(day.slotEvents === undefined ? {} : { slot_events: day.slotEvents.map((entry) => ({ start_slot_id: entry.startId, end_slot_id: entry.endId })) }) };
}
export function dayEventsFromData(day) {
  return { ...(day.day_start_slot_id === undefined ? {} : { dayStartId: day.day_start_slot_id }), ...(day.day_end_slot_id === undefined ? {} : { dayEndId: day.day_end_slot_id }),
    ...(day.slot_events === undefined ? {} : { slotEvents: day.slot_events.map((entry) => ({ startId: entry.start_slot_id, endId: entry.end_slot_id })) }) };
}
