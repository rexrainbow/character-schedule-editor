import { editProject } from '../../core/projectApi.js';
import IconField from '../components/IconField.jsx';
import { eventKind, eventUsageErrors } from '../../core/eventReferences.js';
import { useRef, useState } from 'react';
import { Plus, Copy, Trash2, CalendarDays } from 'lucide-react';
import { Dialog, Issues } from '../components/ui.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import SequenceDatePicker from './SequenceDatePicker.jsx';
import { sharedDays } from '../../core/weekModel.js';
import { eventGroupErrors, eventCounts, eventSummary, eventDateLabel, eventsOnDate } from '../../core/sequenceEvents.js';
import { sequenceRange } from '../../core/sequenceRange.js';
import EventDayPicker from './EventDayPicker.jsx';
import EngineKeyField, { EngineKeysContext } from '../components/EngineKeyField.jsx';
import { engineKeyEntries } from '../../core/engineKeyModel.js';
import { eventGroupName, duplicateEventGroup } from '../../core/sequenceEvents.js';
import { availableDayTags } from '../../core/dayTags.js';

export default function SequenceEventsDialog({ draft, sequence, request, onApply, onClose, t }) {
  const [groups, setGroups] = useState(() => [...structuredClone(sequence.eventGroups ?? []), ...(request.createAt === undefined ? [] : [editProject(draft, t).sequences.events(sequence.id).newDraft(request.createAt)])]);
  const [selectedId, setSelectedId] = useState(request.createAt === undefined ? request.id : null);
  const [dateView, setDateView] = useState(null);
  const [todayOnly, setTodayOnly] = useState(request.onlyDate === true);
  const typeDrafts = useRef({});
  const days = sharedDays(draft), candidate = { ...sequence, eventGroups: groups };
  const dateMatches = todayOnly ? eventsOnDate(candidate, request.position, draft) : [];
  const retained = groups.find((group) => group.id === selectedId);
  // Keep the selected draft editable when changing its rule removes this date.
  const shown = todayOnly ? [...dateMatches, ...(retained && !dateMatches.some((group) => group.id === retained.id) ? [retained] : [])] : groups;
  const selected = shown.find((group) => group.id === selectedId) ?? (request.createAt !== undefined && !selectedId ? shown.at(-1) : shown[0]);
  const candidateDraft = { ...draft, sequences: draft.sequences.map((item) => item.id === sequence.id ? candidate : item) };
  const errors = [...eventGroupErrors(sequence, days, groups), ...eventUsageErrors(candidateDraft)];
  const stats = selected ? eventCounts(sequence, selected, draft) : null;
  const lookup = new Map(days.map((day) => [day.id, day]));
  function patch(values) { setGroups(groups.map((group) => group.id === selected.id ? { ...group, ...values } : group)); setSelectedId(selected.id); }
  function add() { const group = editProject(draft, t).sequences.events(sequence.id).newDraft(request.position); setGroups([...groups, group]); setSelectedId(group.id); setTodayOnly(false); }
  function duplicate() { const group = editProject(draft, t).sequences.events(sequence.id).duplicateDraft(selected); setGroups([...groups, group]); setSelectedId(group.id); }
  function changeKind(kind) {
    typeDrafts.current[selected.id] = { ...typeDrafts.current[selected.id], [eventKind(selected)]: structuredClone(selected) };
    const saved = typeDrafts.current[selected.id]?.[kind];
    patch(editProject(draft, t).sequences.events(sequence.id).changeKindDraft(selected, kind, saved));
  }
  function remove() { const refs = editProject(draft, t).sequences.events(sequence.id).references(selected.id); if (refs.length) { window.alert(t('eventInUse', { count: refs.length })); return; } if (window.confirm(t(eventKind(selected) === 'probability' ? 'probabilityDeleteConfirm' : 'eventDeleteConfirm', { count: stats.total }))) { setGroups(groups.filter((group) => group.id !== selected.id)); setSelectedId(null); } }
  const title = dateView ? t(dateView === 'start' ? 'eventPickStart' : 'eventPickEnd') : t('eventManager');
  const keyEntries = engineKeyEntries({ ...draft, sequences: draft.sequences.map((item) => item.id === sequence.id ? candidate : item) });
  return <EngineKeysContext.Provider value={keyEntries}><Dialog title={title} subtitle={sequence.name} wide className="event-manager-dialog" onClose={() => dateView ? setDateView(null) : onClose()} t={t} footer={dateView ? <button className="button secondary" onClick={() => setDateView(null)}>{t('back')}</button> : <><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={errors.length > 0} onClick={() => { onApply(editProject(draft, t).sequences.events(sequence.id).normalized(groups)); onClose(); }}>{t('apply')}</button></>}>
    {dateView && selected ? <SequenceDatePicker key={dateView} draft={draft} sequence={sequence} group={selected} field={dateView} t={t} onPick={(date) => { patch(dateView === 'start' ? editProject(draft, t).sequences.events(sequence.id).moveStartDraft(selected, date) : { end: date }); setDateView(null); }} /> : <>
      <div className="event-manager-tools"><button className="button secondary" disabled={!sequence.rows.length || !days.length} onClick={add}><Plus size={15} />{t('addEventGroup')}</button>{request.position !== undefined && <label>{t('eventListFilter')}<select aria-label={t('eventListFilter')} value={todayOnly ? 'date' : 'all'} onChange={(e) => setTodayOnly(e.target.value === 'date')}><option value="all">{t('eventAllGroups')}</option><option value="date">{t('eventThisDate')}</option></select></label>}</div>
      {!sequence.rows.length && <p className="field-hint">{t('eventNoWeeks')}</p>}{!days.length && <p className="field-hint">{t('eventNoDays')}</p>}
      <div className="event-manager-layout"><div className="event-group-list" role="listbox" aria-label={t('eventGroups')}>
        {shown.map((group) => { const day = lookup.get(group.dayId); return <button key={group.id} role="option" aria-selected={selected?.id === group.id} className={`event-group-item ${selected?.id === group.id ? 'selected' : ''}`} onClick={() => setSelectedId(group.id)}><span className="entity-name">{day && <SlotIcon name={group.icon ?? day.icon} />}<strong>{eventGroupName(group, days) || t('eventChooseDay')}</strong></span><small>{eventSummary(group, t, days)}</small></button>; })}
        {!shown.length && <p className="field-hint">{t('eventNoGroups')}</p>}
      </div>{selected && <section className="event-group-form">
        <div className="event-identity-row">
        <IconField value={selected.icon ?? lookup.get(selected.dayId)?.icon} onChange={(icon) => patch({ icon })} t={t} />
        <label>{t('eventName')}<input aria-label={t('eventName')} value={selected.display_name ?? ''} placeholder={lookup.get(selected.dayId)?.name ?? ''} onChange={(e) => patch({ display_name: e.target.value })} /></label>
        <div className="event-engine-field"><span className="field-label">{t('engineKey')}</span><EngineKeyField kind="eventGroups" item={selected} onChange={(engine_key) => patch({ engine_key })} t={t} /></div>
        </div>
        <div className="event-properties-row">
        <label>{t('eventType')}<select aria-label={t('eventType')} value={eventKind(selected)} onChange={(event) => changeKind(event.target.value)}>{['once', 'periodic', 'probability'].map((kind) => <option key={kind} value={kind}>{t(`eventType_${kind}`)}</option>)}</select></label>
        <EventDayPicker days={days} value={selected.dayId} t={t} onChange={(dayId) => patch({ dayId, ...(!selected.display_name?.trim() ? { icon: lookup.get(dayId).icon } : {}), ...(!selected.display_name?.trim() ? { display_name: lookup.get(dayId).name } : {}) })} />
        <label>{t('eventPriority')}<input type="number" step="1" aria-label={t('eventPriority')} value={Number.isNaN(selected.priority) ? '' : selected.priority} onChange={(e) => patch({ priority: e.target.value === '' ? NaN : e.target.valueAsNumber })} /></label>
        </div>
        <p className="field-hint">{t(selected.priority >= 0 ? 'eventBeforeMain' : 'eventAfterMain')}</p>
        <div className="event-dates-row">
        <label>{t('eventStart')}<button className="button secondary" onClick={() => setDateView('start')} aria-label={t('eventPickStart')}><CalendarDays size={15} />{eventDateLabel(selected.start, t)}</button></label>
        {eventKind(selected) !== 'once' && <label>{t('eventEnd')}<button className="button secondary" disabled={eventKind(selected) === 'once'} onClick={() => setDateView('end')} aria-label={t('eventPickEnd')}><CalendarDays size={15} />{eventDateLabel(selected.end, t)}</button></label>}
        </div>
        {eventKind(selected) === 'periodic' && <label>{t('eventInterval')}<input type="number" min="1" step="1" aria-label={t('eventInterval')} value={Number.isNaN(selected.interval) ? '' : selected.interval} onChange={(event) => patch({ interval: event.target.value === '' ? NaN : event.target.valueAsNumber })} /></label>}
        {eventKind(selected) === 'probability' && <>{['probability_percent', 'cooldown_days'].map((key) => <label key={key}>{t(`eventProperty_${key}`)}<input type="number" min="0" max={key === 'probability_percent' ? 100 : undefined} step={key === 'probability_percent' ? 'any' : '1'} aria-label={t(`eventProperty_${key}`)} value={Number.isNaN(selected[key]) ? '' : selected[key] ?? ''} onChange={(event) => patch({ [key]: event.target.value === '' ? NaN : event.target.valueAsNumber })} /></label>)}<p className="field-hint">{t('probabilityRuleHint')}</p></>}
        {eventKind(selected) !== 'once' && <fieldset className="event-count-filter" disabled={eventKind(selected) === 'once'}><legend>{t('eventCountBasis')}</legend>
          <label>{t('eventCountBasis')}<select aria-label={t('eventCountBasis')} value={selected.countFilter?.kind ?? 'all'} onChange={(event) => patch({ countFilter: event.target.value === 'all' ? { kind: 'all' } : event.target.value === 'day' ? { kind: 'day', day_schedule_id: '' } : { kind: 'tag', tag: '' } })}>{['all', 'day', 'tag'].map((kind) => <option key={kind} value={kind}>{t(`eventCount_${kind}`)}</option>)}</select></label>
          {selected.countFilter?.kind === 'day' && <EventDayPicker label={t('eventCountSourceDay')} days={days} value={selected.countFilter.day_schedule_id} t={t} onChange={(day_schedule_id) => patch({ countFilter: { kind: 'day', day_schedule_id } })} />}
          {selected.countFilter?.kind === 'tag' && <label>{t('eventCountTag')}<select aria-label={t('eventCountTag')} value={selected.countFilter.tag} onChange={(event) => patch({ countFilter: { kind: 'tag', tag: event.target.value } })}><option value="">{t('eventChooseCountTag')}</option>{availableDayTags(days).map(([tag]) => <option key={tag} value={tag}>{tag}</option>)}{selected.countFilter.tag && !availableDayTags(days).some(([tag]) => tag === selected.countFilter.tag) && <option value={selected.countFilter.tag}>{selected.countFilter.tag}</option>}</select></label>}
        </fieldset>}
        <p className="field-hint">{t(eventKind(selected) === 'once' ? 'eventCountOnceHint' : eventKind(selected) === 'probability' ? 'probabilityCountHint' : 'eventCountHint')}</p>
        {selected.interval > 0 && !stats.total && <p className="shared-warning" role="status">{t('eventNoMatchingDates')}</p>}
        <p className="event-group-stats">{t(eventKind(selected) === 'probability' ? 'probabilityCountSummary' : 'eventCountSummary', stats)}</p>
        <div className="row-actions"><button className="button secondary" onClick={duplicate}><Copy size={15} />{t('duplicateEventGroup')}</button><button className="button secondary danger" onClick={remove}><Trash2 size={15} />{t('deleteEventGroup')}</button></div>
      </section>}</div>
      {errors.length > 0 && <div role="alert"><Issues errors={errors} t={t} /></div>}
      <p className="field-hint">{t('eventOrderHint')}</p>
    </>}
  </Dialog></EngineKeysContext.Provider>;
}
