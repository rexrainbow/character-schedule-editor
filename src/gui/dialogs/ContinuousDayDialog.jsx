import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog, Issues } from '../components/ui.jsx';
import SimulationTrace from '../components/SimulationTrace.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import { nodePath } from '../../core/operandModel.js';
import { replayContinuousDay } from '../../simulation/continuous.js';
import { builtinTaskDefinition } from '../../core/builtinTaskModel.js';

export const showValue = (value) => typeof value === 'string' ? JSON.stringify(value) : String(value);
export const deltaText = (before, after) => typeof before === 'number' && typeof after === 'number' ? `${after - before >= 0 ? '+' : ''}${Number((after - before).toFixed(8))}` : '—';
export default function ContinuousDayDialog({ draft, result, day, onClose, onOpenDay, onOpenSlot, t }) {
  const [trace, setTrace] = useState(null), [view, setView] = useState('summary'), [loading, setLoading] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  async function inspect() {
    if (controller.current) return;
    const operation = new AbortController(); controller.current = operation;
    setLoading(true); setView('trace');
    try { const replay = await replayContinuousDay(draft, result, day, t, { signal: operation.signal }); if (!operation.signal.aborted) setTrace(replay); }
    finally { if (controller.current === operation) { controller.current = null; setLoading(false); } }
  }
  const openDay = (id) => { const definition = draft.days.find((item) => item.id === id), sequence = draft.sequences.find((item) => item.id === result.sequenceId), week = draft.weeks.find((item) => item.id === sequence?.rows[day.rowIndex]?.weekId); onClose(); if (definition) onOpenDay(definition, week, day.weekday); }, openSlot = (value) => { const slot = typeof value === 'string' ? draft.slots.find((item) => item.id === value) : value; onClose(); if (slot) onOpenSlot(slot); };
  const name = (id) => nodePath(draft.operandNodes, id);
  const taskName = (symbol) => draft.tasks.find((item) => item.symbol === symbol)?.display_name ?? Object.keys(result.program.builtins).map((key) => builtinTaskDefinition(key, draft.builtinTasks, t)).find((item) => (item.symbol || item.builtin) === symbol)?.display_name ?? (['increment_variable', 'set_variable', 'toggle_variable', 'reset_variable', 'release_slot', 'schedule_event', 'adjust_probability_event'].includes(symbol) ? builtinTaskDefinition(symbol, draft.builtinTasks, t).display_name : symbol);
  const changed = Object.keys(day.after).filter((id) => !Object.is(day.before[id], day.after[id]));
  const valuesTable = (ids) => <table className="simulation-change-table"><thead><tr><th>{t('nodeName')}</th><th>{t('simulationBefore')}</th><th>{t('simulationAfter')}</th><th>{t('continuousDelta')}</th></tr></thead><tbody>{ids.map((id) => <tr key={id}><td>{name(id)}</td><td>{showValue(day.before[id])}</td><td>{showValue(day.after[id])}</td><td>{deltaText(day.before[id], day.after[id])}</td></tr>)}</tbody></table>;
  return <Dialog title={t('continuousDayTitle', { day: day.dayNumber })} subtitle={`${t('weekNumber', { count: day.weekNumber })} / ${t(day.weekday)} · ${t('continuousIteration', { row: day.rowIndex + 1, count: day.iteration })}`} t={t} wide className="continuous-day-dialog" onClose={onClose} footer={<><button className="button secondary" disabled={loading} onClick={view === 'trace' ? () => setView('summary') : inspect}>{t(view === 'trace' ? 'continuousBackSummary' : 'continuousInspect')}</button><button className="button secondary" onClick={onClose}>{t('close')}</button></>}>
    {view === 'trace' ? loading ? <p role="status">{t('simulationRunning')}</p> : trace && <><Issues errors={trace.errors} t={t} /><SimulationTrace events={trace.trace} t={t} onOpenDay={openDay} onOpenSlot={openSlot} /></> : <>
      <h3>{t('continuousSources')}</h3><ol className="continuous-source-list">{day.sources.map((source) => { const group = draft.sequences.flatMap((sequence) => sequence.eventGroups ?? []).find((item) => item.id === source.eventRef), definition = draft.days.find((item) => item.id === source.dayRef); return <li key={source.occurrenceId}><SlotIcon name={group?.icon ?? definition?.icon} /><span><strong>{source.name}</strong><small>{source.type === 'main' ? t('simulationMainDay') : `${t('eventPriority')}: ${source.priority} · ${t(`executionMode_${source.executionMode}`)}`} · {definition?.name}</small></span><button className="icon-button" title={t('openDayEditor')} aria-label={`${t('openDayEditor')}: ${definition?.name}`} onClick={() => openDay(source.dayRef)}><ExternalLink size={15} /></button></li>; })}</ol>
      <h3>{t('simulationChanges')}</h3>{changed.length ? valuesTable(changed) : <p>{t('simulationNoChanges')}</p>}
      <h3>{t('continuousContributions')}</h3>{Object.values(day.sourceChanges).map((item, index) => <section key={index}><strong>{item.source.name || draft.days.find((entry) => entry.id === item.source.dayId)?.name}</strong><ul>{Object.values(item.changes).map((change) => <li key={change.id}>{name(change.id)}: {change.delta === undefined ? `${showValue(change.before)} → ${showValue(change.after)}` : `${change.delta >= 0 ? '+' : ''}${Number(change.delta.toFixed(8))}`} · {t('continuousWrites', { count: change.writes })}</li>)}</ul></section>)}
      <details><summary>{t('continuousTaskEffects')}</summary>{Object.values(day.taskChanges).map((item) => <section key={item.name}><strong>{taskName(item.name)}</strong><ul>{Object.values(item.changes).map((change) => <li key={change.id}>{name(change.id)}: {change.delta === undefined ? `${showValue(change.before)} \u2192 ${showValue(change.after)}` : `${change.delta >= 0 ? '+' : ''}${Number(change.delta.toFixed(8))}`} · {t('continuousWrites', { count: change.writes })}</li>)}</ul></section>)}</details>
      <h3>{t('continuousExecutionSummary')}</h3><p>{t('continuousDayCounts', { tasks: day.taskCount, skipped: day.skipped })}</p><ul>{Object.entries(day.slots).map(([id, count]) => <li key={id}>{draft.slots.find((slot) => slot.id === id)?.name} ×{count}<button className="icon-button" title={t('openSlotEditor')} aria-label={`${t('openSlotEditor')}: ${draft.slots.find((slot) => slot.id === id)?.name}`} onClick={() => openSlot(draft.slots.find((slot) => slot.id === id))}><ExternalLink size={14} /></button></li>)}</ul><details><summary>{t('continuousTaskCalls')}</summary><ul>{Object.entries(day.tasks).map(([symbol, count]) => <li key={symbol}>{taskName(symbol)} ×{count}</li>)}</ul></details>
      {!!day.reservations.length && <><h3>{t('simulationReservations')}</h3><ul>{day.reservations.map((item) => <li key={item.id}>{item.event.display_name} · {t('sequenceDayNumber', { count: item.position - result.days[0].position + 1 })}</li>)}</ul></>}
      {day.unhandled > 0 && <p className="shared-warning">{t('simulationAssumption')}</p>}
      <details><summary>{t('continuousFullSnapshot')}</summary>{valuesTable(Object.keys(day.after))}</details>
    </>}
  </Dialog>;
}
