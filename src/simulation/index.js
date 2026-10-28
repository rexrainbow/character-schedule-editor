import { Runtime } from '../runtime/index.js';
import { Evaluator } from '../runtime/Evaluator.js';
import { simulationProgram } from './program.js';
import { TraceCollector, phaseLabel } from './TraceCollector.js';
import { simulationInitialValues, simulationValueErrors } from './inputs.js';
import { daySimulationPlan as outlineDayPlan, prepareDayValues } from './planning.js';
import { DayExecution } from '../runtime/DayExecution.js';
import { isComputed, nodePath } from '../core/operandModel.js';
import { eventDayCandidates, eventDaySourceToData } from '../core/eventDaySource.js';
import { eventGroupName, positionDate } from '../core/sequenceEvents.js';
import { translator } from '../i18n/index.js';

export { simulationInitialValues, simulationValueErrors, prepareDayValues };
export function daySimulationPlan(draft, sequenceId, position, t = translator('en'), choices = {}, dayChoices = {}) {
  const outline = outlineDayPlan(draft, sequenceId, position, t, choices, dayChoices);
  if (outline.errors.length) return outline;
  try {
    const program = simulationProgram(draft, { sequenceId, position });
    const runtime = new Runtime({ program, decisions: { occurs: (event) => choices[event.id] === true, chooseDay: (event, candidates) => dayChoices[event.id] ?? candidates[0].dayId } });
    const preview = runtime.previewDay({ sequence: sequenceId, position: outline.executionPosition });
    const layer = (source) => ({ ...source, groupId: source.eventRef, dayId: source.dayRef });
    const layers = preview.sources.map(layer);
    const phases = preview.phases.map((phase, phaseIndex) => ({ ...phase, key: phase.name === 'day.start' ? 'dayStart' : phase.name === 'day.end' ? 'dayEnd' : `slot:${phase.slotIndex}:${phase.name === 'slot.body' ? 'main' : phase.name.split('.')[1]}`, label: phaseLabel({ ...phase, phase: phase.name }, t), currentSlot: phase.slotIndex + 1,
      entries: preview.sources.map((source, sourceIndex) => DayExecution.assignment(program, { ...preview, phaseIndex, sourceIndex })).filter((source) => source.slotRef || source.release || phase.name === 'slot.start' && source.type === 'event' && source.executionMode !== 'overlay').map((source) => ({ ...layer(source), slotId: source.slotRef, slotName: draft.slots.find((slot) => slot.id === source.slotRef)?.name ?? '' })) }));
    return { ...outline, layers, phases, engine: 'runtime' };
  } catch { return outline; } // Unfinished editor actions still permit calendar navigation; execution reports their validation errors.
}
const mappedError = (error) => ({ key: ({ executionLimit: 'simulationLimit', invalidOperand: 'chooseOperand', invalidValue: 'simulationInvalidValue', invalidEnumArgument: 'chooseEnumOption' })[error.code] ?? error.key ?? error.code ?? 'simulationError', path: error.path || '/', ...(error.field ? { field: error.field } : {}) });

export function evaluateSimulationExpressions(draft, values) {
  return Object.fromEntries(Object.entries(draft.operandNodes).filter(([, node]) => isComputed(node)).map(([id]) => {
    try {
      const program = simulationProgram(draft, { expressions: [id] }), runtime = new Runtime({ program, initialState: values });
      const evaluator = new Evaluator(program, runtime.getState());
      return [id, { value: evaluator.operand({ type: 'expression_macro_reference', expression_macro_id: id }, {}, 0, `/expression_macros/${id}`) }];
    } catch (error) { return [id, { error: mappedError(error) }]; }
  }));
}

async function execute(draft, { slotId, sequenceId, position, values, baseline, t, bindings = {}, choices = {}, dayChoices = {}, seed, signal }) {
  const dayMode = sequenceId !== undefined, rawInput = structuredClone(values), plan = dayMode ? daySimulationPlan(draft, sequenceId, position, t, choices, dayChoices) : null;
  const prepared = dayMode ? prepareDayValues(draft, plan, rawInput, bindings) : { values: rawInput, bindings: {}, errors: [] };
  const input = prepared.values, errors = [...simulationValueErrors(draft, input), ...simulationValueErrors(draft, baseline).map((error) => ({ ...error, path: error.path.replace('/values/', '/initial_values/') })), ...(plan?.errors ?? []), ...prepared.errors];
  if (!dayMode && !draft.slots.some((slot) => slot.id === slotId)) errors.push({ key: 'simulationChooseSlot', path: '/slot_id' });
  const collector = new TraceCollector(draft, t, { standalone: !dayMode });
  let runtime, state = input, eventValues = {}, reservations = [], unmodeled = false, errorContext = null, cancelled = false;
  if (!errors.length) try {
    const program = simulationProgram(draft, dayMode ? { sequenceId, position } : { slotId });
    runtime = new Runtime({ program, initialState: input, initialValues: baseline, progressBindings: prepared.bindings, diagnostics: true, unhandledTasks: 'record', seed, yieldEvery: 16,
      decisions: {
        occurs: (event) => choices[event.id] === true,
        chooseDay: (event, candidates) => dayChoices[event.id] ?? candidates[0].dayId,
      },
    });
    runtime.on('diagnostic', (record) => collector.accept(record));
    const abort = () => { void runtime.pause().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) cancelled = true;
      else if (dayMode) {
        for (const event of plan.probabilityEvents) collector.trace.push({ kind: 'message', label: `${eventGroupName(event, draft.days)}: ${t(choices[event.id] === true ? 'eventOccursYes' : 'eventOccursNo')} (${t('manualProbabilityDecision')})` });
        for (const layer of plan.layers.filter((layer) => layer.type === 'event')) {
          const event = plan.eventDayOptions.find((item) => item.id === layer.groupId);
          if (event.sourceMode && event.sourceMode !== 'fixed') collector.trace.push({ kind: 'message', label: `${layer.name}: ${t('simulationChosenDay')} → ${draft.days.find((day) => day.id === layer.dayId)?.name ?? t('unassigned')}` });
        }
        await runtime.startDay({ sequence: sequenceId, position: plan.executionPosition });
        if (!signal?.aborted) await runtime.resume();
      } else { await runtime.startSlot({ slot: slotId }); if (!signal?.aborted) await runtime.resume(); }
      cancelled ||= signal?.aborted === true;
    } finally { signal?.removeEventListener('abort', abort); }
  } catch (error) {
    errors.push(...(error.issues?.length ? error.issues : [mappedError(error)]));
    if (runtime) { const context = runtime.getState().execution?.assignment; if (context) errorContext = { ...context, phase: phaseLabel({ ...context, ...runtime.getState().execution.phases[runtime.getState().execution.phaseIndex], phase: runtime.getState().execution.phases[runtime.getState().execution.phaseIndex]?.name }, t), name: context.name, slotName: draft.slots.find((slot) => slot.id === context.slotRef)?.name ?? '' }; }
  }
  if (runtime) {
    const result = runtime.getState(); state = result.variables; eventValues = result.events; unmodeled = result.unmodeled;
    reservations = result.reservations.map((item) => { const date = positionDate(item.position); return { id: item.id, sequence_id: item.sequenceRef, kind: 'once', display_name: item.event.display_name || draft.days.find((day) => day.id === eventDayCandidates(item.event)[0]?.dayId)?.name || '', icon: 'tabler:calendar-event', target_position: item.position, start: { week_number: date.week, weekday: date.weekday }, priority: item.event.priority, execution_mode: item.event.executionMode, ...eventDaySourceToData(item.event) }; });
  }
  return { ...(dayMode ? { kind: 'day', sequenceId, position, plan, input, bindings: prepared.bindings } : { slotId }), engine: 'runtime', seed, trace: collector.trace, calls: collector.calls, state, eventValues, reservations, unmodeled, errors, errorContext, cancelled, changes: Object.keys(input).filter((id) => !Object.is(input[id], state[id])).map((id) => ({ id, name: nodePath(draft.operandNodes, id), before: input[id], after: state[id] })) };
}

export function simulateSlot(draft, slotId, values = simulationInitialValues(draft), baseline = simulationInitialValues(draft), t = translator('en'), seed = '1', { signal } = {}) { return execute(draft, { slotId, values, baseline, t, seed, signal }); }
export function simulateSequenceDay(draft, sequenceId, position, values = simulationInitialValues(draft), baseline = simulationInitialValues(draft), t = translator('en'), bindings = {}, choices = {}, seed = '1', dayChoices = {}, { signal } = {}) { return execute(draft, { sequenceId, position, values, baseline, t, bindings, choices, seed, dayChoices, signal }); }
