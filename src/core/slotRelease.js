import { conditionErrors, referencesIn, slotEntries, macroEntries } from './operandModel.js';

export const EVENT_EXECUTION_MODES = ['overlay', 'interrupt_main', 'interrupt_lower'];
export const eventExecutionMode = (group) => group.executionMode ?? 'overlay';
export const isInterrupt = (group) => eventExecutionMode(group) !== 'overlay';
export function slotReleaseErrors(draft) {
  const errors = [...(draft.slots ?? []).flatMap(slotEntries), ...(draft.taskMacros ?? []).flatMap(macroEntries)]
    .filter(({ entry }) => ['release_slot', 'schedule_takeover'].includes(entry.task?.builtin)).map(({ path }) => ({ path: `${path}/task`, key: 'slotReleaseOnly' }));
  for (const day of draft.days ?? []) {
    if (day.slotReleases === undefined) continue;
    const path = `/day_schedules/${day.id}/slot_releases`;
    if (!Array.isArray(day.slotReleases) || day.slotReleases.length !== day.slotIds.length) { errors.push({ path, key: 'cellCountMismatch' }); continue; }
    day.slotReleases.forEach((value, index) => {
      if (value === null) return;
      if (value?.builtin !== 'release_slot') errors.push({ path: `${path}/${index}`, key: 'slotReleaseOnly' });
      else if (value.condition != null) errors.push(...conditionErrors(value.condition, draft.operandNodes, `${path}/${index}/condition`));
    });
  }
  return errors;
}
export function slotReleaseReferences(draft, ids) {
  const wanted = ids instanceof Set ? ids : new Set([ids]);
  return (draft.days ?? []).flatMap((day) => (day.slotReleases ?? []).flatMap((value, index) => referencesIn(value?.condition, `/day_schedules/${day.id}/slot_releases/${index}/condition`)
    .filter((ref) => wanted.has(ref.nodeId)).map((ref) => ({ ...ref, dayId: day.id, dayName: day.name, slotIndex: index }))));
}
