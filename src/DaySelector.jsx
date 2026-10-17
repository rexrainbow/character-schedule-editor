import SlotIcon from './SlotIcon.jsx';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { isPrivateDay, setWeekDay, sharedDays, weekDay } from './weekModel.js';
import { Dialog } from './ui.jsx';

export default function DaySelector({ draft, week, weekday, onCommit, onClose, t }) {
  const current = weekDay(draft, week.id, weekday);
  const [selected, setSelected] = useState(isPrivateDay(current) ? 'keep' : current?.id ?? null);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const filtered = sharedDays(draft).filter((day) => day.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function choose(id) { setSelected(id); setConfirm(false); }
  function apply() {
    if (selected === 'keep') { onClose(); return; }
    if (isPrivateDay(current) && !confirm) { setConfirm(true); return; }
    onCommit(setWeekDay(draft, week.id, weekday, selected)); onClose();
  }
  const option = (id, label, day) => <button key={id ?? 'empty'} role="radio" aria-checked={selected === id} className={`selector-item ${selected === id ? 'selected' : ''}`} onClick={() => choose(id)}><span className="radio-dot" />{day && <SlotIcon name={day.icon} />}<span>{label}</span></button>;
  return <Dialog title={t('daySelector')} subtitle={t('weekDaySource', { name: week.name, weekday: t(weekday) })} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={apply}>{t(confirm ? 'confirmReplace' : 'apply')}</button></>}>
    <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchDays')} placeholder={t('searchDays')} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="selector-list" role="radiogroup" aria-label={t('days')}>{isPrivateDay(current) && option('keep', t('keepPrivate'))}{filtered.map((day) => option(day.id, day.name || '—', day))}{option(null, t('clearDay'))}</div>
    {confirm && <p className="shared-warning" role="alert">{t('discardPrivate')}</p>}
  </Dialog>;
}
