import SlotIcon from '../components/SlotIcon.jsx';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog } from '../components/ui.jsx';

export default function WeekPicker({ weeks, selectedId = null, onApply, onClose, t }) {
  const [selected, setSelected] = useState(selectedId);
  const [search, setSearch] = useState('');
  const items = weeks.filter((week) => week.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <Dialog title={t('weekPicker')} onClose={onClose} t={t} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!weeks.some((week) => week.id === selected)} onClick={() => onApply(selected)}>{t('apply')}</button></>}>
    <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchWeeks')} placeholder={t('searchWeeks')} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <div className="selector-list" role="radiogroup" aria-label={t('weeks')}>{items.map((week) => <button key={week.id} role="radio" aria-checked={week.id === selected} className={`selector-item ${week.id === selected ? 'selected' : ''}`} onClick={() => setSelected(week.id)}><span className="radio-dot" /><SlotIcon name={week.icon} /><span>{week.name || '—'}</span></button>)}{!items.length && <p className="selector-empty">{t('noWeekResults')}</p>}</div>
  </Dialog>;
}
