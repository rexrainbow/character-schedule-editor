import SlotReleaseDialog from '../dialogs/SlotReleaseDialog.jsx';
import { formatCondition } from '../../core/operandModel.js';
import EngineKeyField from '../components/EngineKeyField.jsx';
import { DayPurposeEditor } from '../components/DayUses.jsx';
import { DayTagsEditor } from '../components/DayTags.jsx';
import IconField from '../components/IconField.jsx';
import { Copy, ExternalLink, Trash2, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FieldError, SlotCellContent } from '../components/ui.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import useVisibleRows from '../hooks/useVisibleRows.js';
import EventAssignment from '../components/EventAssignment.jsx';

export default function DayEditor({ day, days = [], slots, nodes = {}, onChange, onDuplicate, onDelete, onCell, onOpenSlot, restorePosition, t }) {
  const [showEvents, setShowEvents] = useState(restorePosition?.dayId === day.id && !!restorePosition.showEvents);
  const [releaseIndex, setReleaseIndex] = useState(null);
  const rowHeights = useMemo(() => day.slotIds.map((_, index) => 112
    + (showEvents || day.slotEvents?.[index]?.startId ? 50 : 0)
    + (showEvents || day.slotEvents?.[index]?.endId ? 50 : 0)
    + (day.slotReleases?.[index] ? 84 : showEvents ? 40 : 0)), [day.slotIds.length, day.slotEvents, day.slotReleases, showEvents]);
  function setRelease(index, value) { onChange({ ...day, slotReleases: day.slotIds.map((_, i) => i === index ? value : day.slotReleases?.[i] ?? null) }); }
  // Only mount visible cells for long schedules; the data remains a full array.
  const { ref, first, end, onScroll, offsets, totalHeight } = useVisibleRows(day.slotIds.length, rowHeights, showEvents || day.dayStartId ? 48 : 0, `${day.id}:${showEvents}`);
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
    <DayTagsEditor key={`tags:${day.id}`} day={day} days={days} onChange={onChange} t={t} extra={<DayPurposeEditor day={day} onChange={onChange} t={t} />} />
    <button className="button secondary event-visibility" aria-expanded={showEvents} onClick={() => setShowEvents(!showEvents)}>{showEvents ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}{t(showEvents ? 'showConfiguredPositions' : 'showAllPositions')}</button>
    <div className={`day-cells ${showEvents ? '' : 'configured-positions'}`} key={day.id} ref={ref} onScroll={onScroll}>
      {(showEvents || day.dayStartId) && event('dayStart')}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {day.slotIds.slice(first, end).map((slotId, offset) => {
          const index = first + offset; const slot = lookup.get(slotId);
          return <div key={index} className="day-time-block" style={{ position: 'absolute', top: offsets[index], height: rowHeights[index] - 10 }}>
            {(showEvents || day.slotEvents?.[index]?.startId) && event({ index, edge: 'start' })}
            {(showEvents || day.slotReleases?.[index]) && <button type="button" className={`day-slot-release ${day.slotReleases?.[index] ? 'configured' : ''}`} aria-label={t('releaseSlotFor', { count: index + 1 })} onClick={() => setReleaseIndex(index)}>{day.slotReleases?.[index] ? <><strong>{t('releaseSlot')}</strong><span>{day.slotReleases[index].condition == null ? t('releaseUnconditional') : formatCondition(day.slotReleases[index].condition, nodes)}</span></> : <><Plus size={14} />{t('addSlotRelease')}</>}</button>}
            <div className={`day-cell ${slot ? '' : 'empty-cell'}`} style={{ height: 102 }}>
            <button className="day-cell-main" aria-label={t('cell', { count: index + 1 })} onClick={() => onCell(index)}><span className="cell-number">{t('cell', { count: index + 1 })}</span><SlotCellContent slot={slot} t={t} /></button>
            {day.slotReleases?.[index] && <span className="day-event-count">{t('releaseSlot')}</span>}
            {slot && <button className="icon-button day-slot-open" title={t('openSlotEditor')} aria-label={t('openSlotFor', { count: index + 1, name: slot.name })} onClick={() => open(slot)}><ExternalLink size={16} /></button>}
            </div>{(showEvents || day.slotEvents?.[index]?.endId) && event({ index, edge: 'end' })}
          </div>;
        })}
      </div>
      {(showEvents || day.dayEndId) && event('dayEnd')}
    </div>
    {releaseIndex !== null && <SlotReleaseDialog key={releaseIndex} index={releaseIndex} value={day.slotReleases?.[releaseIndex]} nodes={nodes} t={t} onApply={(value) => setRelease(releaseIndex, value)} onRemove={() => setRelease(releaseIndex, null)} onClose={() => setReleaseIndex(null)} />}
  </div>;
}
