import { useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import SlotIcon from '../components/SlotIcon.jsx';
import { DayTagFilter, DayTagChips } from '../components/DayTags.jsx';
import { matchesDayTag } from '../../core/dayTags.js';
import SelectionDialog from './SelectionDialog.jsx';
import { DayPurposeFilter } from '../components/DayUses.jsx';
import { matchesDayPurpose } from '../../core/dayUses.js';

export default function EventDayPicker({ days, value, onChange, t, label = t('eventDay'), multiple = false, defaultPurpose = '' }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [picked, setPicked] = useState([]);
  const [purpose, setPurpose] = useState(defaultPurpose);
  const trigger = useRef(null), selected = days.find((day) => day.id === (multiple ? value[0] : value));
  const choices = days.filter((day) => day.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && matchesDayTag(day, tagFilter) && matchesDayPurpose(day, purpose));
  function close() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }
  function show() { setSearch(''); setTagFilter(''); setPurpose(defaultPurpose); setPicked(multiple ? [...value] : []); setOpen(true); }
  return <div className="event-day-picker">
    <span className="field-label">{label}</span>
    <button ref={trigger} type="button" className="button secondary event-day-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); show(); } }} onClick={show}>{selected && <SlotIcon name={selected.icon} />}<span>{multiple ? t('eventSelectCandidates', { count: value.length }) : selected?.name || t('eventChooseDay')}</span><ChevronDown size={15} /></button>
    {open && <SelectionDialog title={t('eventSelectDayTitle', { field: label })} t={t} wide onClose={close} footer={<><button type="button" className="button secondary" onClick={close}>{t('cancel')}</button>{multiple && <button type="button" className="button primary" onClick={() => { onChange(picked); close(); }}>{t('apply')}</button>}</>}>
      <div className="event-day-selector-tools"><label className="search-field"><Search size={15} /><input autoFocus aria-label={t('eventSearchDays')} placeholder={t('eventSearchDays')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><DayTagFilter days={days} value={tagFilter} onChange={setTagFilter} t={t} /></div>
      <DayPurposeFilter value={purpose} onChange={setPurpose} t={t} />
      <div className="event-day-selection-list" role="listbox" aria-label={t('eventDayOptions')} aria-multiselectable={multiple || undefined}>
      {choices.map((day) => <button type="button" key={day.id} className="event-day-option" role="option" aria-label={day.name} aria-selected={multiple ? picked.includes(day.id) : day.id === value} onClick={() => { if (multiple) setPicked(picked.includes(day.id) ? picked.filter((id) => id !== day.id) : [...picked, day.id]); else { onChange(day.id); close(); } }}>{multiple && <input type="checkbox" tabIndex={-1} aria-hidden="true" checked={picked.includes(day.id)} readOnly />}<SlotIcon name={day.icon} /><span className="selector-day-label"><span>{day.name}</span><DayTagChips day={day} t={t} /></span></button>)}
      {!choices.length && <p className="field-hint">{t('noDayResults')}</p>}
      </div>
    </SelectionDialog>}
  </div>;
}
