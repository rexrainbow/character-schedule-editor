import SimulationVariableInputs from '../components/SimulationVariableInputs.jsx';
import Trace from '../components/SimulationTrace.jsx';
import SimulationReservations from '../components/SimulationReservations.jsx';
import { eventDayCandidates } from '../../core/eventDaySource.js';
import { eventKind } from '../../core/eventReferences.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Play, RotateCcw, Check } from 'lucide-react';
import { isComputed, nodePath } from '../../core/operandModel.js';
import { Issues } from '../components/ui.jsx';
import { evaluateSimulationExpressions, simulateSlot, simulationInitialValues, simulationValueErrors } from '../../simulation/index.js';
import { daySimulationPlan, prepareDayValues, simulateSequenceDay } from '../../simulation/index.js';
import { sequenceRange } from '../../core/sequenceRange.js';
import { DaySimulationControls, DaySimulationPlan, ProgressBindings } from '../components/DaySimulationControls.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import { eventGroupName } from '../../core/sequenceEvents.js';

const display = (value) => typeof value === 'string' ? JSON.stringify(value) : String(value);

export default function SimulationEditor({ draft, session, onSessionChange, onOpenSlot, onOpenDay, onOpenSequence, t }) {
  const current = session ?? {}, seed = current.randomSeed ?? '1', initial = useMemo(() => simulationInitialValues(draft), [draft]);
  const rawValues = useMemo(() => Object.fromEntries(Object.keys(initial).map((id) => [id, Object.hasOwn(current.values ?? {}, id) ? current.values[id] : initial[id]])), [initial, current.values]);
  const dayMode = current.target === 'day', sequence = draft.sequences.find((item) => item.id === current.sequenceId) ?? draft.sequences[0];
  const position = current.position ?? (sequence ? sequenceRange(sequence).start : 0);
  const choiceKey = `${sequence?.id}:${position}`, choices = current.probabilityChoices?.[choiceKey] ?? {};
  const savedDayChoices = current.eventDayChoices?.[choiceKey] ?? {};
  const dayChoices = Object.fromEntries((sequence?.eventGroups ?? []).filter((group) => eventDayCandidates(group).some((item) => item.dayId === savedDayChoices[group.id])).map((group) => [group.id, savedDayChoices[group.id]]));
  const plan = useMemo(() => daySimulationPlan(draft, sequence?.id, position, t, choices, dayChoices), [draft, sequence, position, t, choices, dayChoices]);
  const prepared = useMemo(() => prepareDayValues(draft, plan, rawValues, current.progressBindings), [draft, plan, rawValues, current.progressBindings]);
  const values = dayMode ? prepared.values : rawValues, boundIds = new Set(dayMode ? Object.values(prepared.bindings).filter(Boolean) : []);
  function openSlot(id) { const slot = draft.slots.find((item) => item.id === id); if (slot) onOpenSlot(slot); }
  function openDay(id) { const day = draft.days.find((item) => item.id === id), row = sequence?.rows[plan.rowIndex], week = draft.weeks.find((item) => item.id === row?.weekId); if (day) onOpenDay(day, week, plan.weekday); }
  const selected = draft.slots.find((slot) => slot.id === current.slotId) ?? draft.slots[0];
  const slotChoices = draft.slots.filter((slot) => slot.id === selected?.id || slot.name.toLocaleLowerCase().includes((current.slotSearch ?? '').toLocaleLowerCase()));
  const result = current.result, mobilePanel = current.panel ?? 'inputs', resultTab = current.resultTab ?? 'trace';
  const valueErrors = useMemo(() => [...simulationValueErrors(draft, values), ...(dayMode ? [...plan.errors, ...prepared.errors] : [])], [draft, values, dayMode, plan, prepared]);
  const computed = useMemo(() => evaluateSimulationExpressions(draft, values), [draft, values]);
  function updateValue(id, value) { onSessionChange({ values: { ...values, [id]: value }, result: null }); }
  const [running, setRunning] = useState(false), [cancelled, setCancelled] = useState(false);
  const activeRun = useRef(null), latestInput = useRef(''), latestDraft = useRef(draft);
  const inputKey = JSON.stringify({ slot: selected?.id, sequence: sequence?.id, position, target: current.target, values, bindings: current.progressBindings, choices, dayChoices, seed });
  latestInput.current = inputKey; latestDraft.current = draft;
  useEffect(() => {
    const operation = activeRun.current;
    if (operation && (operation.draft !== draft || operation.inputKey !== inputKey)) { activeRun.current = null; operation.controller.abort(); setRunning(false); }
    setCancelled(false);
  }, [draft, inputKey]);
  useEffect(() => () => { const operation = activeRun.current; activeRun.current = null; operation?.controller.abort(); }, []);
  function cancelRun() { const operation = activeRun.current; activeRun.current = null; operation?.controller.abort(); setRunning(false); setCancelled(true); }
  async function run() {
    if (activeRun.current) return;
    const operation = { controller: new AbortController(), draft, inputKey }; activeRun.current = operation;
    setRunning(true); setCancelled(false); onSessionChange({ result: null, panel: 'results' });
    try {
      const options = { signal: operation.controller.signal };
      const result = await (dayMode ? simulateSequenceDay(draft, sequence?.id, position, values, initial, t, current.progressBindings, choices, seed, dayChoices, options) : simulateSlot(draft, selected?.id, values, initial, t, seed, options));
      if (activeRun.current === operation && latestInput.current === operation.inputKey && latestDraft.current === operation.draft && !operation.controller.signal.aborted) onSessionChange({ result, panel: 'results' });
    } finally { if (activeRun.current === operation) { activeRun.current = null; setRunning(false); } }
  }
  const targetControl = <label>{t('simulationTarget')}<select aria-label={t('simulationTarget')} value={dayMode ? 'day' : 'slot'} onChange={(e) => onSessionChange({ target: e.target.value, result: null })}><option value="slot">{t('simulationSlot')}</option><option value="day">{t('simulationSequenceDay')}</option></select></label>;
  return <main className="simulation-editor" data-engine="runtime">
    <div className="simulation-target">{dayMode ? <DaySimulationControls targetControl={targetControl} draft={draft} sequence={sequence} position={position} plan={plan} onChange={onSessionChange} onOpenSequence={onOpenSequence} t={t} /> : targetControl}</div>
    <div className="simulation-toolbar">{!dayMode && <><label>{t('simulationSlot')}<div className="simulation-slot-controls"><input type="search" aria-label={t('simulationSearchSlots')} placeholder={t('simulationSearchSlots')} value={current.slotSearch ?? ''} onChange={(e) => onSessionChange({ slotSearch: e.target.value })} /><select aria-label={t('simulationSlot')} value={selected?.id ?? ''} onChange={(e) => onSessionChange({ slotId: e.target.value, slotSearch: '', result: null })}><option value="" disabled>{t('simulationChooseSlot')}</option>{slotChoices.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></div></label>{selected && <button className="icon-button" title={t('openSlotEditor')} aria-label={t('openSlotEditor')} onClick={() => onOpenSlot(selected)}><ExternalLink size={16} /></button>}</>}<button className="button primary" disabled={running || (dayMode ? !sequence?.rows.length : !selected) || !!valueErrors.length} aria-busy={running} onClick={run}><Play size={16} />{t('simulationRun')}</button>{running && <button className="button secondary" onClick={cancelRun}>{t('cancel')}</button>}<button className="button secondary" onClick={() => onSessionChange({ values: structuredClone(initial), result: null, panel: 'inputs' })}><RotateCcw size={16} />{t('simulationReset')}</button><button className="button secondary" disabled={running || !result || !!result.errors.length || result.cancelled} onClick={() => onSessionChange({ values: structuredClone(result.state), result: null, panel: 'inputs' })}><Check size={16} />{t('simulationApply')}</button></div>
    <div className="simulation-mobile-tabs" role="tablist" aria-label={t('simulationWorkspace')}>{['inputs', 'results'].map((panel) => <button role="tab" key={panel} aria-selected={mobilePanel === panel} onClick={() => onSessionChange({ panel })}>{t(panel === 'inputs' ? 'simulationInputs' : 'simulationResults')}</button>)}</div>
    <div className="simulation-columns"><section className={`simulation-inputs simulation-pane ${mobilePanel === 'inputs' ? 'mobile-active' : ''}`}><h2>{t('simulationInputs')}</h2>{dayMode && !!plan.eventDayOptions?.length && <section className="simulation-probability-events"><h3>{t('simulationEventDays')}</h3><p className="field-hint">{t('simulationEventDaysHint')}</p>{plan.eventDayOptions.map((group) => {
        const options = eventDayCandidates(group), probability = eventKind(group) === 'probability', name = eventGroupName(group, draft.days);
        return <div className="simulation-event-choice" key={group.id}>
          <span className="entity-name"><SlotIcon name={group.icon} />{name}</span>
          {probability && <label><input type="checkbox" aria-label={`${t('simulationOccurrenceChoice')}: ${name}`} checked={choices[group.id] === true} onChange={(event) => onSessionChange({ probabilityChoices: { ...current.probabilityChoices, [choiceKey]: { ...choices, [group.id]: event.target.checked } }, result: null })} />{t('eventOccursYes')}</label>}
          {options.length > 1 ? <label>{t('simulationChosenDay')}<select aria-label={`${t('simulationChosenDay')}: ${name}`} disabled={probability && choices[group.id] !== true} value={dayChoices[group.id] ?? options[0]?.dayId ?? ''} onChange={(event) => onSessionChange({ eventDayChoices: { ...current.eventDayChoices, [choiceKey]: { ...dayChoices, [group.id]: event.target.value } }, result: null })}>{options.map((item) => <option key={item.dayId} value={item.dayId}>{draft.days.find((day) => day.id === item.dayId)?.name ?? t('unassigned')}</option>)}</select></label> : <span className="entity-name"><SlotIcon name={draft.days.find((day) => day.id === options[0]?.dayId)?.icon} />{draft.days.find((day) => day.id === options[0]?.dayId)?.name ?? t('unassigned')}</span>}
        </div>;
      })}</section>}{dayMode && <ProgressBindings draft={draft} current={current} prepared={prepared} onChange={onSessionChange} t={t} />}<p className="field-hint">{t('simulationInputHint')}</p>{!!valueErrors.length && <Issues errors={valueErrors} t={t} />}<SimulationVariableInputs draft={draft} values={values} errors={valueErrors} boundIds={boundIds} onChange={updateValue} t={t} />
      <section><h3>{t('expressions')}</h3>{Object.entries(draft.operandNodes).filter(([, node]) => isComputed(node)).map(([id, node]) => <div className="simulation-computed" key={id}><span>{node.display_name}</span><output aria-label={node.display_name}>{computed[id]?.error ? t(computed[id].error.key, { field: computed[id].error.field }) : display(computed[id]?.value)}</output></div>)}</section>
      <p className="field-hint">{t('simulationBaselineHint')}</p><label className="simulation-seed">{t('simulationRandomSeed')}<input aria-label={t('simulationRandomSeed')} value={seed} onChange={(event) => onSessionChange({ randomSeed: event.target.value, result: null })} /><span className="field-hint">{t('simulationRandomSeedHint')}</span></label></section>
      <section className={`simulation-results simulation-pane ${mobilePanel === 'results' ? 'mobile-active' : ''}`}><h2>{t('simulationResults')}</h2><div role="tablist" aria-label={t('simulationResultTabs')}>{['trace', 'changes'].map((tab) => <button className="button secondary" role="tab" key={tab} aria-selected={resultTab === tab} onClick={() => onSessionChange({ resultTab: tab })}>{t(tab === 'trace' ? 'simulationTrace' : 'simulationChanges')}</button>)}</div>
        {dayMode && <DaySimulationPlan plan={plan} onOpenDay={openDay} onOpenSlot={openSlot} t={t} />}{!result ? <p className="field-hint" role="status">{t(running ? 'simulationRunning' : cancelled ? 'simulationCancelled' : dayMode ? 'simulationDayReady' : 'simulationReady')}</p> : <><p role="status">{t(result.errors.length ? 'simulationFailed' : 'simulationFinished', { count: result.calls.length })}</p>{result.unmodeled && <p className="shared-warning">{t('simulationAssumption')}</p>}{result.errorContext && <p className="shared-warning">{result.errorContext.phase} / {result.errorContext.name} / {result.errorContext.slotName}</p>}{!!result.errors.length && <Issues errors={result.errors} t={t} />}<SimulationReservations reservations={result.reservations} days={draft.days} t={t} />{resultTab === 'trace' ? <Trace events={result.trace} t={t} onOpenSlot={openSlot} onOpenDay={openDay} /> : result.changes.length ? <table className="simulation-change-table"><thead><tr><th>{t('nodeName')}</th><th>{t('simulationBefore')}</th><th>{t('simulationAfter')}</th></tr></thead><tbody>{result.changes.map((change) => <tr key={change.id}><td>{change.name}</td><td>{display(change.before)}</td><td>{display(change.after)}</td></tr>)}</tbody></table> : <p>{t('simulationNoChanges')}</p>}</>}
      </section></div>
  </main>;
}
