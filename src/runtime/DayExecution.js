import { eventOccursAtExecution } from '../core/sequenceEvents.js';
import { sequenceExecutionRange, resolveExecutionDate } from '../core/sequenceExecution.js';
import { dayAssignment } from '../core/dayEvents.js';
import { eventDayCandidates, eventDaySourceMode } from '../core/eventDaySource.js';
import { WEEKDAYS } from '../core/scheduleConstants.js';
import { copy, fail, random } from './utils.js';

export class EventOccurrence {
  constructor(state, sequenceRef, position, event, dayRef) {
    Object.assign(this, { type: 'event', eventRef: event.id, dayRef, occurrenceId: `${state.runId}:${sequenceRef}:${position}:${event.id}`, name: event.display_name || event.name, priority: event.priority, executionMode: event.executionMode ?? 'overlay' });
  }
}

export class DayExecution {
  static chooseDay(event, state, decisions, context) {
    const candidates = eventDayCandidates(event), mode = eventDaySourceMode(event);
    let selected = decisions?.chooseDay?.(copy(event), copy(candidates), copy(context));
    if (selected === undefined) {
      if (mode === 'sequential') { const index = state.sequential[event.id] ?? 0; selected = candidates[index % candidates.length].dayId; }
      else if (mode === 'random') {
        const max = Math.max(...candidates.map((item) => item.weight)), total = candidates.reduce((sum, item) => sum + item.weight / max, 0);
        let draw = random(state) * total;
        selected = candidates.at(-1).dayId;
        for (const item of candidates) { draw -= item.weight / max; if (draw < 0) { selected = item.dayId; break; } }
      } else selected = candidates[0].dayId;
    }
    if (!candidates.some((item) => item.dayId === selected)) fail('invalidDayChoice');
    if (mode === 'sequential') state.sequential[event.id] = (state.sequential[event.id] ?? 0) + 1;
    return selected;
  }
  static create(program, state, { sequence, position, dayIndex }, decisions) {
    const sequenceRef = program.resolve('sequences', sequence), definition = program.get('sequences', sequenceRef), range = sequenceExecutionRange(definition);
    position ??= dayIndex === undefined ? (state.lastDays[sequenceRef] ?? range.start - 1) + 1 : range.start + dayIndex;
    if (!Number.isSafeInteger(position) || position < range.start || position > range.end) fail('dateOutsideSequence');
    if (state.lastDays[sequenceRef] !== undefined && position !== state.lastDays[sequenceRef] + 1) fail('nonSequentialDate');
    const date = resolveExecutionDate(definition, position), { row, weekday } = date;
    const week = program.get('weeks', row.weekId), mainDay = Object.hasOwn(row.overrides, weekday) ? row.overrides[weekday] : week.days[weekday];
    const context = { sequenceRef, position, dayNumber: position - range.start + 1, weekday, weekNumber: date.weekNumber, rowIndex: date.rowIndex, iteration: date.iteration, templatePosition: date.templatePosition };
    const schedule = program.asSchedule(), scheduleSequence = schedule.sequences.find((item) => item.id === sequenceRef), events = [];
    for (const event of definition.eventGroups) {
      if (!eventOccursAtExecution(event, position, scheduleSequence, schedule)) continue;
      if (event.kind === 'probability') {
        const settings = state.events[event.id];
        if (settings.cooldown_remaining > 0) { settings.cooldown_remaining--; continue; }
        let occurs = decisions?.occurs?.(copy(event), copy(context));
        if (occurs !== undefined && typeof occurs !== 'boolean') fail('invalidProbabilityChoice');
        occurs ??= random(state) * 100 < settings.probability_percent;
        if (!occurs) continue;
        settings.cooldown_remaining = settings.cooldown_days;
      }
      events.push(new EventOccurrence(state, sequenceRef, position, event, DayExecution.chooseDay(event, state, decisions, context)));
    }
    for (const reservation of state.reservations) if (reservation.sequenceRef === sequenceRef && reservation.position === position) events.push(new EventOccurrence(state, sequenceRef, position, reservation.event, DayExecution.chooseDay(reservation.event, state, decisions, context)));
    events.sort((a, b) => b.priority - a.priority);
    const main = mainDay == null ? [] : [{ type: 'main', dayRef: mainDay, occurrenceId: `${state.runId}:${sequenceRef}:${position}:main`, name: program.get('days', mainDay).display_name, priority: 0, executionMode: 'overlay' }];
    const sources = [...events.filter((event) => event.priority >= 0), ...main, ...events.filter((event) => event.priority < 0)].map((item) => ({ ...item }));
    const phases = [{ name: 'day.start', target: 'dayStart', slotIndex: 0 }];
    for (let index = 0; index < program.settings.slots_per_day; index++) phases.push({ name: 'slot.start', target: { index, edge: 'start' }, slotIndex: index }, { name: 'slot.body', target: index, slotIndex: index }, { name: 'slot.end', target: { index, edge: 'end' }, slotIndex: index });
    phases.push({ name: 'day.end', target: 'dayEnd', slotIndex: program.settings.slots_per_day - 1 });
    return { kind: 'day', ...context, sources, phases, phaseIndex: 0, sourceIndex: 0, phaseStarted: false, assignment: null, frames: [], pending: null, claims: [], released: [], done: false };
  }
  static slot(program, slot) {
    const slotRef = program.resolve('slots', slot);
    return { kind: 'slot', sources: [{ type: 'standalone', slotRef, occurrenceId: `slot:${slotRef}` }], phases: [{ name: 'slot.body', slotIndex: 0 }], phaseIndex: 0, sourceIndex: 0, phaseStarted: false, assignment: null, frames: [], pending: null, claims: [], released: [], done: false };
  }
  static context(execution) {
    const phase = execution.phases[execution.phaseIndex];
    return { ...(execution.sequenceRef ? { sequenceRef: execution.sequenceRef, position: execution.position, dayNumber: execution.dayNumber, weekday: execution.weekday, weekNumber: execution.weekNumber, rowIndex: execution.rowIndex, iteration: execution.iteration, templatePosition: execution.templatePosition } : {}), phase: phase?.name ?? 'completed', slotIndex: phase?.slotIndex ?? 0, ...(execution.assignment ?? {}) };
  }
  static assignment(program, execution) {
    const source = execution.sources[execution.sourceIndex], phase = execution.phases[execution.phaseIndex];
    if (!source) return null;
    if (source.type === 'standalone') return copy(source);
    const day = program.get('days', source.dayRef), slotRef = dayAssignment(day, phase.target);
    const release = phase.name === 'slot.start' && source.type === 'event' && source.executionMode !== 'overlay' ? day.slotReleases?.[phase.slotIndex] : null;
    return { ...copy(source), slotRef, ...(release ? { release: copy(release) } : {}) };
  }
  static blocked(execution, source) {
    const phase = execution.phases[execution.phaseIndex];
    if (!phase.name.startsWith('slot.')) return false;
    if (phase.name !== 'slot.start' && execution.released.includes(source.occurrenceId)) return true;
    return execution.claims.some((claim) => claim.occurrenceId !== source.occurrenceId && (source.type === 'main' || claim.executionMode === 'interrupt_lower' && source.priority < claim.priority));
  }
  static finishAssignment(execution) {
    const source = execution.assignment, phase = execution.phases[execution.phaseIndex];
    if (phase.name === 'slot.start' && source.type === 'event' && source.executionMode !== 'overlay' && !execution.released.includes(source.occurrenceId)) execution.claims.push(copy(source));
    execution.assignment = null; execution.sourceIndex++;
  }
}
