import { useEffect, useRef, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';

export default function ActionMenu({ label, items, icon: Icon = MoreHorizontal, children, triggerClassName }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button:not(:disabled)')?.focus();
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
    if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
  }
  return <div className="action-menu" ref={root}>
    <button type="button" className={triggerClassName ?? (children ? 'project-menu-trigger' : 'icon-button menu-trigger')} ref={trigger} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>{children ?? <Icon size={19} />}</button>
    {open && <div className="menu-list" role="menu" aria-label={label} ref={menu} onKeyDown={keyboard}>{items.map(({ label: itemLabel, icon: ItemIcon, onClick, disabled, danger, separator, checked }, index) => separator ? <div role="separator" className="menu-separator" key={`separator-${index}`} /> : <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} key={itemLabel} disabled={disabled} className={danger ? 'danger' : ''} onClick={() => { close(true); onClick(); }}>{checked !== undefined ? <span className="menu-check">{checked && <Check size={17} />}</span> : ItemIcon && <ItemIcon size={17} />}<span>{itemLabel}</span></button>)}</div>}
  </div>;
}
