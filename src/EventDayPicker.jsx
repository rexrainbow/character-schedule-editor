import { useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import SlotIcon from './SlotIcon.jsx';

export default function EventDayPicker({ days, value, onChange, t }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const id = useId(), trigger = useRef(null), selected = days.find((day) => day.id === value);
  const choices = days.filter((day) => day.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="event-day-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} onKeyDown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); trigger.current.focus(); } }}>
    <span className="field-label">{t('eventDay')}</span>
    <button ref={trigger} className="button secondary event-day-trigger" role="combobox" aria-label={t('eventDay')} aria-expanded={open} aria-controls={id} aria-haspopup="listbox" onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }} onClick={() => { setOpen(!open); setSearch(''); }}>{selected && <SlotIcon name={selected.icon} />}<span>{selected?.name || t('eventChooseDay')}</span><ChevronDown size={15} /></button>
    {open && <div className="event-day-options"><label className="search-field"><Search size={15} /><input autoFocus aria-label={t('eventSearchDays')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><div id={id} role="listbox" aria-label={t('eventDayOptions')}>
      {choices.map((day) => <button key={day.id} className="event-day-option" role="option" aria-selected={day.id === value} onClick={() => { onChange(day.id); setOpen(false); trigger.current.focus(); }}><SlotIcon name={day.icon} /><span>{day.name}</span></button>)}
      {!choices.length && <p className="field-hint">{t('noDayResults')}</p>}
    </div></div>}
  </div>;
}
