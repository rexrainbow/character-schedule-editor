import DescriptionField from '../components/DescriptionField.jsx';
import EventCandidatesDialog from '../dialogs/EventCandidatesDialog.jsx';
import { eventFirstDayId } from '../../core/eventDaySource.js';
import { editProject } from '../../core/projectApi.js';
import EngineKeyField from '../components/EngineKeyField.jsx';
import DayReferencePreview from '../components/DayReferencePreview.jsx';
import IconField from '../components/IconField.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2, Flag, FlagTriangleRight, CalendarDays, Play } from 'lucide-react';
import { FieldError, IconButton, Issues } from '../components/ui.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import WeekPicker from '../dialogs/WeekPicker.jsx';
import SequenceOverrideDialog from '../dialogs/SequenceOverrideDialog.jsx';
import { WEEKDAYS } from '../../core/scheduleConstants.js';
import { resolveSequenceDay } from '../../core/sequenceModel.js';
import useVisibleRows from '../hooks/useVisibleRows.js';
import { sequenceDate, sequenceRange } from '../../core/sequenceRange.js';
import SequenceEventsDialog from '../dialogs/SequenceEventsDialog.jsx';
import { eventsOnDate } from '../../core/sequenceEvents.js';

const rowHeight = 184;
export default function SequenceEditor({ draft, sequence, onChange, onDuplicate, onDelete, onOpenDay, onOpenSlot, onSimulateDay, candidateView, onCandidateViewChange, t }) {
  const [weekPicker, setWeekPicker] = useState(null);
  const [override, setOverride] = useState(null);
  const [rangeNotice, setRangeNotice] = useState(null);
  const [eventManager, setEventManager] = useState(null);
  const [actionErrors, setActionErrors] = useState([]);
  function value(result) { setActionErrors(result.errors); return result.ok ? result.value : null; }
  function update(next) {
    if (!next) return;
    const removed = (sequence.eventGroups?.length ?? 0) - (next.eventGroups?.length ?? 0);
    if (removed > 0 && !window.confirm(t('eventGroupsTrimConfirm', { count: removed }))) return;
    const previous = sequenceRange(sequence), range = sequenceRange(next);
    setRangeNotice(previous.startWeekday !== range.startWeekday && previous.endWeekday !== range.endWeekday || previous.endWeekday !== range.endWeekday && sequence.rows.length !== next.rows.length ? sequence.id : null);
    onChange(next);
  }
  const { ref, first, end, onScroll } = useVisibleRows(sequence.rows.length, rowHeight, 60, sequence.id);
  useEffect(() => {
    if (candidateView?.sequenceId === sequence.id && candidateView.open && ref.current) {
      ref.current.scrollTop = candidateView.sequenceScrollTop ?? 0;
      ref.current.scrollLeft = candidateView.sequenceScrollLeft ?? 0;
      onScroll({ currentTarget: ref.current });
    }
  }, [sequence.id, candidateView?.open]);
  const candidateGroup = candidateView?.sequenceId === sequence.id && candidateView.open ? sequence.eventGroups?.find((group) => group.id === candidateView.groupId) : null;
  const weeks = new Map(draft.weeks.map((week) => [week.id, week]));
  return <div className="sequence-editor">
    <section className="schedule-titlebar"><div className="schedule-name"><label className="sr-only" htmlFor="sequence-name">{t('sequenceName')}</label><div className="name-with-icon"><IconField value={sequence.icon} onChange={(icon) => onChange({ ...sequence, icon })} t={t} /><input id="sequence-name" aria-label={t('sequenceName')} value={sequence._fallbackValue !== undefined ? '' : sequence.name} placeholder={sequence.symbol} onChange={(event) => onChange({ ...sequence, name: event.target.value })} /><EngineKeyField kind="sequences" item={sequence} onChange={(symbol) => onChange({ ...sequence, symbol })} t={t} /></div></div><button className="button secondary sequence-event-manager" title={t('manageEventGroups', { count: sequence.eventGroups?.length ?? 0 })} aria-label={t('manageEventGroups', { count: sequence.eventGroups?.length ?? 0 })} onClick={() => setEventManager({})}><CalendarDays size={16} /><span>{t('manageEventGroups', { count: sequence.eventGroups?.length ?? 0 })}</span></button><ActionMenu label={t('sequenceActions')} items={[{ label: t('duplicateSequence'), icon: Copy, onClick: onDuplicate }, { label: t('deleteSequence'), icon: Trash2, danger: true, onClick: onDelete }]}  /></section><DescriptionField value={sequence.description} onChange={(description) => onChange({ ...sequence, description })} t={t} />
    {!!actionErrors.length && <Issues errors={actionErrors} t={t} />}
    <div className="sequence-matrix" ref={ref} onScroll={onScroll}>
      <div className="sequence-grid sequence-grid-header"><div className="sequence-corner" />{WEEKDAYS.map((weekday) => <div key={weekday} className={`sequence-weekday ${weekday === 'sat' || weekday === 'sun' ? 'weekend' : 'weekdays'}`}>{t(weekday)}</div>)}</div>
      {!sequence.rows.length && <p className="empty-sequence-message">{t('emptySequence')}</p>}
      <div className="sequence-grid-body" style={{ height: sequence.rows.length * rowHeight }}>
        {sequence.rows.slice(first, end).map((row, offset) => {
          const index = first + offset; const week = weeks.get(row.weekId);
          return <div className="sequence-grid sequence-row" role="group" aria-label={t('weekNumber', { count: index + 1 })} key={row.uid} style={{ top: index * rowHeight, height: rowHeight }}>
            <div className="sequence-row-controls"><strong>{t('weekNumber', { count: index + 1 })}</strong><button className="sequence-week-picker" aria-label={t('rowWeekSelector', { count: index + 1 })} title={week?.name} onClick={() => setWeekPicker({ rowUid: row.uid, weekId: row.weekId })}>{week && <SlotIcon name={week.icon} />}<span>{week?.name || '—'}</span><ChevronDown size={15} /></button>
              <div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => update(value(editProject(draft, t).sequences.moveWeek(sequence.id, row.uid, -1)))} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === sequence.rows.length - 1} onClick={() => update(value(editProject(draft, t).sequences.moveWeek(sequence.id, row.uid, 1)))} /><IconButton icon={Copy} label={t('duplicateWeekRow')} onClick={() => update(value(editProject(draft, t).sequences.duplicateWeek(sequence.id, row.uid)))} /><IconButton icon={Trash2} label={t('deleteWeekRow')} danger onClick={() => update(value(editProject(draft, t).sequences.removeWeek(sequence.id, row.uid)))} /></div>
            </div>
            {WEEKDAYS.map((weekday) => {
              const { day, overridden } = resolveSequenceDay(draft, row, weekday);
              const privateInherited = !overridden && day?.scope === 'week_private';
              const label = privateInherited ? t('privateDay') : day?.name || t('unassigned');
              const state = overridden ? day ? 'overridden' : 'emptyOverride' : privateInherited ? 'inheritedPrivate' : 'inherited';
              const date = sequenceDate(sequence, index, weekday);
              const position = index * 7 + WEEKDAYS.indexOf(weekday), events = eventsOnDate(sequence, position, draft);
              return <div key={weekday} className={`sequence-day ${overridden ? 'has-override' : ''} ${date.active ? '' : 'outside-range'}`} data-active={date.active}>
                <div className="sequence-date-heading"><span className="sequence-day-number">{date.active ? t('sequenceDayNumber', { count: date.dayNumber }) : t(date.before ? 'sequenceBeforeStart' : 'sequenceAfterEnd')}</span><div className="sequence-boundary-controls">
                  {index === 0 && <button className="icon-button sequence-start-flag" aria-label={t('setSequenceStart', { weekday: t(weekday) })} title={t('setSequenceStart', { weekday: t(weekday) })} aria-pressed={date.isStart} onClick={() => { if (!date.isStart) update(value(editProject(draft, t).sequences.setBoundary(sequence.id, 'start', weekday))); }}><Flag size={14} /></button>}
                  {index === sequence.rows.length - 1 && <button className="icon-button sequence-end-flag" aria-label={t('setSequenceEnd', { weekday: t(weekday) })} title={t('setSequenceEnd', { weekday: t(weekday) })} aria-pressed={date.isEnd} onClick={() => { if (!date.isEnd) update(value(editProject(draft, t).sequences.setBoundary(sequence.id, 'end', weekday))); }}><FlagTriangleRight size={14} /></button>}
                </div></div>
                <div className="sequence-overlay-icons" aria-label={t('eventGroups')}>
                  {events.slice(0, 2).map((group, eventIndex) => { const eventDay = draft.days.find((item) => item.id === eventFirstDayId(group)); return <DayReferencePreview key={group.id} day={eventDay} draft={draft} week={week} weekday={weekday} eventGroup={group} eventClassName={group.priority < 0 && (eventIndex === 0 || events[eventIndex - 1].priority >= 0) ? 'after-main-event' : ''} onOpen={onOpenDay} onOpenSlot={onOpenSlot} onViewCandidates={() => onCandidateViewChange({ sequenceId: sequence.id, groupId: group.id, selectedId: eventFirstDayId(group), open: true, showAll: false, search: '', scrollTop: 0, listScrollTop: 0, sequenceScrollTop: ref.current.scrollTop, sequenceScrollLeft: ref.current.scrollLeft })} onEditEvent={() => setEventManager({ id: group.id, position })} t={t} />; })}
                  {events.length > 2 && <button className="sequence-events-more" aria-label={t('eventMore', { count: events.length - 2 })} onClick={() => setEventManager({ position, onlyDate: true })}>+{events.length - 2}</button>}
                  <button className="icon-button sequence-event-add" disabled={!draft.days.some((item) => !item.scope || item.scope === 'shared')} title={t('addEventGroup')} aria-label={t('addEventOnDate', { week: index + 1, weekday: t(weekday) })} onClick={() => setEventManager({ createAt: position, position })}><Plus size={13} /></button>
                </div>
                <div className="sequence-day-content"><DayReferencePreview day={day} draft={draft} week={week} weekday={weekday} overridden={overridden} label={label} onOpen={onOpenDay} onOpenSlot={onOpenSlot} t={t} /></div><div className="sequence-day-actions"><button className="sequence-state sequence-override-button" aria-label={t('sequenceDayCell', { count: index + 1, weekday: t(weekday) })} onClick={() => setOverride({ rowUid: row.uid, weekday })}>{t(state)}<ChevronDown size={13} /></button><button className="icon-button" disabled={!date.active} title={t('simulationThisDay')} aria-label={t('simulationThisDate', { week: index + 1, weekday: t(weekday) })} onClick={() => onSimulateDay(sequence.id, position)}><Play size={13} /></button></div></div>;
            })}
          </div>;
        })}
      </div>
    </div>
    <div className="sequence-add">{rangeNotice === sequence.id && <p role="status" className="field-hint">{t('sequenceRangeAdjusted')}</p>}<button className="button add-branch" disabled={!draft.weeks.length} onClick={() => setWeekPicker({ rowUid: null })}><Plus size={17} />{t('addWeekRow')}</button>{!draft.weeks.length && <p className="field-hint">{t('noWeeksForSequence')}</p>}</div>
    {weekPicker && <WeekPicker weeks={draft.weeks} selectedId={weekPicker.weekId} t={t} onClose={() => setWeekPicker(null)} onApply={(weekId) => { update(weekPicker.rowUid ? value(editProject(draft, t).sequences.replaceWeek(sequence.id, weekPicker.rowUid, weekId)) : value(editProject(draft, t).sequences.appendWeek(sequence.id, weekId))); setWeekPicker(null); }} />}
    {override && <SequenceOverrideDialog draft={draft} sequence={sequence} {...override} t={t} onChange={onChange} onClose={() => setOverride(null)} />}
    {candidateGroup && <EventCandidatesDialog draft={draft} group={candidateGroup} view={candidateView} onViewChange={onCandidateViewChange} onOpenDay={onOpenDay} onOpenSlot={onOpenSlot} onClose={() => onCandidateViewChange(null)} t={t} />}
    {eventManager && <SequenceEventsDialog key={sequence.id} draft={draft} sequence={sequence} request={eventManager} t={t} onApply={(eventGroups) => onChange(editProject(draft, t).sequences.events(sequence.id).replace(eventGroups).value)} onClose={() => setEventManager(null)} />}
  </div>;
}
