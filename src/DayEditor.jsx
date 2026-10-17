import EngineKeyField from './EngineKeyField.jsx';
import IconField from './IconField.jsx';
import { Copy, ExternalLink, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { FieldError, SlotCellContent } from './ui.jsx';
import ActionMenu from './ActionMenu.jsx';
import useVisibleRows from './useVisibleRows.js';

const rowHeight = 112;
export default function DayEditor({ day, slots, onChange, onDuplicate, onDelete, onCell, onOpenSlot, restorePosition, t }) {
  // Only mount visible cells for long schedules; the data remains a full array.
  const { ref, first, end, onScroll } = useVisibleRows(day.slotIds.length, rowHeight, 0, day.id);
  useEffect(() => {
    if (restorePosition?.dayId === day.id && ref.current) {
      ref.current.scrollTop = restorePosition.scrollTop;
      onScroll({ currentTarget: ref.current });
    }
  }, [day.id, restorePosition, ref]);
  const lookup = new Map(slots.map((slot) => [slot.id, slot]));
  return <div className="day-editor">
    <section className="schedule-titlebar">
      <div className="schedule-name"><label className="sr-only" htmlFor="day-name">{t('dayName')}</label><div className="name-with-icon"><IconField value={day.icon} onChange={(icon) => onChange({ ...day, icon })} t={t} /><input id="day-name" aria-label={t('dayName')} value={day.name} aria-invalid={!day.name.length} onChange={(e) => onChange({ ...day, name: e.target.value })} /><EngineKeyField kind="days" item={day} onChange={(engine_key) => onChange({ ...day, engine_key })} t={t} /></div><FieldError show={!day.name.length} t={t} /></div>
      <ActionMenu label={t('dayActions')} items={[{ label: t('duplicateDay'), icon: Copy, onClick: onDuplicate }, { label: t('deleteDay'), icon: Trash2, danger: true, onClick: onDelete }]} />
    </section>
    <div className="day-cells" key={day.id} ref={ref} onScroll={onScroll}>
      <div style={{ height: day.slotIds.length * rowHeight, position: 'relative' }}>
        {day.slotIds.slice(first, end).map((slotId, offset) => {
          const index = first + offset; const slot = lookup.get(slotId);
          return <div key={index} className={`day-cell ${slot ? '' : 'empty-cell'}`} style={{ position: 'absolute', top: index * rowHeight, height: rowHeight - 10 }}>
            <button className="day-cell-main" aria-label={t('cell', { count: index + 1 })} onClick={() => onCell(index)}><span className="cell-number">{t('cell', { count: index + 1 })}</span><SlotCellContent slot={slot} t={t} /></button>
            {slot && <button className="icon-button day-slot-open" title={t('openSlotEditor')} aria-label={t('openSlotFor', { count: index + 1, name: slot.name })} onClick={() => onOpenSlot(slot, { dayId: day.id, scrollTop: ref.current.scrollTop })}><ExternalLink size={16} /></button>}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
