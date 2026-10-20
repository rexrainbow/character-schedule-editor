export const EVENT_DAY_SOURCE_MODES = ['fixed', 'random', 'sequential'];
export const eventDaySourceMode = (group) => group?.sourceMode ?? 'fixed';
export const eventDayCandidates = (group) => eventDaySourceMode(group) === 'fixed' ? [{ dayId: group.dayId }] : group.dayCandidates ?? [];
export const eventDayIds = (group) => (Array.isArray(eventDayCandidates(group)) ? eventDayCandidates(group) : []).map((item) => item?.dayId);
export const eventFirstDayId = (group) => eventDayIds(group)[0];
export function eventDaySourceErrors(group, days, path) {
  const errors = [], mode = eventDaySourceMode(group), candidates = eventDayCandidates(group);
  if (!EVENT_DAY_SOURCE_MODES.includes(mode)) errors.push({ path: `${path}/day_source/mode`, key: 'invalidEventDaySource' });
  if (!Array.isArray(candidates) || !candidates.length) return [...errors, { path: `${path}/day_source/candidates`, key: 'eventCandidatesRequired' }];
  const seen = new Set();
  candidates.forEach((item, i) => {
    const location = mode === 'fixed' ? `${path}/day_schedule_id` : `${path}/day_source/candidates/${i}`;
    if (!days.some((day) => day.id === item?.dayId && (!day.scope || day.scope === 'shared'))) errors.push({ path: mode === 'fixed' ? location : `${location}/day_schedule_id`, key: 'eventSharedDayRequired' });
    if (seen.has(item?.dayId)) errors.push({ path: location, key: 'duplicateId' }); seen.add(item?.dayId);
    if (mode === 'random' && (!Number.isFinite(item?.weight) || item.weight <= 0)) errors.push({ path: `${location}/weight`, key: 'eventWeightError' });
  });
  return errors;
}
export function eventDaySourceToData(group) {
  const mode = eventDaySourceMode(group);
  const candidates = eventDayCandidates(group);
  return mode === 'fixed' ? { day_schedule_id: group.dayId } : { day_source: { mode, candidates: Array.isArray(candidates) ? candidates.map((item) => ({ day_schedule_id: item?.dayId, ...(mode === 'random' ? { weight: item?.weight } : {}) })) : [] } };
}
export function eventDaySourceFromData(group) {
  return group?.day_source ? { sourceMode: group.day_source.mode, dayCandidates: Array.isArray(group.day_source.candidates) ? group.day_source.candidates.map((item) => ({ dayId: item?.day_schedule_id, ...(item?.weight === undefined ? {} : { weight: item.weight }) })) : [] } : { dayId: group?.day_schedule_id };
}
