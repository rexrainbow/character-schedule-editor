import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog } from './ui.jsx';
import SequenceDatePicker from '../dialogs/SequenceDatePicker.jsx';
import { positionDate, datePosition } from '../../core/sequenceEvents.js';
import { nodePath } from '../../core/operandModel.js';
import { PROGRESS_ROLES, PROGRESS_LABELS, progressCandidates } from '../../core/daySimulationModel.js';

export function DaySimulationControls({ draft, sequence, position, plan, onChange, onOpenSequence, t }) {
  const [calendar, setCalendar] = useState(false);
  const date = positionDate(position);
  return <>
    <div className="simulation-day-controls">
      <label>{t('simulationSequence')}<select aria-label={t('simulationSequence')} value={sequence?.id ?? ''} onChange={(e) => onChange({ sequenceId: e.target.value, position: null, result: null })}><option value="" disabled>{t('simulationChooseSequence')}</option>{draft.sequences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="button secondary" disabled={!sequence?.rows.length} onClick={() => setCalendar(true)}>{plan.errors.length ? t('simulationChooseDate') : `${t('weekNumber', { count: date.week })} / ${t(date.weekday)} · ${t('sequenceDayNumber', { count: plan.dayNumber })}`}</button>
      {sequence && <button className="icon-button" title={t('simulationOpenSequence')} aria-label={t('simulationOpenSequence')} onClick={() => onOpenSequence(sequence)}><ExternalLink size={16} /></button>}
    </div>

    {calendar && sequence && <Dialog title={t('simulationChooseDate')} t={t} wide onClose={() => setCalendar(false)}><SequenceDatePicker draft={draft} sequence={sequence} group={{ start: date, end: date, interval: 0 }} field="start" executionOnly t={t} onPick={(next) => { onChange({ position: datePosition(next), result: null }); setCalendar(false); }} /></Dialog>}
  </>;
}

export function DaySimulationPlan({ plan, onOpenDay, onOpenSlot, t }) {
  return <details className="simulation-day-plan" open><summary>{t('simulationDayPlan')}</summary><p className="field-hint">{t('simulationDayAssumption')}</p>
    {!plan.layers.length && <p>{t('simulationNoDay')}</p>}
    <ol>{plan.layers.map((layer) => <li key={layer.groupId ?? 'main'}>{layer.name} · {layer.type === 'main' ? t('simulationMainDay') : `${t('eventPriority')}: ${layer.priority}`}<button className="icon-button" aria-label={`${t('openDayEditor')}: ${layer.name}`} title={t('openDayEditor')} onClick={() => onOpenDay(layer.dayId)}><ExternalLink size={14} /></button></li>)}</ol>
    <details><summary>{t('simulationPhasePlan')}</summary>{plan.phases.map((phase) => <div key={phase.key}><strong>{phase.label}</strong>{phase.entries.length ? <ul>{phase.entries.map((entry, index) => <li key={index}>{entry.name} → {entry.slotName}<button className="icon-button" title={t('openSlotEditor')} aria-label={`${t('openSlotEditor')}: ${entry.slotName}`} onClick={() => onOpenSlot(entry.slotId)}><ExternalLink size={14} /></button></li>)}</ul> : <p className="field-hint">{t('simulationNoAssignments')}</p>}</div>)}</details>
  </details>;
}

export function ProgressBindings({ draft, current, prepared, onChange, t }) {
  const candidates = progressCandidates(draft);
  return (<details className="simulation-progress"><summary>{t('simulationProgressBindings')}</summary><p className="field-hint">{t('simulationProgressHint')}</p><div className="simulation-binding-grid">{PROGRESS_ROLES.map((role, index) => <label key={role}>{t(PROGRESS_LABELS[index])}<select aria-label={t(PROGRESS_LABELS[index])} value={prepared.bindings[role]} onChange={(e) => onChange({ progressBindings: { ...current.progressBindings, [role]: e.target.value }, result: null })}><option value="">{t('simulationNoBinding')}</option>{candidates.map(([id]) => <option key={id} value={id}>{nodePath(draft.operandNodes, id)}</option>)}</select></label>)}</div></details>);
}
