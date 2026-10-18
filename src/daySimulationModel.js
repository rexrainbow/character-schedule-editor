import { createSimulationEvaluator, simulationInitialValues, simulationValueErrors } from './simulationModel.js';
import { eventsOnDate, eventGroupErrors, eventGroupName } from './sequenceEvents.js';
import { sequenceRange } from './sequenceRange.js';
import { resolveSequenceDay } from './sequenceModel.js';
import { dayAssignment } from './dayEvents.js';
import { isComputed, nodeScope, nodePath, slotEntries } from './operandModel.js';
import { WEEKDAYS } from './scheduleConstants.js';
import { translator } from './i18n.js';

export const PROGRESS_ROLES = ['current_week', 'current_weekday', 'current_day', 'current_slot', 'slots_per_day', 'total_weeks'];
export const PROGRESS_LABELS = ['progressWeek', 'progressWeekday', 'progressDay', 'progressSlot', 'progressSlotsPerDay', 'progressTotalWeeks'];
export const progressCandidates = (draft) => Object.entries(draft.operandNodes).filter(([, node]) => node.node_type === 'value' && !isComputed(node) && nodeScope(node) === 'environment' && node.value_type === 'number');
export function progressBindings(draft, overrides = {}) {
  const candidates = progressCandidates(draft);
  return Object.fromEntries(PROGRESS_ROLES.map((role) => {
    const matches = candidates.filter(([, node]) => node.engine_key?.trim() === `schedule.${role}`);
    return [role, Object.hasOwn(overrides, role) ? overrides[role] : matches.length === 1 ? matches[0][0] : ''];
  }));
}
export function daySimulationPlan(draft, sequenceId, position, t = translator('en')) {
  const sequence = draft.sequences.find((item) => item.id === sequenceId), errors = [];
  if (!sequence) return { errors: [{ path: '/sequence_id', key: 'simulationChooseSequence' }], layers: [], phases: [] };
  const range = sequenceRange(sequence), rowIndex = Math.floor(position / 7), weekday = WEEKDAYS[position % 7];
  if (!Number.isSafeInteger(position) || position < 0 || position >= sequence.rows.length * 7 || position < range.start || position > range.end) return { errors: [{ path: '/date', key: 'simulationDateOutside' }], layers: [], phases: [] };
  errors.push(...eventGroupErrors(sequence, draft.days).map((error) => ({ ...error, path: `/week_sequences/${sequence.id}${error.path}` })));
  const { day: main, overridden } = resolveSequenceDay(draft, sequence.rows[rowIndex], weekday);
  const events = eventsOnDate(sequence, position).map((group) => ({ type: 'event', groupId: group.id, dayId: group.dayId, name: eventGroupName(group, draft.days), priority: group.priority }));
  const layers = [...events.filter((entry) => entry.priority >= 0), ...(main ? [{ type: 'main', dayId: main.id, name: main.name, overridden }] : []), ...events.filter((entry) => entry.priority < 0)];
  const count = draft.project.settings.slots_per_day, phases = [];
  const days = new Map(draft.days.map((day) => [day.id, day])), slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  function phase(key, label, target, currentSlot) {
    const entries = [];
    for (const layer of layers) {
      const day = days.get(layer.dayId); if (!day) continue;
      const id = dayAssignment(day, target); if (id === null) continue;
      const slot = slots.get(id), path = typeof target === 'number' ? `/slot_ids/${target}` : typeof target === 'string' ? target === 'dayStart' ? '/day_start_slot_id' : '/day_end_slot_id' : `/slot_events/${target.index}/${target.edge}_slot_id`;
      if (!slot) errors.push({ path: `/day_schedules/${day.id}${path}`, key: 'missingSlot' });
      else entries.push({ ...layer, slotId: id, slotName: slot.name, sourcePath: `/day_schedules/${day.id}${path}` });
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
  return { sequenceId, position, rowIndex, weekday, dayNumber: position - range.start + 1, mainDayId: main?.id ?? null, layers, phases, errors };
}
export function prepareDayValues(draft, plan, values, overrides = {}) {
  const bindings = progressBindings(draft, overrides), next = structuredClone(values), errors = [], seen = new Set();
  const candidates = new Set(progressCandidates(draft).map(([id]) => id));
  const progress = { current_week: plan.rowIndex + 1, current_weekday: WEEKDAYS.indexOf(plan.weekday) + 1, current_day: plan.dayNumber, current_slot: 1, slots_per_day: draft.project.settings.slots_per_day, total_weeks: draft.sequences.find((item) => item.id === plan.sequenceId)?.rows.length };
  for (const [role, id] of Object.entries(bindings)) {
    if (!id) continue;
    if (!candidates.has(id) || seen.has(id)) { errors.push({ path: `/progress_bindings/${role}`, key: 'simulationInvalidBinding' }); continue; }
    seen.add(id); if (!plan.errors.length) next[id] = progress[role];
  }
  return { values: next, bindings, errors };
}
export function simulateSequenceDay(draft, sequenceId, position, values = simulationInitialValues(draft), baseline = simulationInitialValues(draft), t = translator('en'), overrides = {}) {
  const plan = daySimulationPlan(draft, sequenceId, position, t), prepared = prepareDayValues(draft, plan, values, overrides);
  const input = prepared.values, errors = [...plan.errors, ...prepared.errors, ...simulationValueErrors(draft, input), ...simulationValueErrors(draft, baseline).map((e) => ({ ...e, path: e.path.replace('/values/', '/initial_values/') }))];
  let context = null;
  const controls = [];
  const engine = createSimulationEvaluator(draft, input, baseline, t, (signal) => {
    if (signal.scope === 'slot' && !context.phaseKey.startsWith('slot:')) return { applied: false, reason: 'controlNoSlotContext' };
    controls.push({ ...signal, source: { ...context } });
    return { applied: true, reason: signal.scope === 'slot' ? 'controlSlotApplied' : 'controlDayApplied' };
  }), slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  function lowerPriority(entry, source) {
    if (source.type === 'main') return entry.type === 'event' && entry.priority < 0;
    if (entry.type === 'main') return source.priority >= 0;
    return entry.priority < source.priority;
  }
  if (!errors.length) try {
    for (const phase of plan.phases) {
      context = { phase: phase.label, phaseKey: phase.key };
      engine.guard(0, `/simulation/${phase.key}`);
      if (prepared.bindings.current_slot) engine.state[prepared.bindings.current_slot] = phase.currentSlot;
      const event = { kind: 'phase', label: phase.label, path: `/simulation/${phase.key}`, children: [], empty: !phase.entries.length }; engine.trace.push(event);
      for (const entry of phase.entries) {
        context = { ...entry, phase: phase.label, phaseKey: phase.key, currentSlot: phase.currentSlot };
        engine.guard(0, entry.sourcePath);
        const slot = slots.get(entry.slotId), trace = { kind: 'daySlot', label: `${entry.name} [${entry.type === 'main' ? t('simulationMainDay') : `${t('eventPriority')}: ${entry.priority}`}] → ${slot.name}`, slotId: slot.id, dayId: entry.dayId, groupId: entry.groupId, children: [], empty: !slotEntries(slot).length };
        event.children.push(trace);
        const cancellation = controls.find((control) => (control.scope === 'day' || phase.key.startsWith('slot:') && control.source.currentSlot === phase.currentSlot) && lowerPriority(entry, control.source));
        if (cancellation) { trace.cancelled = true; trace.empty = false; trace.cancelledBy = { name: cancellation.source.name, task: cancellation.label, scope: cancellation.scope, path: cancellation.path, phase: cancellation.source.phase }; continue; }
        const firstCall = engine.calls.length;
        try { if (slotEntries(slot).length) engine.runSlot(slot, trace.children); }
        catch (error) { trace.failed = true; throw error; }
        finally { for (let i = firstCall; i < engine.calls.length; i++) Object.assign(engine.calls[i], { context: { ...context } }); }
      }
    }
  } catch (error) { errors.push({ key: error.key ?? 'simulationError', path: error.path ?? '/', field: error.field }); }
  return { kind: 'day', sequenceId, position, plan, input, bindings: prepared.bindings, trace: engine.trace, calls: engine.calls, state: engine.state, errors, errorContext: errors.length ? context : null, unmodeled: engine.unmodeled,
    changes: Object.keys(input).filter((id) => !Object.is(input[id], engine.state[id])).map((id) => ({ id, name: nodePath(draft.operandNodes, id), before: input[id], after: engine.state[id] })) };
}
