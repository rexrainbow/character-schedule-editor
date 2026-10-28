import { Program, Runtime } from '../runtime/index.js';
import { sequenceExecutionRange } from '../core/sequenceExecution.js';
import { simulationInitialValues, simulationValueErrors } from './inputs.js';
import { TraceCollector } from './TraceCollector.js';
import { translator } from '../i18n/index.js';

export const MAX_CONTINUOUS_DAYS = 366;
const copy = (value) => structuredClone(value);
const errorIssue = (error) => error.issues?.length ? error.issues : [{ key: error.code ?? error.key ?? 'simulationError', path: error.path ?? '/', message: error.message }];
const sourceKey = (event) => event.occurrenceId ?? 'main';
function aggregateChange(changes, event) {
  const change = changes[event.ref] ??= { id: event.ref, before: event.before, after: event.after, writes: 0 };
  change.after = event.after; change.writes++;
  if (typeof event.after === 'number') change.delta = (change.delta ?? 0) + event.after - event.before;
}

export function summarizeWeeks(days) {
  const weeks = [];
  for (const day of days) {
    let week = weeks.at(-1);
    if (week?.weekNumber !== day.weekNumber) {
      week = { weekNumber: day.weekNumber, firstDay: day.dayNumber, lastDay: day.dayNumber, days: 0, before: day.before, after: day.after, events: 0, tasks: 0, slots: {}, eventCounts: {}, partial: day.weekday !== 'mon' };
      weeks.push(week);
    }
    week.lastDay = day.dayNumber; week.days++; week.after = day.after;
    week.events += day.events.length; week.tasks += day.taskCount;
    for (const [id, count] of Object.entries(day.slots)) week.slots[id] = (week.slots[id] ?? 0) + count;
    for (const event of day.events) {
      const key = event.eventRef;
      const entry = week.eventCounts[key] ??= { event, count: 0 }; entry.count++;
    }
    week.partial = week.partial || day.weekday !== 'sun';
    // A complete Monday–Sunday group ceases to be partial once Sunday completes.
    if (week.days === 7 && day.weekday === 'sun') week.partial = false;
  }
  return weeks;
}

/** Macro history belongs to this collector, never to Runtime or its checkpoints. */
export async function simulateContinuous(draft, { sequenceId, days = 28, seed = '1', values = simulationInitialValues(draft), signal, onDay } = {}) {
  const result = { status: 'running', sequenceId, requestedDays: days, seed, initialValues: copy(values), days: [], weeks: [], errors: [], unmodeled: false };
  const valueErrors = simulationValueErrors(draft, values);
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_CONTINUOUS_DAYS) valueErrors.push({ path: '/days', key: 'continuousDaysError' });
  if (!draft.sequences.some((item) => item.id === sequenceId)) valueErrors.push({ path: '/sequence', key: 'simulationChooseSequence' });
  if (valueErrors.length) return { ...result, status: 'failed', errors: valueErrors };
  let runtime, daily;
  try {
    const program = Program.fromProject(draft, { referenceMode: 'uuid' });
    result.program = program.toJSON();
    runtime = new Runtime({ program, initialState: values, initialValues: simulationInitialValues(draft), seed, diagnostics: false, unhandledTasks: 'record', yieldEvery: 16 });
    const sequenceRef = program.resolve('sequences', sequenceId), range = sequenceExecutionRange(program.get('sequences', sequenceRef));
    if (!range.totalDays) throw Object.assign(new Error('dateOutsideSequence'), { code: 'simulationDateOutside' });
    runtime.on('variable.change', (event) => {
      if (!daily) return;
      const key = sourceKey(event), source = daily.sourceChanges[key] ??= { source: { dayId: event.dayRef, groupId: event.eventRef, name: daily.sources?.find((item) => item.occurrenceId === event.occurrenceId)?.name, type: event.type }, changes: {} };
      aggregateChange(source.changes, event);
      const task = daily.taskChanges[daily.currentTask] ??= { name: daily.currentTask, changes: {} };
      aggregateChange(task.changes, event);
    });
    runtime.on('task.start', (event) => { if (daily) daily.currentTask = event.name; });
    runtime.on('task.completed', (event) => { if (daily) { daily.taskCount++; daily.tasks[event.name] = (daily.tasks[event.name] ?? 0) + 1; } });
    runtime.on('assignment.end', (event) => { if (daily && event.slotRef && event.phase === 'slot.body') daily.slots[event.slotRef] = (daily.slots[event.slotRef] ?? 0) + 1; });
    runtime.on('assignment.skipped', () => { if (daily) daily.skipped++; });
    runtime.on('task.unhandled', () => { if (daily) daily.unhandled++; });
    const abort = () => { void runtime.pause().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      for (let index = 0; index < days && range.start + index <= range.end; index++) {
        if (signal?.aborted) break;
        const position = range.start + index, checkpoint = runtime.snapshot();
        daily = { position, checkpoint, taskCount: 0, tasks: {}, slots: {}, skipped: 0, unhandled: 0, sourceChanges: {}, taskChanges: {} };
        await runtime.startDay({ sequence: sequenceRef, position });
        if (signal?.aborted) break;
        const beginning = runtime.getState(), { execution } = beginning;
        daily.before = copy(beginning.variables);
        Object.assign(daily, { dayNumber: execution.dayNumber, weekNumber: execution.weekNumber, weekday: execution.weekday, rowIndex: execution.rowIndex, iteration: execution.iteration, sources: copy(execution.sources), events: copy(execution.sources.filter((source) => source.type === 'event')) });
        await runtime.resume();
        if (signal?.aborted || runtime.status !== 'completed') break;
        const state = runtime.getState(), previousReservations = new Set(checkpoint.state.reservations.map((item) => item.id));
        daily.after = copy(state.variables);
        delete daily.currentTask;
        daily.reservations = copy(state.reservations.filter((item) => !previousReservations.has(item.id)));
        result.unmodeled ||= daily.unhandled > 0;
        result.days.push(daily); result.weeks = summarizeWeeks(result.days);
        result.finalValues = daily.after;
        onDay?.({ ...result, days: [...result.days] });
        daily = null;
        // Always yield between days, including empty calendars, so Cancel stays usable.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      result.status = signal?.aborted ? 'cancelled' : 'completed';
      result.reachedEnd = result.days.length < days && !signal?.aborted;
    } finally { signal?.removeEventListener('abort', abort); }
  } catch (error) {
    result.status = signal?.aborted ? 'cancelled' : 'failed';
    if (!signal?.aborted) result.errors = errorIssue(error);
    result.errorPosition = daily?.position;
  }
  return result;
}

export async function replayContinuousDay(draft, result, day, t = translator('en'), { signal } = {}) {
  const collector = new TraceCollector(draft, t), errors = [];
  let runtime;
  try {
    runtime = Runtime.restore({ program: Program.fromJSON(result.program), checkpoint: day.checkpoint, diagnostics: true, unhandledTasks: 'record', yieldEvery: 16 });
    runtime.on('diagnostic', (record) => collector.accept(record));
    const abort = () => { void runtime.pause().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (!signal?.aborted) await runtime.startDay({ sequence: result.sequenceId, position: day.position });
      if (!signal?.aborted) await runtime.resume();
    } finally { signal?.removeEventListener('abort', abort); }
  } catch (error) { if (!signal?.aborted) errors.push(...errorIssue(error)); }
  return { trace: collector.trace, calls: collector.calls, errors, cancelled: !!signal?.aborted, state: runtime?.getState().variables };
}
