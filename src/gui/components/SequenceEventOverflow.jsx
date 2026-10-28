import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { eventGroupName } from '../../core/sequenceEvents.js';

// Non-modal: event previews remain interactive in their own existing portal.
export default function SequenceEventOverflow({ events, hiddenCount, renderEvent, days, t }) {
  const trigger = useRef(null), panel = useRef(null);
  const [position, setPosition] = useState(null);
  const id = useId();
  const close = (restore = false) => { setPosition(null); if (restore) trigger.current?.focus(); };
  useEffect(() => {
    if (!position) return;
    panel.current?.querySelector('button')?.focus();
    const outside = (event) => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target) && !event.target.closest?.('.day-reference-preview')) close();
    };
    const key = (event) => {
      if (event.key === 'Escape' && !document.querySelector('.day-reference-preview')) { event.preventDefault(); close(true); }
    };
    const move = (event) => { if (!panel.current?.contains(event.target) && !event.target.closest?.('.day-reference-preview')) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', move, true);
    };
  }, [position]);
  return <>
    <button ref={trigger} className="sequence-events-more" aria-label={t('eventMore', { count: hiddenCount })} aria-expanded={!!position} aria-controls={position ? id : undefined} aria-haspopup="dialog" onClick={() => {
      if (position) { close(); return; }
      const rect = trigger.current.getBoundingClientRect(), width = Math.min(300, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom, above = rect.top;
      setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), maxHeight: Math.max(120, Math.max(below, above) - 24), ...(below >= above ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) });
    }}>+{hiddenCount}</button>
    {position && createPortal(<section ref={panel} id={id} className="sequence-event-overflow" role="dialog" aria-modal="false" aria-label={t('eventsOnThisDay')} style={position}>
      <header><strong>{t('eventsOnThisDay')}</strong><button className="icon-button" aria-label={t('close')} onClick={() => close(true)}><X size={16} /></button></header>
      <ol>{events.map((group, index) => <li key={group.id}>{renderEvent(group, index, () => close())}<span>{eventGroupName(group, days)}</span></li>)}</ol>
    </section>, document.body)}
  </>;
}
