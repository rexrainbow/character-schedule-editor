import { DayPurposeFilter } from '../components/DayUses.jsx';
import { matchesDayPurpose } from '../../core/dayUses.js';
import { editProject } from '../../core/projectApi.js';
import SlotIcon from '../components/SlotIcon.jsx';
import { DayTagFilter, DayTagChips } from '../components/DayTags.jsx';
import { matchesDayTag } from '../../core/dayTags.js';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog } from '../components/ui.jsx';
import { sharedDays } from '../../core/weekModel.js';


export default function SequenceOverrideDialog({ draft, sequence, rowUid, weekday, onChange, onClose, t }) {
  const index = sequence.rows.findIndex((row) => row.uid === rowUid); const row = sequence.rows[index];
  const [choice, setChoice] = useState(Object.hasOwn(row.overrides, weekday) ? row.overrides[weekday] : 'inherit');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [purpose, setPurpose] = useState('main');
  const week = draft.weeks.find((item) => item.id === row.weekId);
  const inherited = draft.days.find((day) => day.id === week?.days[weekday]);
  const inheritedName = inherited?.scope === 'week_private' ? t('privateDay') : inherited?.name || t('unassigned');
  const days = sharedDays(draft);
  const items = days.filter((day) => day.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && matchesDayTag(day, tagFilter) && matchesDayPurpose(day, purpose));
  const option = (id, label, day) => <button key={id ?? 'empty'} role="radio" aria-label={label} aria-checked={choice === id} className={`selector-item ${choice === id ? 'selected' : ''}`} onClick={() => setChoice(id)}><span className="radio-dot" />{day && <SlotIcon name={day.icon} />}<span className="selector-day-label"><span>{label}</span>{day && <DayTagChips day={day} t={t} />}</span></button>;
  return <Dialog title={t('overrideDialog')} subtitle={t('sequenceOverrideSource', { name: sequence.name, count: index + 1, weekday: t(weekday) })} onClose={onClose} t={t} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={() => { onChange(editProject(draft, t).sequences.setOverride(sequence.id, rowUid, weekday, choice).value); onClose(); }}>{t('apply')}</button></>}>
    <p className="inherit-preview">{inherited && <SlotIcon name={inherited.icon} />}{t('inheritPreview', { name: inheritedName })}</p>
    <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchDays')} placeholder={t('searchDays')} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <DayTagFilter days={days} value={tagFilter} onChange={setTagFilter} t={t} />
    <DayPurposeFilter value={purpose} onChange={setPurpose} t={t} />
    <div className="selector-list" role="radiogroup" aria-label={t('days')}>{option('inherit', t('inheritFromWeek'))}{items.map((day) => option(day.id, day.name || '—', day))}{option(null, t('overrideEmpty'))}</div>
    <p className="field-hint">{t('sequenceReadOnlyHint')}</p>
  </Dialog>;
}
