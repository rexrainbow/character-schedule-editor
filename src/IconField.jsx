import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import SlotIcon from './SlotIcon.jsx';
import { Dialog } from './ui.jsx';
import { IconDialogContext } from './iconDialogContext.js';
import { categories, findIcons, iconLabel, canonicalIconName } from './icons/catalog.js';

function IconPicker({ value, onApply, onClose, t }) {
  const host = useContext(IconDialogContext);
  const [selected, setSelected] = useState(canonicalIconName(value) ?? '');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const items = findIcons(search, category);
  const view = {
    title: t('chooseIcon'), onClose, t, wide: true,
    children: <>
      <div className="icon-picker-tools"><label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchIcons')} placeholder={t('searchIcons')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><label className="icon-category"><span>{t('iconCategory')}</span><select aria-label={t('iconCategory')} value={category} onChange={(e) => setCategory(e.target.value)}>{['all', ...categories].map((key) => <option key={key} value={key}>{t(`icons_${key}`)}</option>)}</select></label></div>
      <div className="icon-grid" role="group" aria-label={t('iconChoices')}>{items.map((item) => <button type="button" key={item.id} className={`icon-choice ${selected === item.id ? 'selected' : ''}`} aria-label={iconLabel(item, t.locale)} aria-pressed={selected === item.id} title={iconLabel(item, t.locale)} onClick={() => setSelected(item.id)}><SlotIcon name={item.id} /><span>{iconLabel(item, t.locale)}</span></button>)}</div>
      {!items.length && <p className="selector-empty">{t('noIcons')}</p>}
      <p className="icon-preview"><SlotIcon name={selected} /><span>{selected || t('defaultIcon')}</span></p>
    </>,
    footer: <><button className="button secondary icon-clear" onClick={() => setSelected('')}>{t('clearIcon')}</button><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={() => { onApply(selected); onClose(); }}>{t('apply')}</button></>,
  };
  // Inside an editor dialog, replace its view while keeping its draft mounted.
  useLayoutEffect(() => { if (host) host(view); }, [host, selected, search, category, t]);
  useLayoutEffect(() => () => { if (host) host(null); }, [host]);
  return host ? null : <Dialog {...view} />;
}

export default function IconField({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  function close() { setOpen(false); requestAnimationFrame(() => button.current?.focus()); }
  return <><button ref={button} type="button" className="icon-field" aria-label={t('chooseIcon')} title={t('chooseIcon')} onClick={() => setOpen(true)}><SlotIcon name={value} /></button>{open && <IconPicker value={value} onApply={onChange} onClose={close} t={t} />}</>;
}
