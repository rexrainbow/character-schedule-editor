import { useEffect, useId, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DayUseControls } from './DayUses.jsx';
import { Dialog } from './ui.jsx';

export default function DayListOptions({ search, onSearchChange, onClear, ...controls }) {
  const { tag, role, t } = controls;
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 720px)').matches);
  const trigger = useRef(null), panel = useRef(null);
  const id = useId();
  const count = Number(!!search) + Number(!!tag) + Number(!!role);
  useEffect(() => {
    const media = matchMedia('(max-width: 720px)');
    const change = () => { setOpen(false); setMobile(media.matches); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open || mobile) return;
    const element = panel.current;
    const position = () => {
      const rect = trigger.current.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - element.offsetHeight - 8))}px`;
    };
    element.showPopover(); position();
    element.querySelector('input')?.focus();
    window.addEventListener('resize', position);
    return () => { window.removeEventListener('resize', position); element.hidePopover(); };
  }, [open, mobile]);
  function close() { setOpen(false); trigger.current?.focus(); }
  const content = <>
    <label className="search-field"><Search size={16} /><input aria-label={t('searchDays')} placeholder={t('searchDays')} value={search} onChange={(event) => onSearchChange(event.target.value)} /></label>
    <DayUseControls {...controls} />
    <button type="button" className="button" disabled={!count} onClick={onClear}>{t('clearDayFilters')}</button>
  </>;
  return <>
    <button type="button" ref={trigger} className={`icon-button day-options-trigger ${count ? 'has-filters' : ''}`} aria-label={t('dayListOptions')} title={t('dayListOptions')} aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open} onClick={() => setOpen(!open)}><SlidersHorizontal size={17} />{count > 0 && <span className="filter-count" aria-label={t('activeDayFilters', { count })}>{count}</span>}</button>
    {open && (mobile ? <Dialog title={t('dayListOptions')} onClose={close} t={t} className="day-options-dialog"><div id={id}>{content}</div></Dialog> : createPortal(<div id={id} ref={panel} popover="auto" role="dialog" aria-label={t('dayListOptions')} className="day-options-popover" onToggle={(event) => { if (event.newState === 'closed') setOpen(false); }}>
      <div className="day-options-heading"><strong>{t('dayListOptions')}</strong><button type="button" className="icon-button" aria-label={t('close')} onClick={close}><X size={17} /></button></div>{content}
    </div>, document.body))}
  </>;
}
