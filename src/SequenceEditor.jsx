import EngineKeyField from './EngineKeyField.jsx';
import DayReferencePreview from './DayReferencePreview.jsx';
import IconField from './IconField.jsx';
import SlotIcon from './SlotIcon.jsx';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { FieldError, IconButton } from './ui.jsx';
import ActionMenu from './ActionMenu.jsx';
import WeekPicker from './WeekPicker.jsx';
import SequenceOverrideDialog from './SequenceOverrideDialog.jsx';
import { WEEKDAYS } from './scheduleConstants.js';
import { addSequenceRow, duplicateSequenceRow, moveSequenceRow, removeSequenceRow, replaceSequenceWeek, resolveSequenceDay } from './sequenceModel.js';
import useVisibleRows from './useVisibleRows.js';

const rowHeight = 148;
export default function SequenceEditor({ draft, sequence, onChange, onDuplicate, onDelete, onOpenDay, onOpenSlot, t }) {
  const [weekPicker, setWeekPicker] = useState(null);
  const [override, setOverride] = useState(null);
  const { ref, first, end, onScroll } = useVisibleRows(sequence.rows.length, rowHeight, 60, sequence.id);
  const weeks = new Map(draft.weeks.map((week) => [week.id, week]));
  return <div className="sequence-editor">
    <section className="schedule-titlebar"><div className="schedule-name"><label className="sr-only" htmlFor="sequence-name">{t('sequenceName')}</label><div className="name-with-icon"><IconField value={sequence.icon} onChange={(icon) => onChange({ ...sequence, icon })} t={t} /><input id="sequence-name" aria-label={t('sequenceName')} value={sequence.name} aria-invalid={!sequence.name.length} onChange={(event) => onChange({ ...sequence, name: event.target.value })} /><EngineKeyField kind="sequences" item={sequence} onChange={(engine_key) => onChange({ ...sequence, engine_key })} t={t} /></div><FieldError show={!sequence.name.length} t={t} /></div><ActionMenu label={t('sequenceActions')} items={[{ label: t('duplicateSequence'), icon: Copy, onClick: onDuplicate }, { label: t('deleteSequence'), icon: Trash2, danger: true, onClick: onDelete }]} /></section>
    <div className="sequence-matrix" ref={ref} onScroll={onScroll}>
      <div className="sequence-grid sequence-grid-header"><div className="sequence-corner" />{WEEKDAYS.map((weekday) => <div key={weekday} className={`sequence-weekday ${weekday === 'sat' || weekday === 'sun' ? 'weekend' : 'weekdays'}`}>{t(weekday)}</div>)}</div>
      {!sequence.rows.length && <p className="empty-sequence-message">{t('emptySequence')}</p>}
      <div className="sequence-grid-body" style={{ height: sequence.rows.length * rowHeight }}>
        {sequence.rows.slice(first, end).map((row, offset) => {
          const index = first + offset; const week = weeks.get(row.weekId);
          return <div className="sequence-grid sequence-row" role="group" aria-label={t('weekNumber', { count: index + 1 })} key={row.uid} style={{ top: index * rowHeight, height: rowHeight }}>
            <div className="sequence-row-controls"><strong>{t('weekNumber', { count: index + 1 })}</strong><button className="sequence-week-picker" aria-label={t('rowWeekSelector', { count: index + 1 })} title={week?.name} onClick={() => setWeekPicker({ rowUid: row.uid, weekId: row.weekId })}>{week && <SlotIcon name={week.icon} />}<span>{week?.name || '—'}</span><ChevronDown size={15} /></button>
              <div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => onChange(moveSequenceRow(sequence, row.uid, -1))} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === sequence.rows.length - 1} onClick={() => onChange(moveSequenceRow(sequence, row.uid, 1))} /><IconButton icon={Copy} label={t('duplicateWeekRow')} onClick={() => onChange(duplicateSequenceRow(sequence, row.uid))} /><IconButton icon={Trash2} label={t('deleteWeekRow')} danger onClick={() => onChange(removeSequenceRow(sequence, row.uid))} /></div>
            </div>
            {WEEKDAYS.map((weekday) => {
              const { day, overridden } = resolveSequenceDay(draft, row, weekday);
              const privateInherited = !overridden && day?.scope === 'week_private';
              const label = privateInherited ? t('privateDay') : day?.name || t('unassigned');
              const state = overridden ? day ? 'overridden' : 'emptyOverride' : privateInherited ? 'inheritedPrivate' : 'inherited';
              return <div key={weekday} className={`sequence-day ${overridden ? 'has-override' : ''}`}><DayReferencePreview day={day} draft={draft} week={week} weekday={weekday} overridden={overridden} label={label} onOpen={onOpenDay} onOpenSlot={onOpenSlot} t={t} /><button className="sequence-state sequence-override-button" aria-label={t('sequenceDayCell', { count: index + 1, weekday: t(weekday) })} onClick={() => setOverride({ rowUid: row.uid, weekday })}>{t(state)}<ChevronDown size={13} /></button></div>;
            })}
          </div>;
        })}
      </div>
    </div>
    <div className="sequence-add"><button className="button add-branch" disabled={!draft.weeks.length} onClick={() => setWeekPicker({ rowUid: null })}><Plus size={17} />{t('addWeekRow')}</button>{!draft.weeks.length && <p className="field-hint">{t('noWeeksForSequence')}</p>}</div>
    {weekPicker && <WeekPicker weeks={draft.weeks} selectedId={weekPicker.weekId} t={t} onClose={() => setWeekPicker(null)} onApply={(weekId) => { onChange(weekPicker.rowUid ? replaceSequenceWeek(draft, sequence, weekPicker.rowUid, weekId) : addSequenceRow(draft, sequence, weekId)); setWeekPicker(null); }} />}
    {override && <SequenceOverrideDialog draft={draft} sequence={sequence} {...override} t={t} onChange={onChange} onClose={() => setOverride(null)} />}
  </div>;
}
