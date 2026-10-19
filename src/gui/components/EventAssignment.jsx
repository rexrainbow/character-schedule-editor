import { ExternalLink } from 'lucide-react';
import SlotIcon from './SlotIcon.jsx';
import { assignmentLabel, dayAssignment } from '../../core/dayEvents.js';

export default function EventAssignment({ day, target, lookup, onChoose, onOpen, labelPrefix, t }) {
  const label = assignmentLabel(target, t), slot = lookup.get(dayAssignment(day, target));
  return <div className={`event-assignment ${typeof target === 'string' ? 'day-boundary-event' : 'slot-boundary-event'}`}>
    <button className="event-assignment-main" aria-label={labelPrefix ? `${labelPrefix} / ${label}` : label} onClick={() => onChoose(target)}><span className="event-label">{label}</span><span className="event-value">{slot && <SlotIcon name={slot.icon} />}<strong>{slot?.name || t('unassigned')}</strong></span></button>
    {slot && onOpen && <button className="icon-button event-slot-open" title={t('openSlotEditor')} aria-label={t('openEventSlot', { event: label, name: slot.name })} onClick={() => onOpen(slot)}><ExternalLink size={14} /></button>}
  </div>;
}
