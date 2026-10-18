import { useBuiltinTaskDefinitions } from './builtinTasks.js';
import { EngineKeyWarning } from './EngineKeyField.jsx';
import { TaskContext, TaskMacrosContext } from './TaskContext.js';
import { useContext, useEffect, useRef, useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import SlotIcon from './SlotIcon.jsx';
import { taskSummary } from './model.js';
import { IconDialogContext } from './iconDialogContext.js';

export function IconButton({ icon: Icon, label, onClick, disabled = false, danger = false }) {
  return <button type="button" className={`icon-button ${danger ? 'danger' : ''}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon size={16} /></button>;
}

export function FieldError({ show, t, message = 'requiredText' }) {
  return show ? <p className="inline-error" role="alert">{t(message)}</p> : null;
}

export function Issues({ errors, t }) {
  return <ul className="issues">{errors.map((error, index) => <li key={index}><code>{error.path}</code><span>{t(error.key, { field: error.field })}</span></li>)}</ul>;
}

export function SlotInfo({ slot, t }) {
  const tasks = useContext(TaskContext);
  const taskMacros = useContext(TaskMacrosContext);
  const builtinDefinitions = useBuiltinTaskDefinitions(t);
  const summary = taskSummary(slot, t('unnamedTask'), tasks, taskMacros, Object.fromEntries(builtinDefinitions.map((item) => [item.id.slice(8), item.display_name])));
  return <><SlotIcon name={slot.icon} label={t('icon')} /><div className="slot-info-text"><strong title={slot.name}>{slot.name || '—'}</strong><EngineKeyWarning kind="slots" id={slot.id} value={slot.engine_key} t={t} /><span title={summary}>{summary}</span></div></>;
}

export function SlotCellContent({ slot, t }) {
  return <div className="cell-content">{slot ? <SlotInfo slot={slot} t={t} /> : <><Plus size={19} /><span>{t('selectCell')}</span></>}</div>;
}

export function Dialog({ title, subtitle, children, footer, onClose, t, wide = false }) {
  const ref = useRef(null);
  const headingId = useId();
  const [view, setView] = useState(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    return () => element.close();
  }, []);
  const close = view?.onClose ?? onClose;
  return <dialog ref={ref} className={`modal ${(view?.wide ?? wide) ? 'modal-wide' : ''}`} aria-labelledby={headingId} onCancel={(e) => { e.preventDefault(); close(); }}>
    <div className="modal-header"><div><h2 id={headingId}>{view?.title ?? title}</h2>{!view && subtitle && <p>{subtitle}</p>}</div><IconButton icon={X} label={t('close')} onClick={close} /></div>
    <div className="modal-body" hidden={!!view}><IconDialogContext.Provider value={setView}>{children}</IconDialogContext.Provider></div>
    {view && <div className="modal-body">{view.children}</div>}
    <div className="modal-footer">{view?.footer ?? footer}</div>
  </dialog>;
}
