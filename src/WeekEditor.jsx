import EngineKeyField from './EngineKeyField.jsx';
import DayReferencePreview from './DayReferencePreview.jsx';
import { useEffect } from 'react';
import IconField from './IconField.jsx';
import { Copy, Link2, Pencil, Trash2 } from 'lucide-react';
import { WEEKDAYS } from './scheduleConstants.js';
import { isPrivateDay } from './weekModel.js';
import { FieldError, SlotCellContent } from './ui.jsx';
import ActionMenu from './ActionMenu.jsx';
import useVisibleRows from './useVisibleRows.js';

const rowHeight = 112;
export default function WeekEditor({ week, draft, onChange, onDuplicate, onDelete, onDay, onCell, onOpenDay, highlight, t }) {
  const count = draft.project.settings.slots_per_day;
  const { ref, first, end, onScroll } = useVisibleRows(count, rowHeight, 104, week.id);
  useEffect(() => {
    if (highlight?.weekId !== week.id) return;
    const header = ref.current?.querySelector(`[data-weekday="${highlight.weekday}"]`);
    if (header) { ref.current.scrollTop = 0; header.focus({ preventScroll: true }); header.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }, [highlight, week.id, ref]);
  const days = new Map(draft.days.map((day) => [day.id, day]));
  const slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  return <div className="week-editor"><section className="schedule-titlebar"><div className="schedule-name"><label className="sr-only" htmlFor="week-name">{t('weekName')}</label><div className="name-with-icon"><IconField value={week.icon} onChange={(icon) => onChange({ ...week, icon })} t={t} /><input id="week-name" aria-label={t('weekName')} value={week.name} aria-invalid={!week.name.length} onChange={(e) => onChange({ ...week, name: e.target.value })} /><EngineKeyField kind="weeks" item={week} onChange={(engine_key) => onChange({ ...week, engine_key })} t={t} /></div><FieldError show={!week.name.length} t={t} /></div><ActionMenu label={t('weekActions')} items={[{ label: t('duplicateWeek'), icon: Copy, onClick: onDuplicate }, { label: t('deleteWeek'), icon: Trash2, danger: true, onClick: onDelete }]} /></section>
    <div className="week-matrix" ref={ref} onScroll={onScroll}>
      <div className="week-grid-header matrix-grid"><div className="matrix-corner" />{WEEKDAYS.map((weekday) => {
        const day = days.get(week.days[weekday]);
        const dayGroup = weekday === 'sat' || weekday === 'sun' ? 'weekend' : 'weekdays';
        const label = isPrivateDay(day) ? t('privateDay') : day?.name || t('unassigned');
        return <div className={`weekday-header ${dayGroup} ${highlight?.weekId === week.id && highlight.weekday === weekday ? 'highlighted-weekday' : ''}`} data-weekday={weekday} tabIndex={-1} key={weekday}><strong>{t(weekday)}</strong><div className="day-reference"><DayReferencePreview previewEnabled={false} day={day} draft={draft} week={week} weekday={weekday} label={label} onOpen={onOpenDay} t={t} /><button className="icon-button day-assignment-button" aria-label={t('chooseDayFor', { weekday: t(weekday) })} title={t('chooseDayFor', { weekday: t(weekday) })} onClick={() => onDay(weekday)}>{isPrivateDay(day) ? <Pencil size={13} /> : <Link2 size={13} />}</button></div></div>;
      })}</div>
      <div className="week-grid-body" style={{ height: count * rowHeight }}>
        {Array.from({ length: end - first }, (_, offset) => first + offset).map((index) => <div className="matrix-grid week-grid-row" key={index} style={{ top: index * rowHeight, height: rowHeight }}>
          <div className="matrix-row-label">{t('cell', { count: index + 1 })}</div>{WEEKDAYS.map((weekday) => {
            const day = days.get(week.days[weekday]); const slot = slots.get(day?.slotIds[index]);
            return <button className={`week-cell ${slot ? '' : 'empty-cell'}`} key={weekday} aria-label={t('weekCell', { weekday: t(weekday), count: index + 1 })} onClick={() => onCell(weekday, index)}><SlotCellContent slot={slot} t={t} /></button>;
          })}
        </div>)}
      </div>
    </div>
  </div>;
}
