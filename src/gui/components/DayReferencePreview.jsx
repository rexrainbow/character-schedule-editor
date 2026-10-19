import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import SlotIcon from './SlotIcon.jsx';
import { dayAssignments, assignmentLabel } from '../../core/dayEvents.js';
import { eventTooltip, eventGroupName } from '../../core/sequenceEvents.js';
import { eventKind } from '../../core/eventReferences.js';

export default function DayReferencePreview({ day, draft, week, weekday, overridden = false, label, onOpen, onOpenSlot, t, previewEnabled = true, eventGroup = null, eventClassName = '', onEditEvent }) {
  const [position, setPosition] = useState(null);
  const probabilityCandidate = eventGroup && eventKind(eventGroup) === 'probability';
  const anchor = useRef(null), panel = useRef(null), timer = useRef(null), skipFocus = useRef(false);
  const id = useId(), privateDay = day?.scope === 'week_private';
  const openLabel = t(privateDay ? 'openSourceWeek' : 'openDayEditor');
  const clearTimer = () => clearTimeout(timer.current);
  function show() {
    clearTimer();
    if (!previewEnabled || document.querySelector('dialog[open]')) return;
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom, above = rect.top;
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width,
      maxHeight: Math.min(window.innerHeight * .65, Math.max(below, above) - 18),
      ...(below >= above ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) });
  }
  function leave() {
    clearTimer();
    timer.current = setTimeout(() => {
      if (!anchor.current?.contains(document.activeElement) && !panel.current?.contains(document.activeElement)) setPosition(null);
    }, 180);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!position) return;
    const outside = (event) => { if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) setPosition(null); };
    const key = (event) => { if (event.key === 'Escape') { clearTimeout(timer.current); setPosition(null); if (panel.current?.contains(document.activeElement)) { skipFocus.current = true; anchor.current?.querySelector('button')?.focus(); } } };
    const move = (event) => { if (!panel.current?.contains(event.target)) setPosition(null); };
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside); document.addEventListener('keydown', key);
    window.addEventListener('resize', move); window.addEventListener('scroll', move, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', key); window.removeEventListener('resize', move); window.removeEventListener('scroll', move, true); };
  }, [position]);
  const slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  return <div className={`day-preview-anchor ${eventGroup ? 'sequence-event-preview' : ''}`} ref={anchor} onPointerEnter={previewEnabled ? (event) => { if (event.pointerType !== 'touch') { clearTimer(); timer.current = setTimeout(() => { if (anchor.current?.matches(':hover')) show(); }, 400); } } : undefined} onPointerLeave={previewEnabled ? leave : undefined} onBlur={previewEnabled ? leave : undefined}>
    {eventGroup ? <button className={`sequence-event-icon ${probabilityCandidate ? 'probability-event-candidate' : ''} ${eventClassName}`} title={eventTooltip(eventGroup, draft.days, t) + (probabilityCandidate ? '\n' + t('probabilityCandidate') : '')} aria-label={t('editEventGroup', { name: eventGroupName(eventGroup, draft.days) || '—' })} aria-expanded={!!position} aria-controls={position ? id : undefined} onFocus={() => { if (skipFocus.current) skipFocus.current = false; else show(); }} onClick={() => { clearTimer(); setPosition(null); onEditEvent(); }}><SlotIcon name={eventGroup?.icon ?? day?.icon} /></button> : previewEnabled ? <button className="day-preview-name entity-name" aria-label={t('previewDayFor', { weekday: t(weekday), name: label })} aria-expanded={!!position} aria-controls={position ? id : undefined} onFocus={() => { if (skipFocus.current) skipFocus.current = false; else show(); }} onClick={show}>{day && <SlotIcon name={day.icon} />}<strong>{label}</strong></button> : <span className="day-preview-name entity-name">{day && <SlotIcon name={day.icon} />}<strong>{label}</strong></span>}
    {day && !eventGroup && <button className="icon-button day-open-button" title={openLabel} aria-label={t('openDayFor', { weekday: t(weekday), name: label, action: openLabel })} onClick={() => { setPosition(null); onOpen(day, week, weekday); }}><ExternalLink size={14} /></button>}
    {position && createPortal(<section id={id} ref={panel} role="dialog" aria-modal="false" aria-label={t('dayPreview')} className="day-reference-preview" style={position} onPointerEnter={clearTimer} onPointerLeave={leave} onFocus={clearTimer} onBlur={leave}>
      <div className="entity-name">{day && <SlotIcon name={day.icon} />}<strong>{day?.name || label}</strong>{day && eventGroup && <button className="icon-button day-preview-source-open" title={openLabel} aria-label={t('openDayFor', { weekday: t(weekday), name: day.name, action: openLabel })} onClick={() => { setPosition(null); onOpen(day, week, weekday); }}><ExternalLink size={15} /></button>}</div>
      {eventGroup ? <p className="field-hint event-preview-summary">{eventTooltip(eventGroup, draft.days, t)}</p> : <p className="field-hint">{overridden ? t(day ? 'previewOverrideSource' : 'previewEmptyOverride') : t('previewWeekSource', { name: week?.name || t('unassigned') })}</p>}
      {day ? <ol className="day-preview-slots">{dayAssignments(day).filter((entry) => typeof entry.target === 'number' || entry.id !== null).map((entry) => { const slot = slots.get(entry.id), main = typeof entry.target === 'number', label = assignmentLabel(entry.target, t); return <li key={entry.path} className={main ? '' : 'preview-event-row'}><span className="day-preview-index">{main ? entry.target + 1 : label}</span>{slot && <SlotIcon name={slot.icon} />}<span className="day-preview-slot-name">{slot?.name || t('unassigned')}</span>{slot && onOpenSlot && <button className="icon-button day-preview-slot-open" title={t('openSlotEditor')} aria-label={main ? t('openSlotFor', { count: entry.target + 1, name: slot.name }) : t('openEventSlot', { event: label, name: slot.name })} onClick={() => { setPosition(null); onOpenSlot(slot); }}><ExternalLink size={15} /></button>}</li>; })}</ol> : <p>{t('unassigned')}</p>}
      {day && <button className="button secondary" onClick={() => { setPosition(null); onOpen(day, week, weekday); }}><ExternalLink size={15} />{openLabel}</button>}
    </section>, document.body)}
  </div>;
}
