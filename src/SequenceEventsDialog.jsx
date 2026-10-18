import { useRef, useState } from 'react';
import { Plus, Copy, Trash2, CalendarDays } from 'lucide-react';
import { Dialog, Issues } from './ui.jsx';
import SlotIcon from './SlotIcon.jsx';
import SequenceDatePicker from './SequenceDatePicker.jsx';
import { sharedDays } from './weekModel.js';
import { newEventGroup, changeEventStart, eventGroupErrors, eventCounts, eventSummary, eventDateLabel, eventsOnDate, datePosition, positionDate } from './sequenceEvents.js';
import { sequenceRange } from './sequenceRange.js';
import EventDayPicker from './EventDayPicker.jsx';
import EngineKeyField, { EngineKeysContext } from './EngineKeyField.jsx';
import { engineKeyEntries } from './engineKeyModel.js';
import { eventGroupName, duplicateEventGroup } from './sequenceEvents.js';
import { WEEKDAYS } from './scheduleConstants.js';

export default function SequenceEventsDialog({ draft, sequence, request, onApply, onClose, t }) {
  const [groups, setGroups] = useState(() => [...structuredClone(sequence.eventGroups ?? []), ...(request.createAt === undefined ? [] : [newEventGroup(sequence, request.createAt)])]);
  const [selectedId, setSelectedId] = useState(request.createAt === undefined ? request.id : null);
  const [dateView, setDateView] = useState(null);
  const [todayOnly, setTodayOnly] = useState(request.onlyDate === true);
  const lastIntervals = useRef({});
  const days = sharedDays(draft), candidate = { ...sequence, eventGroups: groups };
  const shown = todayOnly ? eventsOnDate(candidate, request.position) : groups;
  const selected = shown.find((group) => group.id === selectedId) ?? (request.createAt !== undefined && !selectedId ? shown.at(-1) : shown[0]);
  const errors = eventGroupErrors(sequence, days, groups);
  const stats = selected ? eventCounts(sequence, selected) : null;
  const lookup = new Map(days.map((day) => [day.id, day]));
  function patch(values) { setGroups(groups.map((group) => group.id === selected.id ? { ...group, ...values } : group)); setSelectedId(selected.id); }
  function changeInterval(e) {
    const interval = e.target.value === '' ? NaN : e.target.valueAsNumber;
    const previous = Number.isSafeInteger(selected.interval) ? selected.interval : lastIntervals.current[selected.id];
    lastIntervals.current[selected.id] = Number.isSafeInteger(interval) ? interval : previous;
    patch({ interval, ...(interval === 0 ? { end: { ...selected.start } } : previous === 0 && interval > 0 ? { end: positionDate(Math.max(datePosition(selected.start), sequenceRange(sequence).end)) } : {}) });
  }
  function add() { const group = newEventGroup(sequence, request.position); setGroups([...groups, group]); setSelectedId(group.id); setTodayOnly(false); }
  function duplicate() { const group = duplicateEventGroup(selected, days); setGroups([...groups, group]); setSelectedId(group.id); }
  function remove() { if (window.confirm(t('eventDeleteConfirm', { count: stats.total }))) { setGroups(groups.filter((group) => group.id !== selected.id)); setSelectedId(null); } }
  const title = dateView ? t(dateView === 'start' ? 'eventPickStart' : 'eventPickEnd') : t('eventManager');
  const keyEntries = engineKeyEntries({ ...draft, sequences: draft.sequences.map((item) => item.id === sequence.id ? candidate : item) });
  return <EngineKeysContext.Provider value={keyEntries}><Dialog title={title} subtitle={sequence.name} wide onClose={() => dateView ? setDateView(null) : onClose()} t={t} footer={dateView ? <button className="button secondary" onClick={() => setDateView(null)}>{t('back')}</button> : <><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={errors.length > 0} onClick={() => { onApply(groups.map((group) => ({ ...group, display_name: eventGroupName(group, days) }))); onClose(); }}>{t('apply')}</button></>}>
    {dateView && selected ? <SequenceDatePicker key={dateView} draft={draft} sequence={sequence} group={selected} field={dateView} t={t} onPick={(date) => { patch(dateView === 'start' ? changeEventStart(selected, date) : { end: date }); setDateView(null); }} /> : <>
      <div className="event-manager-tools"><button className="button secondary" disabled={!sequence.rows.length || !days.length} onClick={add}><Plus size={15} />{t('addEventGroup')}</button>{request.position !== undefined && <label>{t('eventListFilter')}<select aria-label={t('eventListFilter')} value={todayOnly ? 'date' : 'all'} onChange={(e) => setTodayOnly(e.target.value === 'date')}><option value="all">{t('eventAllGroups')}</option><option value="date">{t('eventThisDate')}</option></select></label>}</div>
      {!sequence.rows.length && <p className="field-hint">{t('eventNoWeeks')}</p>}{!days.length && <p className="field-hint">{t('eventNoDays')}</p>}
      <div className="event-manager-layout"><div className="event-group-list" role="listbox" aria-label={t('eventGroups')}>
        {shown.map((group) => { const day = lookup.get(group.dayId); return <button key={group.id} role="option" aria-selected={selected?.id === group.id} className={`event-group-item ${selected?.id === group.id ? 'selected' : ''}`} onClick={() => setSelectedId(group.id)}><span className="entity-name">{day && <SlotIcon name={day.icon} />}<strong>{eventGroupName(group, days) || t('eventChooseDay')}</strong></span><small>{eventSummary(group, t)}</small></button>; })}
        {!shown.length && <p className="field-hint">{t('eventNoGroups')}</p>}
      </div>{selected && <section className="event-group-form">
        <label>{t('eventName')}<input aria-label={t('eventName')} value={selected.display_name ?? ''} placeholder={lookup.get(selected.dayId)?.name ?? ''} onChange={(e) => patch({ display_name: e.target.value })} /></label>
        <div className="event-engine-field"><span className="field-label">{t('engineKey')}</span><EngineKeyField kind="eventGroups" item={selected} onChange={(engine_key) => patch({ engine_key })} t={t} /></div>
        <EventDayPicker days={days} value={selected.dayId} t={t} onChange={(dayId) => patch({ dayId, ...(!selected.display_name?.trim() ? { display_name: lookup.get(dayId).name } : {}) })} />
        <label>{t('eventStart')}<button className="button secondary" onClick={() => setDateView('start')} aria-label={t('eventPickStart')}><CalendarDays size={15} />{eventDateLabel(selected.start, t)}</button></label>
        <label>{t('eventEnd')}<button className="button secondary" disabled={selected.interval === 0} onClick={() => setDateView('end')} aria-label={t('eventPickEnd')}><CalendarDays size={15} />{eventDateLabel(selected.end, t)}</button></label>
        <label>{t('eventInterval')}<input type="number" min="0" step="1" aria-label={t('eventInterval')} value={Number.isNaN(selected.interval) ? '' : selected.interval} onChange={changeInterval} /><span className="field-hint">{t('eventIntervalHint')}</span></label>
        <fieldset className="event-skip-weekdays" disabled={selected.interval === 0}><legend>{t('eventSkipWeekdays')}</legend><div>{WEEKDAYS.map((weekday) => <label key={weekday}><input type="checkbox" checked={(selected.skipWeekdays ?? []).includes(weekday)} onChange={(e) => patch({ skipWeekdays: WEEKDAYS.filter((day) => day === weekday ? e.target.checked : (selected.skipWeekdays ?? []).includes(day)) })} />{t(weekday)}</label>)}</div></fieldset>
        <p className="field-hint">{t(selected.interval === 0 ? 'eventSkipOnceHint' : 'eventSkipHint')}</p>
        <label>{t('eventPriority')}<input type="number" step="1" aria-label={t('eventPriority')} value={Number.isNaN(selected.priority) ? '' : selected.priority} onChange={(e) => patch({ priority: e.target.value === '' ? NaN : e.target.valueAsNumber })} /><span className="field-hint">{t(selected.priority >= 0 ? 'eventBeforeMain' : 'eventAfterMain')}</span></label>
        <p className="event-group-stats">{t('eventCountSummary', stats)}</p>
        <div className="row-actions"><button className="button secondary" onClick={duplicate}><Copy size={15} />{t('duplicateEventGroup')}</button><button className="button secondary danger" onClick={remove}><Trash2 size={15} />{t('deleteEventGroup')}</button></div>
      </section>}</div>
      {errors.length > 0 && <div role="alert"><Issues errors={errors} t={t} /></div>}
      <p className="field-hint">{t('eventOrderHint')}</p>
    </>}
  </Dialog></EngineKeysContext.Provider>;
}
