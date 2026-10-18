import EngineKeyField from './EngineKeyField.jsx';
import IconField from './IconField.jsx';
import { Copy, ExternalLink, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FieldError, SlotCellContent } from './ui.jsx';
import ActionMenu from './ActionMenu.jsx';
import useVisibleRows from './useVisibleRows.js';
import EventAssignment from './EventAssignment.jsx';
import { dayEventCount } from './dayEvents.js';

export default function DayEditor({ day, slots, onChange, onDuplicate, onDelete, onCell, onOpenSlot, restorePosition, t }) {
  const [showEvents, setShowEvents] = useState(restorePosition?.dayId === day.id && !!restorePosition.showEvents);
  const rowHeight = showEvents ? 224 : 112;
  // Only mount visible cells for long schedules; the data remains a full array.
  const { ref, first, end, onScroll } = useVisibleRows(day.slotIds.length, rowHeight, showEvents ? 48 : 0, `${day.id}:${showEvents}`);
  useEffect(() => {
    if (restorePosition?.dayId === day.id && ref.current) {
      ref.current.scrollTop = restorePosition.scrollTop;
      onScroll({ currentTarget: ref.current });
    }
  }, [day.id, restorePosition, ref]);
  const lookup = new Map(slots.map((slot) => [slot.id, slot]));
  const open = (slot) => onOpenSlot(slot, { dayId: day.id, scrollTop: ref.current.scrollTop, showEvents });
  const event = (target) => <EventAssignment day={day} target={target} lookup={lookup} onChoose={onCell} onOpen={open} t={t} />;
  return <div className="day-editor">
    <section className="schedule-titlebar">
      <div className="schedule-name"><label className="sr-only" htmlFor="day-name">{t('dayName')}</label><div className="name-with-icon"><IconField value={day.icon} onChange={(icon) => onChange({ ...day, icon })} t={t} /><input id="day-name" aria-label={t('dayName')} value={day.name} aria-invalid={!day.name.length} onChange={(e) => onChange({ ...day, name: e.target.value })} /><EngineKeyField kind="days" item={day} onChange={(engine_key) => onChange({ ...day, engine_key })} t={t} /></div><FieldError show={!day.name.length} t={t} /></div>
      <ActionMenu label={t('dayActions')} items={[{ label: t('duplicateDay'), icon: Copy, onClick: onDuplicate }, { label: t('deleteDay'), icon: Trash2, danger: true, onClick: onDelete }]} />
    </section>
    <button className="button secondary event-visibility" aria-expanded={showEvents} onClick={() => setShowEvents(!showEvents)}>{showEvents ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}{t(showEvents ? 'collapseEventSchedules' : 'expandEventSchedules', { count: dayEventCount(day) })}</button>
    <div className="day-cells" key={day.id} ref={ref} onScroll={onScroll}>
      {showEvents && event('dayStart')}
      <div style={{ height: day.slotIds.length * rowHeight, position: 'relative' }}>
        {day.slotIds.slice(first, end).map((slotId, offset) => {
          const index = first + offset; const slot = lookup.get(slotId);
          const eventCount = [day.slotEvents?.[index]?.startId, day.slotEvents?.[index]?.endId].filter(Boolean).length;
          return <div key={index} className="day-time-block" style={{ position: 'absolute', top: index * rowHeight, height: rowHeight - 10 }}>
            {showEvents && event({ index, edge: 'start' })}
            <div className={`day-cell ${slot ? '' : 'empty-cell'}`} style={{ height: 102 }}>
            <button className="day-cell-main" aria-label={t('cell', { count: index + 1 })} onClick={() => onCell(index)}><span className="cell-number">{t('cell', { count: index + 1 })}</span><SlotCellContent slot={slot} t={t} /></button>
            {eventCount > 0 && <span className="day-event-count">{t('slotEventCount', { count: eventCount })}</span>}
            {slot && <button className="icon-button day-slot-open" title={t('openSlotEditor')} aria-label={t('openSlotFor', { count: index + 1, name: slot.name })} onClick={() => open(slot)}><ExternalLink size={16} /></button>}
            </div>{showEvents && event({ index, edge: 'end' })}
          </div>;
        })}
      </div>
      {showEvents && event('dayEnd')}
    </div>
  </div>;
}
