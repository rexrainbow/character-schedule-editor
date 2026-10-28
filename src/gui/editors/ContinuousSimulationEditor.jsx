import ContinuousWeekDialog from '../dialogs/ContinuousWeekDialog.jsx';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ExternalLink, PanelLeftClose, PanelLeftOpen, Play, RotateCcw } from 'lucide-react';
import { Issues } from '../components/ui.jsx';
import SimulationVariableInputs from '../components/SimulationVariableInputs.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import ContinuousDayDialog, { showValue, deltaText } from '../dialogs/ContinuousDayDialog.jsx';
import { simulateContinuous, MAX_CONTINUOUS_DAYS } from '../../simulation/continuous.js';
import { simulationInitialValues, simulationValueErrors } from '../../simulation/inputs.js';
import { nodePath } from '../../core/operandModel.js';
import { progressBindings } from '../../simulation/planning.js';

const ContinuousTrendCharts = lazy(() => import('../components/ContinuousTrendCharts.jsx'));
const PAGE_SIZE = 14;
export default function ContinuousSimulationEditor({ draft, session = {}, onSessionChange, onOpenDay, onOpenSlot, onOpenSequence, t }) {
  const inputsId = useId(), collapseButton = useRef(null), expandButton = useRef(null), focusToggle = useRef(false);
  const inputsCollapsed = session.inputsCollapsed ?? false;
  useEffect(() => { if (focusToggle.current) { focusToggle.current = false; (inputsCollapsed ? expandButton : collapseButton).current?.focus(); } }, [inputsCollapsed]);
  function toggleInputs(value) { focusToggle.current = true; onSessionChange({ inputsCollapsed: value }); }
  const initial = useMemo(() => simulationInitialValues(draft), [draft]);
  const values = useMemo(() => Object.fromEntries(Object.keys(initial).map((id) => [id, Object.hasOwn(session.values ?? {}, id) ? session.values[id] : initial[id]])), [initial, session.values]);
  const boundIds = useMemo(() => new Set(Object.values(progressBindings(draft)).filter(Boolean)), [draft]);
  const sequenceId = session.sequenceId ?? draft.sequences[0]?.id ?? '', days = session.days ?? 28, seed = session.seed ?? '1';
  const sequence = draft.sequences.find((item) => item.id === sequenceId);
  const [openedWeek, setOpenedWeek] = useState(null);
  const [running, setRunning] = useState(false), [openedDay, setOpenedDay] = useState(null), [page, setPage] = useState(0);
  const active = useRef(null), latest = useRef(null);
  const inputKey = JSON.stringify({ sequenceId, days, seed, values }); latest.current = { draft, inputKey };
  const errors = simulationValueErrors(draft, values);
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_CONTINUOUS_DAYS) errors.push({ path: '/days', key: 'continuousDaysError' });
  const result = session.result, view = session.view ?? 'days';
  const columns = (session.columns ?? Object.keys(initial).filter((id) => draft.operandNodes[id].value_type === 'number' && !boundIds.has(id)).slice(0, 3)).filter((id) => Object.hasOwn(initial, id));
  useEffect(() => {
    const operation = active.current;
    if (operation && (operation.draft !== draft || operation.inputKey !== inputKey)) { active.current = null; operation.controller.abort(); setRunning(false); }
    setOpenedDay(null); setOpenedWeek(null);
  }, [draft, inputKey]);
  useEffect(() => () => { const operation = active.current; active.current = null; operation?.controller.abort(); }, []);
  function edit(update) { onSessionChange({ ...update, result: null }); setPage(0); }
  async function run() {
    if (active.current) return;
    const operation = { draft, inputKey, controller: new AbortController() }; active.current = operation;
    const current = () => active.current === operation && latest.current.draft === draft && latest.current.inputKey === inputKey;
    setRunning(true); setOpenedDay(null); setOpenedWeek(null); setPage(0); onSessionChange({ result: null, panel: 'results' });
    try {
      const result = await simulateContinuous(draft, { sequenceId, days, seed, values, signal: operation.controller.signal, onDay: (result) => { if (current()) onSessionChange({ result }); } });
      if (current()) onSessionChange({ result });
    } finally { if (active.current === operation) { active.current = null; setRunning(false); } }
  }
  const cancel = () => { active.current?.controller.abort(); };
  const panel = session.panel ?? 'inputs';
  const rows = view === 'weeks' ? result?.weeks ?? [] : result?.days ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1);
  const summary = result?.days.reduce((counts, day) => ({ events: counts.events + day.events.length, tasks: counts.tasks + day.taskCount }), { events: 0, tasks: 0 });
  const selected = openedDay === null ? null : result?.days[openedDay];
  const eventIcon = (event) => draft.sequences.flatMap((sequence) => sequence.eventGroups ?? []).find((group) => group.id === event.eventRef)?.icon ?? draft.days.find((day) => day.id === event.dayRef)?.icon;
  return <main className="simulation-editor continuous-simulation-editor" data-engine="runtime">
    <div className="simulation-toolbar"><label>{t('simulationSequence')}<select aria-label={t('simulationSequence')} value={sequenceId} onChange={(event) => edit({ sequenceId: event.target.value })}><option value="" disabled>{t('simulationChooseSequence')}</option>{draft.sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></label>
      <button className="icon-button continuous-open-sequence" title={t('continuousReturnToSequence')} aria-label={t('continuousReturnToSequence')} disabled={!sequence} onClick={() => onOpenSequence(sequence)}><ExternalLink size={17} /></button>
      <label className="continuous-days-field">{t('continuousDays')}<input type="number" min="1" max={MAX_CONTINUOUS_DAYS} step="1" aria-label={t('continuousDays')} aria-invalid={!Number.isSafeInteger(days) || days < 1 || days > MAX_CONTINUOUS_DAYS} value={Number.isNaN(days) ? '' : days} onChange={(event) => edit({ days: event.target.value === '' ? NaN : event.target.valueAsNumber })} /></label>
      <button className="button primary" aria-busy={running} disabled={running || !sequenceId || !!errors.length} onClick={run}><Play size={16} />{t('continuousRun')}</button>{running && <button className="button secondary" onClick={cancel}>{t('cancel')}</button>}<button className="button secondary" disabled={running} onClick={() => edit({ values: initial })}><RotateCcw size={16} />{t('simulationReset')}</button>
    </div>
    <div className="simulation-mobile-tabs" role="tablist" aria-label={t('simulationWorkspace')}>{['inputs', 'results'].map((key) => <button role="tab" key={key} aria-selected={panel === key} onClick={() => onSessionChange({ panel: key })}>{t(key === 'inputs' ? 'simulationInputs' : 'simulationResults')}</button>)}</div>
    <div className={`simulation-columns continuous-columns ${inputsCollapsed ? 'inputs-collapsed' : ''}`}><div className="continuous-input-rail"><button ref={expandButton} className="icon-button" aria-label={t('continuousExpandInputs')} title={t('continuousExpandInputs')} aria-expanded="false" aria-controls={inputsId} onClick={() => toggleInputs(false)}><PanelLeftOpen size={18} /></button></div><section id={inputsId} className={`simulation-inputs simulation-pane ${panel === 'inputs' ? 'mobile-active' : ''}`}><div className="continuous-input-heading"><h2>{t('simulationInputs')}</h2><button ref={collapseButton} className="icon-button continuous-collapse-inputs" aria-label={t('continuousCollapseInputs')} title={t('continuousCollapseInputs')} aria-expanded="true" aria-controls={inputsId} onClick={() => toggleInputs(true)}><PanelLeftClose size={18} /></button></div><p className="field-hint">{t('continuousHint')}</p><Issues errors={errors} t={t} /><SimulationVariableInputs draft={draft} values={values} errors={errors} boundIds={boundIds} onChange={(id, value) => edit({ values: { ...values, [id]: value } })} t={t} />
      <details className="continuous-column-options"><summary>{t('continuousColumns')}</summary>{Object.keys(initial).map((id) => <label key={id}><input type="checkbox" checked={columns.includes(id)} disabled={!columns.includes(id) && columns.length >= 6} onChange={(event) => onSessionChange({ columns: event.target.checked ? [...columns, id] : columns.filter((key) => key !== id) })} />{nodePath(draft.operandNodes, id)}</label>)}<p className="field-hint">{t('continuousColumnsHint')}</p></details>
      <label className="simulation-seed">{t('simulationRandomSeed')}<input aria-label={t('simulationRandomSeed')} value={seed} onChange={(event) => edit({ seed: event.target.value })} /><span className="field-hint">{t('continuousSeedHint')}</span></label>
    </section><section className={`simulation-results simulation-pane ${panel === 'results' ? 'mobile-active' : ''}`}><h2>{t('simulationResults')}</h2>
      <p role="status">{running ? t('continuousProgress', { count: result?.days.length ?? 0, total: days }) : result ? t(result.status === 'failed' ? 'continuousFailed' : result.status === 'completed' ? 'continuousFinished' : 'continuousCancelled', { count: result.days.length }) : t('continuousReady')}</p>
      {result && <><p>{t('continuousTotals', { events: summary.events, tasks: summary.tasks })}{result.reachedEnd && ` · ${t('continuousReachedEnd')}`}</p>{result.unmodeled && <p className="shared-warning">{t('simulationAssumption')}</p>}<Issues errors={result.errors} t={t} />
        <div role="tablist" aria-label={t('continuousResultTabs')}>{['days', 'weeks', 'trends'].map((key) => <button className="button secondary" role="tab" key={key} aria-selected={view === key} onClick={() => { onSessionChange({ view: key }); setPage(0); }}>{t(key === 'days' ? 'continuousDaily' : key === 'weeks' ? 'continuousWeekly' : 'continuousTrends')}</button>)}</div>
        {view === 'trends' ? <Suspense fallback={<p role="status">{t('trendLoading')}</p>}><ContinuousTrendCharts result={result} draft={draft} nodes={draft.operandNodes} selectedEvents={session.trendEvents ?? []} eventColors={session.trendEventColors ?? {}} onEventsChange={(trendEvents) => onSessionChange({ trendEvents })} onColorChange={(id, color) => onSessionChange({ trendEventColors: { ...session.trendEventColors, [id]: color } })} onOpenDay={(dayNumber) => { const index = result.days.findIndex((day) => day.dayNumber === dayNumber); if (index >= 0) setOpenedDay(index); }} selectedIds={session.trendVariables ?? columns.filter((id) => draft.operandNodes[id]?.value_type === 'number')} onSelectChange={(trendVariables) => onSessionChange({ trendVariables })} t={t} /></Suspense> : <>
        <table className="simulation-change-table continuous-history-table"><thead><tr><th>{t(view === 'days' ? 'reportDate' : 'continuousWeekly')}</th><th>{t('eventGroups')}</th>{columns.map((id) => <th key={id}>{nodePath(draft.operandNodes, id)}</th>)}</tr></thead><tbody>{rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((item, offset) => view === 'days' ? <tr key={item.position}><td><button className="continuous-date-button" onClick={() => setOpenedDay(currentPage * PAGE_SIZE + offset)}>{t('sequenceDayNumber', { count: item.dayNumber })}<small>{t('weekNumber', { count: item.weekNumber })} / {t(item.weekday)}</small></button></td><td><div className="continuous-event-chips">{item.events.slice(0, 2).map((event) => <span className="entity-name" key={event.occurrenceId}><SlotIcon name={eventIcon(event)} /><span>{event.name}</span></span>)}{item.events.length > 2 && <button className="button secondary" aria-label={t('eventMore', { count: item.events.length - 2 })} onClick={() => setOpenedDay(currentPage * PAGE_SIZE + offset)}>+{item.events.length - 2}</button>}{!item.events.length && '—'}</div></td>{columns.map((id) => <td key={id}>{showValue(item.after[id])}<small className="continuous-delta">{deltaText(item.before[id], item.after[id])}</small></td>)}</tr> : <tr key={item.weekNumber}><td><button className="continuous-date-button" onClick={() => setOpenedWeek(item.weekNumber)}>{t('weekNumber', { count: item.weekNumber })}<small>{t('continuousDayRange', { first: item.firstDay, last: item.lastDay })}{item.partial && ` · ${t('continuousPartialWeek')}`}</small></button></td><td>{item.events}</td>{columns.map((id) => <td key={id}>{showValue(item.after[id])}<small className="continuous-delta">{deltaText(item.before[id], item.after[id])}</small></td>)}</tr>)}</tbody></table>
        <div className="continuous-pagination"><button className="button secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('continuousPrevious')}</button><span>{t('continuousPage', { page: currentPage + 1, pages })}</span><button className="button secondary" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>{t('continuousNext')}</button></div>
        </>}
      </>}
    </section></div>
    {openedWeek !== null && result?.weeks.find((week) => week.weekNumber === openedWeek) && <ContinuousWeekDialog draft={draft} week={result.weeks.find((week) => week.weekNumber === openedWeek)} t={t} onClose={() => setOpenedWeek(null)} onInspect={() => { const week = result.weeks.find((item) => item.weekNumber === openedWeek); setOpenedWeek(null); setOpenedDay(result.days.findIndex((day) => day.dayNumber === week.lastDay)); }} />}
    {selected && <ContinuousDayDialog draft={draft} result={result} day={selected} t={t} onClose={() => setOpenedDay(null)} onOpenDay={onOpenDay} onOpenSlot={onOpenSlot} />}
  </main>;
}
