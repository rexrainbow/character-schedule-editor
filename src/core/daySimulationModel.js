import { eventDayCandidates, eventDaySourceMode } from './eventDaySource.js';
import { slotReleaseErrors, eventExecutionMode } from './slotRelease.js';
import { createSimulationEvaluator, simulationInitialValues, simulationValueErrors } from './simulationModel.js';
import { eventsOnDate, eventGroupErrors, eventGroupName } from './sequenceEvents.js';
import { sequenceRange } from './sequenceRange.js';
import { resolveSequenceDay } from './sequenceModel.js';
import { dayAssignment } from './dayEvents.js';
import { isComputed, nodeScope, nodePath, slotEntries } from './operandModel.js';
import { WEEKDAYS } from './scheduleConstants.js';
import { translator } from '../i18n/index.js';
import { eventKind } from './eventReferences.js';

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
  const range = sequenceRange(sequence), rowIndex = Math.floor(position / 7), weekday = WEEKDAYS[position % 7];
  if (!Number.isSafeInteger(position) || position < 0 || position >= sequence.rows.length * 7 || position < range.start || position > range.end) return { errors: [{ path: '/date', key: 'simulationDateOutside' }], layers: [], phases: [] };
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
  return { sequenceId, position, rowIndex, weekday, dayNumber: position - range.start + 1, mainDayId: main?.id ?? null, layers, phases, errors, probabilityEvents, eventDayOptions };
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
export function simulateSequenceDay(draft, sequenceId, position, values = simulationInitialValues(draft), baseline = simulationInitialValues(draft), t = translator('en'), overrides = {}, choices = {}, seed = '1', dayChoices = {}) {
  const plan = daySimulationPlan(draft, sequenceId, position, t, choices, dayChoices), prepared = prepareDayValues(draft, plan, values, overrides);
  const input = prepared.values, errors = [...plan.errors, ...prepared.errors, ...simulationValueErrors(draft, input), ...simulationValueErrors(draft, baseline).map((e) => ({ ...e, path: e.path.replace('/values/', '/initial_values/') }))];
  let context = null;
  let claims = [], released = new Map();
  const engine = createSimulationEvaluator(draft, input, baseline, t, (signal) => {
    if (!context || context.type !== 'event' || context.executionMode === 'overlay') return { applied: false, reason: 'releaseInactive' };
    if (signal.result) released.set(context.groupId, { ...signal, scope: 'slot', source: { ...context } });
    return { applied: true, reason: signal.result ? 'slotReleased' : 'releaseNotMatched' };
  }, { sequenceId, position, choices, current: () => context }, { seed }), slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  for (const group of plan.probabilityEvents ?? []) engine.trace.push({ kind: 'message', label: `${eventGroupName(group, draft.days)}: ${t(choices[group.id] === true ? 'eventOccursYes' : 'eventOccursNo')} (${t('manualProbabilityDecision')})` });
  for (const layer of plan.layers.filter((layer) => layer.type === 'event' && eventDaySourceMode((plan.eventDayOptions ?? []).find((group) => group.id === layer.groupId)) !== 'fixed')) engine.trace.push({ kind: 'message', label: `${layer.name}: ${t('simulationChosenDay')} → ${draft.days.find((day) => day.id === layer.dayId)?.name ?? t('unassigned')}` });
  function cancellation(entry, phase) {
    if (!phase.key.startsWith('slot:')) return null;
    if (!phase.key.endsWith(':start') && released.has(entry.groupId)) return released.get(entry.groupId);
    return claims.find((claim) => claim.source.groupId !== entry.groupId && (entry.type === 'main' || claim.source.executionMode === 'interrupt_lower' && entry.priority < claim.source.priority));
  }
  if (!errors.length) try {
    for (const phase of plan.phases) {
      if (phase.key.endsWith(':start')) { claims = []; released = new Map(); }
      context = { phase: phase.label, phaseKey: phase.key };
      engine.guard(0, `/simulation/${phase.key}`);
      if (prepared.bindings.current_slot) engine.state[prepared.bindings.current_slot] = phase.currentSlot;
      const event = { kind: 'phase', label: phase.label, path: `/simulation/${phase.key}`, children: [], empty: !phase.entries.length }; engine.trace.push(event);
      for (const entry of phase.entries) {
        context = { ...entry, phase: phase.label, phaseKey: phase.key, currentSlot: phase.currentSlot };
        engine.guard(0, entry.sourcePath);
        const slot = slots.get(entry.slotId), trace = { kind: 'daySlot', label: `${entry.name} [${entry.type === 'main' ? t('simulationMainDay') : `${t('eventPriority')}: ${entry.priority}`}] \u2192 ${slot?.name ?? t(entry.release ? 'releaseSlot' : `executionMode_${entry.executionMode}`)}`, slotId: slot?.id ?? null, dayId: entry.dayId, groupId: entry.groupId, children: [], empty: !entry.release && !slot && entry.executionMode === 'overlay' };
        event.children.push(trace);
        const blocked = cancellation(entry, phase);
        if (blocked) { trace.cancelled = true; trace.cancelledBy = { name: blocked.source.name, task: blocked.label, scope: 'slot', path: blocked.path, phase: blocked.source.phase }; continue; }
        const firstCall = engine.calls.length;
        try {
          if (slot && slotEntries(slot).length) engine.runSlot(slot, trace.children);
          else if (slot && !entry.release) trace.empty = true;
          if (phase.key.endsWith(':start')) {
            if (entry.type === 'event' && entry.executionMode !== 'overlay') {
              if (entry.release) engine.runControl(entry.release, entry.releasePath, trace.children);
              if (!released.has(entry.groupId)) {
                const claim = { scope: 'slot', label: t(`executionMode_${entry.executionMode}`), path: entry.modePath, source: { ...context } };
                claims.push(claim); trace.empty = false;
                trace.children.push({ kind: 'message', label: claim.label });
              }
            } else if (entry.release) trace.children.push({ kind: 'message', label: t('releaseInactive') });
          }
        } catch (error) { trace.failed = true; throw error; }
        finally { for (let i = firstCall; i < engine.calls.length; i++) Object.assign(engine.calls[i], { context: { ...context } }); }
      }
    }
  } catch (error) { errors.push({ key: error.key ?? 'simulationError', path: error.path ?? '/', field: error.field }); }
  return { kind: 'day', seed, sequenceId, position, reservations: engine.reservations, plan, input, bindings: prepared.bindings, trace: engine.trace, calls: engine.calls, state: engine.state, eventValues: engine.eventValues, errors, errorContext: errors.length ? context : null, unmodeled: engine.unmodeled,
    changes: Object.keys(input).filter((id) => !Object.is(input[id], engine.state[id])).map((id) => ({ id, name: nodePath(draft.operandNodes, id), before: input[id], after: engine.state[id] })) };
}
