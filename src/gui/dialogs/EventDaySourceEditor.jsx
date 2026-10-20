import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, X, ChevronDown, ChevronUp, AlertTriangle, ExternalLink } from 'lucide-react';
import { EVENT_DAY_SOURCE_MODES, eventDaySourceMode, eventDayCandidates, eventDaySourceErrors } from '../../core/eventDaySource.js';
import EventDayPicker from './EventDayPicker.jsx';
import SlotIcon from '../components/SlotIcon.jsx';

export default function EventDaySourceEditor({ group, days, onChange, onModeChange, onView, allowedModes = EVENT_DAY_SOURCE_MODES, defaultPurpose = (group.executionMode ?? 'overlay') === 'overlay' ? 'overlay' : 'interrupt', t }) {
  const mode = eventDaySourceMode(group), candidates = eventDayCandidates(group);
  const hasErrors = eventDaySourceErrors(group, days, '').length > 0;
  const [expanded, setExpanded] = useState(hasErrors);
  useEffect(() => { if (hasErrors) setExpanded(true); }, [hasErrors]);
  const lookup = new Map(days.map((day) => [day.id, day]));
  const total = Math.max(...candidates.map((item) => item.weight || 0), 1);
  const sum = candidates.reduce((sum, item) => sum + (item.weight || 0) / total, 0);
  function update(items) { onChange({ dayCandidates: items }); }
  function move(index, delta) { const items = [...candidates]; [items[index], items[index + delta]] = [items[index + delta], items[index]]; update(items); }
  function pick(dayId) {
    const first = lookup.get(dayId);
    onChange({ dayId, ...(!group.display_name?.trim() && first ? { display_name: first.name, icon: first.icon } : {}) });
  }
  return <section className="event-day-source">
    <div className="event-day-source-heading">
    <button type="button" className="event-day-source-toggle" aria-label={t('eventDaySource')} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}<strong>{t('eventDaySource')}</strong>
      <span>{t(`eventSource_${mode}`)}</span>
      {mode === 'fixed' ? <span className="entity-name"><SlotIcon name={lookup.get(group.dayId)?.icon} />{lookup.get(group.dayId)?.name || t('unassigned')}</span> : <span>{t('eventCandidateCount', { count: candidates.length })}</span>}
      {hasErrors && <span className="event-source-error"><AlertTriangle size={15} />{t('eventSourceNeedsAttention')}</span>}
    </button>
    {onView && <button type="button" className="icon-button event-source-view" title={t('viewEventCandidates')} aria-label={t('viewEventCandidates')} disabled={!candidates.length || candidates.some((item) => !lookup.has(item.dayId))} onClick={(event) => onView(event.currentTarget)}><ExternalLink size={16} /></button>}
    </div>
    {expanded && <div className="event-day-source-body">
    <label>{t('eventDaySource')}<select aria-label={t('eventDaySource')} value={mode} onChange={(e) => onModeChange(e.target.value)}>{allowedModes.map((value) => <option key={value} value={value}>{t(`eventSource_${value}`)}</option>)}</select></label>
    {mode === 'fixed' ? <EventDayPicker days={days} value={group.dayId} defaultPurpose={defaultPurpose} t={t} onChange={pick} /> : <>
      <EventDayPicker days={days} multiple defaultPurpose={defaultPurpose} value={candidates.map((item) => item.dayId)} label={t('eventCandidateDays')} t={t} onChange={(ids) => {
        const items = [...candidates.filter((item) => ids.includes(item.dayId)), ...ids.filter((id) => !candidates.some((item) => item.dayId === id)).map((dayId) => ({ dayId, weight: 1 }))];
        const first = lookup.get(items[0]?.dayId);
        onChange({ dayCandidates: items, ...(!group.display_name?.trim() && first ? { display_name: first.name, icon: first.icon } : {}) });
      }} />
      <div className="event-day-candidates">{candidates.map((item, index) => {
        const day = lookup.get(item.dayId), name = day?.name || t('unassigned');
        return <div className="event-day-candidate" key={item.dayId}>
          {mode === 'sequential' && <span>{index + 1}</span>}<span className="entity-name"><SlotIcon name={day?.icon} /><strong>{name}</strong></span>
          {mode === 'random' ? <span className="event-candidate-weight"><label>{t('eventWeight')}<input type="number" min="0" step="any" aria-label={`${t('eventWeight')}: ${name}`} value={Number.isNaN(item.weight) ? '' : item.weight} onChange={(e) => update(candidates.map((entry, i) => i === index ? { ...entry, weight: e.target.value === '' ? NaN : e.target.valueAsNumber } : entry))} /></label><output>{item.weight > 0 && sum > 0 ? `${(item.weight / total / sum * 100).toFixed(1)}%` : '—'}</output></span> : <span className="row-actions">{[-1, 1].map((delta) => { const Icon = delta === -1 ? ArrowUp : ArrowDown; return <button type="button" className="icon-button" key={delta} disabled={index + delta < 0 || index + delta >= candidates.length} aria-label={`${t(delta === -1 ? 'eventCandidateUp' : 'eventCandidateDown')}: ${name}`} onClick={() => move(index, delta)}><Icon size={15} /></button>; })}</span>}
          <button type="button" className="icon-button" aria-label={`${t('eventRemoveCandidate')}: ${name}`} onClick={() => update(candidates.filter((_, i) => i !== index))}><X size={15} /></button>
        </div>;
      })}</div><p className="field-hint">{t(mode === 'random' ? 'eventRandomSourceHint' : 'eventSequentialSourceHint')}</p>
    </>}
    </div>}
  </section>;
}
