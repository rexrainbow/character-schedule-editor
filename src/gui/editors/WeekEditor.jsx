import SlotReleasePreview from '../components/SlotReleasePreview.jsx';
import EngineKeyField from '../components/EngineKeyField.jsx';
import DayReferencePreview from '../components/DayReferencePreview.jsx';
import { useEffect, useState } from 'react';
import IconField from '../components/IconField.jsx';
import { Copy, Link2, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { WEEKDAYS } from '../../core/scheduleConstants.js';
import { isPrivateDay } from '../../core/weekModel.js';
import { FieldError, SlotCellContent } from '../components/ui.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import useVisibleRows from '../hooks/useVisibleRows.js';
import EventAssignment from '../components/EventAssignment.jsx';
import { dayEventCount } from '../../core/dayEvents.js';

export default function WeekEditor({ week, draft, onChange, onDuplicate, onDelete, onDay, onCell, onOpenDay, highlight, t }) {
  const [showEvents, setShowEvents] = useState(false);
  const rowHeight = showEvents ? 224 : 112;
  const count = draft.project.settings.slots_per_day;
  const { ref, first, end, onScroll } = useVisibleRows(count, rowHeight, showEvents ? 152 : 104, `${week.id}:${showEvents}`);
  useEffect(() => {
    if (highlight?.weekId !== week.id) return;
    const header = ref.current?.querySelector(`[data-weekday="${highlight.weekday}"]`);
    if (header) { ref.current.scrollTop = 0; header.focus({ preventScroll: true }); header.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }, [highlight, week.id, ref]);
  const days = new Map(draft.days.map((day) => [day.id, day]));
  const slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  function event(weekday, target) { return <EventAssignment day={days.get(week.days[weekday]) ?? { slotIds: Array(count).fill(null) }} target={target} lookup={slots} labelPrefix={t(weekday)} onChoose={(value) => onCell(weekday, value)} t={t} />; }
  function boundaryRow(target) { return <div className="matrix-grid event-matrix-row"><div className="matrix-row-label">{t(target + 'Event')}</div>{WEEKDAYS.map((weekday) => <div key={weekday}>{event(weekday, target)}</div>)}</div>; }
  return <div className="week-editor"><section className="schedule-titlebar"><div className="schedule-name"><label className="sr-only" htmlFor="week-name">{t('weekName')}</label><div className="name-with-icon"><IconField value={week.icon} onChange={(icon) => onChange({ ...week, icon })} t={t} /><input id="week-name" aria-label={t('weekName')} value={week.name} aria-invalid={!week.name.length} onChange={(e) => onChange({ ...week, name: e.target.value })} /><EngineKeyField kind="weeks" item={week} onChange={(engine_key) => onChange({ ...week, engine_key })} t={t} /></div><FieldError show={!week.name.length} t={t} /></div><ActionMenu label={t('weekActions')} items={[{ label: t('duplicateWeek'), icon: Copy, onClick: onDuplicate }, { label: t('deleteWeek'), icon: Trash2, danger: true, onClick: onDelete }]} /></section>
    <button className="button secondary event-visibility" aria-expanded={showEvents} onClick={() => setShowEvents(!showEvents)}>{showEvents ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}{t(showEvents ? 'collapseEventSchedules' : 'expandEventSchedules', { count: WEEKDAYS.reduce((sum, weekday) => sum + (days.get(week.days[weekday]) ? dayEventCount(days.get(week.days[weekday])) : 0), 0) })}</button>
    <div className="week-matrix" ref={ref} onScroll={onScroll}>
      <div className="week-grid-header matrix-grid"><div className="matrix-corner" />{WEEKDAYS.map((weekday) => {
        const day = days.get(week.days[weekday]);
        const dayGroup = weekday === 'sat' || weekday === 'sun' ? 'weekend' : 'weekdays';
        const label = isPrivateDay(day) ? t('privateDay') : day?.name || t('unassigned');
        return <div className={`weekday-header ${dayGroup} ${highlight?.weekId === week.id && highlight.weekday === weekday ? 'highlighted-weekday' : ''}`} data-weekday={weekday} tabIndex={-1} key={weekday}><strong>{t(weekday)}</strong><div className="day-reference"><DayReferencePreview previewEnabled={false} day={day} draft={draft} week={week} weekday={weekday} label={label} onOpen={onOpenDay} t={t} /><button className="icon-button day-assignment-button" aria-label={t('chooseDayFor', { weekday: t(weekday) })} title={t('chooseDayFor', { weekday: t(weekday) })} onClick={() => onDay(weekday)}>{isPrivateDay(day) ? <Pencil size={13} /> : <Link2 size={13} />}</button></div></div>;
      })}</div>
      {showEvents && boundaryRow('dayStart')}
      <div className="week-grid-body" style={{ height: count * rowHeight }}>
        {Array.from({ length: end - first }, (_, offset) => first + offset).map((index) => <div className="matrix-grid week-grid-row" key={index} style={{ top: index * rowHeight, height: rowHeight }}>
          <div className="matrix-row-label">{t('cell', { count: index + 1 })}</div>{WEEKDAYS.map((weekday) => {
            const day = days.get(week.days[weekday]); const slot = slots.get(day?.slotIds[index]);
            const cell = <button className={`week-cell ${slot ? '' : 'empty-cell'}`} key={weekday} aria-label={t('weekCell', { weekday: t(weekday), count: index + 1 })} onClick={() => onCell(weekday, index)}><SlotReleasePreview release={day?.slotReleases?.[index]} assigned={!!slot} nodes={draft.operandNodes} active={false} t={t}><SlotCellContent slot={slot} t={t} /></SlotReleasePreview></button>;
            return showEvents ? <div className="week-event-stack" key={weekday}>{event(weekday, { index, edge: 'start' })}{cell}{event(weekday, { index, edge: 'end' })}</div> : cell;
          })}
        </div>)}
      </div>
      {showEvents && boundaryRow('dayEnd')}
    </div>
  </div>;
}
