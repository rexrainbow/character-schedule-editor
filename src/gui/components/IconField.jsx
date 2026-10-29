import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import SlotIcon from './SlotIcon.jsx';
import { Dialog } from './ui.jsx';
import { IconDialogContext } from '../contexts/iconDialogContext.js';
import { categories, findIcons, iconLabel, canonicalIconName } from '../../icons/catalog.js';
import { backgrounds, backgroundColor, composeIcon, parseIcon } from '../../icons/appearance.js';

function IconPicker({ value, onApply, onClose, t }) {
  const host = useContext(IconDialogContext);
  const [selected, setSelected] = useState(canonicalIconName(value) ?? '');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const items = findIcons(search, category);
  const appearance = parseIcon(selected);
  const background = selected.includes('|') ? selected.split('|')[1].trim() : backgroundColor(selected) ? selected : '';
  function setBackground(next) { setSelected(composeIcon(appearance.foreground, next)); }
  const view = {
    title: t('chooseIcon'), onClose, t, wide: true,
    children: <>
      <div className="icon-picker-tools"><label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchIcons')} placeholder={t('searchIcons')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><label className="icon-category"><span>{t('iconCategory')}</span><select aria-label={t('iconCategory')} value={category} onChange={(e) => setCategory(e.target.value)}>{['all', ...categories].map((key) => <option key={key} value={key}>{t(`icons_${key}`)}</option>)}</select></label></div>
      <div className="icon-background-tools"><label>{t('iconBackground')}<select aria-label={t('iconBackground')} value={background.startsWith('#') || background && !backgrounds.some((item) => item.id === background) ? 'custom' : background} onChange={(event) => setBackground(event.target.value === 'custom' ? '#60A5FA' : event.target.value)}><option value="">{t('defaultIconBackground')}</option>{backgrounds.map((item) => <option key={item.id} value={item.id}>{iconLabel(item, t.locale)}</option>)}<option value="custom">{t('customIconBackground')}</option></select></label><label>{t('iconHexColor')}<input aria-label={t('iconHexColor')} placeholder="#60A5FA" value={background.startsWith('#') ? background : ''} onChange={(event) => setBackground(event.target.value)} spellCheck={false} /></label><button type="button" className="button secondary" onClick={() => setSelected(background || 'gray')}>{t('iconNoForeground')}</button></div>
      <div className="icon-grid" role="group" aria-label={t('iconChoices')}>{items.map((item) => { const active = item.color ? selected === item.id : appearance.foreground === item.id; return <button type="button" key={item.id} className={`icon-choice ${active ? 'selected' : ''}`} aria-label={iconLabel(item, t.locale)} aria-pressed={active} title={iconLabel(item, t.locale)} onClick={() => setSelected(item.color ? item.id : composeIcon(item.id, background))}><SlotIcon name={item.color ? item.id : composeIcon(item.id, background)} /><span>{iconLabel(item, t.locale)}</span></button>; })}</div>
      {!items.length && <p className="selector-empty">{t('noIcons')}</p>}
      <p className="icon-preview"><SlotIcon name={selected} /><span>{selected || t('defaultIcon')}</span></p>
      {!!appearance.warnings.length && <p className="icon-warning-message" role="status"><AlertTriangle size={16} />{appearance.warnings.map((key) => t(key)).join(' ')}</p>}
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
  const warning = parseIcon(value).warnings.map((key) => t(key)).join(' ');
  function close() { setOpen(false); requestAnimationFrame(() => button.current?.focus()); }
  return <><button ref={button} type="button" className="icon-field" aria-label={t('chooseIcon')} title={warning || t('chooseIcon')} onClick={() => setOpen(true)}><SlotIcon name={value} />{warning && <AlertTriangle className="icon-warning" size={12} aria-label={warning} />}</button>{open && <IconPicker value={value} onApply={onChange} onClose={close} t={t} />}</>;
}
