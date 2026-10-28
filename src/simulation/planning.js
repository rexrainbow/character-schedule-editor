import { firstExecutionPosition, resolveExecutionDate, sequenceExecutionRange, sequenceRepeatErrors } from '../core/sequenceExecution.js';
import { eventDayCandidates, eventDaySourceMode } from '../core/eventDaySource.js';
import { slotReleaseErrors, eventExecutionMode } from '../core/slotRelease.js';
import { eventsOnDate, eventGroupErrors, eventGroupName } from '../core/sequenceEvents.js';
import { sequenceRange } from '../core/sequenceRange.js';
import { resolveSequenceDay } from '../core/sequenceModel.js';
import { dayAssignment } from '../core/dayEvents.js';
import { isComputed, nodeScope } from '../core/operandModel.js';
import { WEEKDAYS } from '../core/scheduleConstants.js';
import { translator } from '../i18n/index.js';
import { eventKind } from '../core/eventReferences.js';

export const PROGRESS_ROLES = ['current_week', 'current_weekday', 'current_day', 'current_slot', 'slots_per_day', 'total_weeks'];
export const PROGRESS_LABELS = ['progressWeek', 'progressWeekday', 'progressDay', 'progressSlot', 'progressSlotsPerDay', 'progressTotalWeeks'];
export const progressCandidates = (draft) => Object.entries(draft.operandNodes).filter(([, node]) => node.node_type === 'value' && !isComputed(node) && nodeScope(node) === 'environment' && node.value_type === 'number');
export function progressBindings(draft, overrides = {}) {
  const candidates = progressCandidates(draft);
  return Object.fromEntries(PROGRESS_ROLES.map((role) => {
    const matches = candidates.filter(([, node]) => node.symbol?.trim() === `schedule_${role}`);
    return [role, Object.hasOwn(overrides, role) ? overrides[role] : matches.length === 1 ? matches[0][0] : ''];
  }));
}
export function daySimulationPlan(draft, sequenceId, position, t = translator('en'), choices = {}, dayChoices = {}) {
  const sequence = draft.sequences.find((item) => item.id === sequenceId), errors = [];
  if (!sequence) return { errors: [{ path: '/sequence_id', key: 'simulationChooseSequence' }], layers: [], phases: [] };
  const range = sequenceRange(sequence), rowIndex = Math.floor(position / 7), weekday = WEEKDAYS[position % 7], executionPosition = firstExecutionPosition(sequence, position);
  if (!Number.isSafeInteger(position) || position < 0 || position >= sequence.rows.length * 7 || executionPosition === null) return { errors: [{ path: '/date', key: 'simulationDateOutside' }], layers: [], phases: [] };
  errors.push(...sequenceRepeatErrors(sequence));
  errors.push(...eventGroupErrors(sequence, draft.days).map((error) => ({ ...error, path: `/week_sequences/${sequence.id}${error.path}` })));
  const { day: main, overridden } = resolveSequenceDay(draft, sequence.rows[rowIndex], weekday);
  errors.push(...slotReleaseErrors(draft));
  const candidates = eventsOnDate(sequence, position, draft);
  const eventDayOptions = candidates;
  const probabilityEvents = candidates.filter((group) => eventKind(group) === 'probability');
  const events = candidates.filter((group) => eventKind(group) !== 'probability' || choices[group.id] === true).map((group) => ({ type: 'event', groupId: group.id, dayId: dayChoices[group.id] ?? eventDayCandidates(group)[0]?.dayId, name: eventGroupName(group, draft.days), priority: group.priority, executionMode: eventExecutionMode(group), modePath: `/week_sequences/${sequence.id}/event_groups/${sequence.eventGroups.indexOf(group)}/execution_mode` }));
  for (const event of events) if (!eventDayCandidates(candidates.find((group) => group.id === event.groupId)).some((item) => item.dayId === event.dayId)) errors.push({ path: `/simulation/event_days/${event.groupId}`, key: 'simulationInvalidEventDay' });
  const layers = [...events.filter((entry) => entry.priority >= 0), ...(main ? [{ type: 'main', dayId: main.id, name: main.name, overridden }] : []), ...events.filter((entry) => entry.priority < 0)];
  const count = draft.project.settings.slots_per_day, phases = [];
  const days = new Map(draft.days.map((day) => [day.id, day])), slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  function phase(key, label, target, currentSlot) {
    const entries = [];
    for (const layer of layers) {
      const day = days.get(layer.dayId); if (!day) continue;
      const start = typeof target === 'object' && target.edge === 'start';
      const release = start ? day.slotReleases?.[target.index] : undefined;
      const releasePath = `/day_schedules/${day.id}/slot_releases/${target.index}`;
      const id = dayAssignment(day, target);
      if (id == null && !release && !(start && layer.type === 'event' && layer.executionMode !== 'overlay')) continue;
      const slot = slots.get(id), path = typeof target === 'number' ? `/slot_ids/${target}` : typeof target === 'string' ? target === 'dayStart' ? '/day_start_slot_id' : '/day_end_slot_id' : `/slot_events/${target.index}/${target.edge}_slot_id`;
      if (id != null && !slot) errors.push({ path: `/day_schedules/${day.id}${path}`, key: 'missingSlot' });
      else entries.push({ ...layer, slotId: id, slotName: slot?.name ?? '', ...(release ? { release, releasePath } : {}), sourcePath: slot ? `/day_schedules/${day.id}${path}` : release ? releasePath : layer.modePath });
    }
    phases.push({ key, label, target, currentSlot, entries });
  }
  phase('dayStart', t('dayStartEvent'), 'dayStart', 1);
  for (let index = 0; index < count; index++) {
    phase(`slot:${index}:start`, t('slotStartEvent', { count: index + 1 }), { index, edge: 'start' }, index + 1);
    phase(`slot:${index}:main`, t('cell', { count: index + 1 }), index, index + 1);
    phase(`slot:${index}:end`, t('slotEndEvent', { count: index + 1 }), { index, edge: 'end' }, index + 1);
  }
  phase('dayEnd', t('dayEndEvent'), 'dayEnd', count);
  return { sequenceId, position, executionPosition, weekNumber: resolveExecutionDate(sequence, executionPosition).weekNumber, rowIndex, weekday, dayNumber: executionPosition - range.start + 1, mainDayId: main?.id ?? null, layers, phases, errors, probabilityEvents, eventDayOptions };
}
export function prepareDayValues(draft, plan, values, overrides = {}) {
  const bindings = progressBindings(draft, overrides), next = structuredClone(values), errors = [], seen = new Set();
  const candidates = new Set(progressCandidates(draft).map(([id]) => id));
  const progress = { current_week: plan.weekNumber ?? plan.rowIndex + 1, current_weekday: WEEKDAYS.indexOf(plan.weekday) + 1, current_day: plan.dayNumber, current_slot: 1, slots_per_day: draft.project.settings.slots_per_day, total_weeks: (draft.sequences.find((item) => item.id === plan.sequenceId) ? sequenceExecutionRange(draft.sequences.find((item) => item.id === plan.sequenceId)).totalWeeks ?? 0 : 0) };
  for (const [role, id] of Object.entries(bindings)) {
    if (!id) continue;
    if (!candidates.has(id) || seen.has(id)) { errors.push({ path: `/progress_bindings/${role}`, key: 'simulationInvalidBinding' }); continue; }
    seen.add(id); if (!plan.errors.length) next[id] = progress[role];
  }
  return { values: next, bindings, errors };
}
