import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { availableDayTags, dayTags, tagFilterValue } from '../../core/dayTags.js';

export function DayTagFilter({ days, value, onChange, t }) {
  const options = availableDayTags(days);
  return <div className="day-tag-filter"><label>{t('filterDayTags')}<select aria-label={t('filterDayTags')} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t('allDayTags')} ({days.length})</option><option value="untagged">{t('untaggedDays')} ({days.filter((day) => !dayTags(day).length).length})</option>{options.map(([tag, count]) => <option key={tag} value={tagFilterValue(tag)}>{tag} ({count})</option>)}{value.startsWith('tag:') && !options.some(([tag]) => tagFilterValue(tag) === value) && <option value={value}>{value.slice(4)} (0)</option>}</select></label>{value && <button type="button" className="text-button" onClick={() => onChange('')}>{t('clearTagFilter')}</button>}</div>;
}

export function DayTagChips({ day, onFilter, t }) {
  return <span className="day-tag-chips">{dayTags(day).map((tag) => onFilter ? <button type="button" key={tag} className="day-tag" aria-label={t('filterByTag', { tag })} onClick={() => onFilter(tagFilterValue(tag))}>{tag}</button> : <span key={tag} className="day-tag">{tag}</span>)}</span>;
}

export function DayTagsEditor({ day, days, onChange, extra, t }) {
  const [text, setText] = useState('');
  const tags = dayTags(day), choices = availableDayTags(days).filter(([tag]) => !tags.includes(tag));
  function add(value) {
    const tag = value.trim(); if (!tag || tags.includes(tag)) return;
    onChange({ ...day, tags: [...tags, tag] }); setText('');
  }
  function remove(tag) {
    const next = { ...day, tags: tags.filter((item) => item !== tag) };
    if (!next.tags.length) delete next.tags;
    onChange(next);
  }
  return <section className="day-tags-editor" aria-label={t('dayTags')}><div className="day-tags-heading"><span className="field-label">{t('dayTags')}</span>{extra}</div><div className="day-tag-chips">{tags.map((tag) => <span key={tag} className="day-tag">{tag}<button type="button" aria-label={t('removeDayTag', { tag })} onClick={() => remove(tag)}><X size={12} /></button></span>)}</div>
    <div className="day-tag-add"><input aria-label={t('newDayTag')} placeholder={t('newDayTag')} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add(text); } }} /><button type="button" className="button secondary" disabled={!text.trim() || tags.includes(text.trim())} onClick={() => add(text)}><Plus size={14} />{t('addDayTag')}</button><select aria-label={t('existingDayTags')} value="" disabled={!choices.length} onChange={(event) => add(event.target.value)}><option value="">{t('existingDayTags')}</option>{choices.map(([tag]) => <option key={tag} value={tag}>{tag}</option>)}</select></div>
  </section>;
}
