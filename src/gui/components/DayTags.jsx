import { useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { availableDayTags, dayTags, tagFilterValue } from '../../core/dayTags.js';
import { Dialog } from './ui.jsx';

export function DayTagFilter({ days, value, onChange, t }) {
  const options = availableDayTags(days);
  return <div className="day-tag-filter"><label>{t('filterDayTags')}<select aria-label={t('filterDayTags')} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t('allDayTags')} ({days.length})</option><option value="untagged">{t('untaggedDays')} ({days.filter((day) => !dayTags(day).length).length})</option>{options.map(([tag, count]) => <option key={tag} value={tagFilterValue(tag)}>{tag} ({count})</option>)}{value.startsWith('tag:') && !options.some(([tag]) => tagFilterValue(tag) === value) && <option value={value}>{value.slice(4)} (0)</option>}</select></label>{value && <button type="button" className="text-button" onClick={() => onChange('')}>{t('clearTagFilter')}</button>}</div>;
}

export function DayTagChips({ day, onFilter, t }) {
  return <span className="day-tag-chips">{dayTags(day).map((tag) => onFilter ? <button type="button" key={tag} className="day-tag" aria-label={t('filterByTag', { tag })} onClick={() => onFilter(tagFilterValue(tag))}>{tag}</button> : <span key={tag} className="day-tag">{tag}</span>)}</span>;
}

export function DayTagsEditor({ day, days, onChange, extra, t }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [selection, setSelection] = useState(null);
  const [created, setCreated] = useState([]);
  const tags = dayTags(day);
  const choices = [...new Set([...availableDayTags(days).map(([tag]) => tag), ...tags, ...created])].sort((a, b) => a.localeCompare(b, t.locale));
  function open() { setText(''); setCreated([]); setSelection([...tags]); }
  function add() {
    const tag = text.trim(); if (!tag || selection.includes(tag)) return;
    setCreated([...created, tag]); setSelection([...selection, tag]); setText('');
  }
  function apply() {
    const pending = text.trim();
    const nextTags = pending && !selection.includes(pending) ? [...selection, pending] : selection;
    const next = { ...day, tags: nextTags };
    if (!nextTags.length) delete next.tags;
    if (JSON.stringify(nextTags) !== JSON.stringify(tags)) onChange(next);
    setSelection(null);
  }
  function remove(tag) {
    const next = { ...day, tags: tags.filter((item) => item !== tag) };
    if (!next.tags.length) delete next.tags;
    onChange(next);
  }
  return <section className="day-tags-editor" aria-label={t('dayTags')}><div className="day-tags-heading"><div className="day-tags-actions"><span className="field-label">{t('dayTags')}</span><button type="button" className="icon-button" aria-label={t('editDayTags')} title={t('editDayTags')} aria-haspopup="dialog" onClick={open}><Plus size={16} /></button></div>{extra}</div><div className="day-tag-chips">{tags.map((tag) => <span key={tag} className="day-tag">{tag}<button type="button" aria-label={t('removeDayTag', { tag })} onClick={() => remove(tag)}><X size={12} /></button></span>)}</div>
    {selection !== null && <Dialog title={t('editDayTags')} initialFocusRef={inputRef} t={t} onClose={() => setSelection(null)} navigationDirty={text.trim() !== '' || JSON.stringify(selection) !== JSON.stringify(tags)} footer={<><button type="button" className="button secondary" onClick={() => setSelection(null)}>{t('cancel')}</button><button type="button" className="button primary" onClick={apply}>{t('apply')}</button></>}>
      <div className="day-tag-input"><label htmlFor={inputId}>{t('newDayTag')}</label><div className="day-tag-add"><input id={inputId} ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } }} /><button type="button" className="button secondary" disabled={!text.trim() || selection.includes(text.trim())} onClick={add}><Plus size={14} />{t('addDayTag')}</button></div></div>
      <fieldset className="day-tag-options"><legend>{t('availableTags')}</legend>{choices.length ? choices.map((tag) => <label key={tag}><input type="checkbox" checked={selection.includes(tag)} onChange={(event) => setSelection(event.target.checked ? [...selection, tag] : selection.filter((item) => item !== tag))} /><span>{tag}</span></label>) : <p className="field-hint">{t('noAvailableTags')}</p>}</fieldset>
    </Dialog>}
  </section>;
}
