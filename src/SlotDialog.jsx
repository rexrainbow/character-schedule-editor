import { builtinVariableDefinitions } from './builtinTasks.js';
import { useState } from 'react';
import { Copy, Pencil, Plus, Search } from 'lucide-react';
import { applySlotEdit, assignCell, clone, compileDraft, createSlot, duplicateSlot, referenceCount, taskSummary } from './model.js';
import { Dialog, SlotInfo } from './ui.jsx';
import SlotEditor from './SlotEditor.jsx';

export default function SlotDialog({ draft, day, index, onCommit, onClose, t, onApplySlot, contextSubtitle, weekContext = false }) {
  const [selectedId, setSelectedId] = useState(day.slotIds[index]);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const selected = draft.slots.find((slot) => slot.id === selectedId);
  const filtered = draft.slots.filter((slot) => `${slot.name} ${taskSummary(slot, t('unnamedTask'), draft.tasks, draft.taskMacros, Object.fromEntries(builtinVariableDefinitions(draft.builtinTasks, t).map((item) => [item.id.slice(8), item.display_name])))}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const editErrors = edit ? compileDraft([edit.slot], draft.operandNodes, draft.tasks, draft.taskMacros).errors : [];
  const invalid = edit ? editErrors.length > 0 : !selected;
  function start(mode) {
    const slot = mode === 'create' ? createSlot(draft.slots, t('newSlot')) : mode === 'duplicate' ? duplicateSlot(draft.slots, selected) : clone(selected);
    setEdit({ mode, slot });
  }
  function apply() {
    if (invalid) return;
    if (onApplySlot) { onApplySlot(edit ? edit.slot.id : selectedId, edit?.slot ?? null); onClose(); return; }
    const next = edit ? applySlotEdit(draft, edit.slot, day.id, index) : assignCell(draft, day.id, index, selectedId);
    onCommit(next); onClose();
  }
  function clear() { if (onApplySlot) onApplySlot(null, null); else onCommit(assignCell(draft, day.id, index, null)); setSelectedId(null); }
  const title = edit ? t(edit.mode === 'create' ? 'newSlotDialog' : edit.mode === 'duplicate' ? 'duplicateSlotDialog' : 'editSlotDialog') : t('selector');
  return <Dialog title={title} subtitle={contextSubtitle ?? t('sourceCell', { name: day.name, count: index + 1 })} t={t} wide onClose={onClose}
    footer={<>{!edit && <button className="button clear-button" onClick={clear}>{t('clearAssignment')}</button>}<div className="modal-footer-right">{edit && <button className="button secondary" onClick={() => setEdit(null)}>{t('back')}</button>}<button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={apply} disabled={invalid}>{t('apply')}</button></div></>}>
    {edit ? <>
      {edit.mode === 'edit' && <p className="shared-warning">{weekContext ? t('weekSharedWarning') : t('sharedWarning', { count: referenceCount(draft, edit.slot.id) })}</p>}
      <SlotEditor tasks={draft.tasks} operandNodes={draft.operandNodes} slot={edit.slot} onChange={(slot) => setEdit({ ...edit, slot })} t={t} />
      <p className="field-hint dialog-hint">{t(weekContext ? 'weekApplyHint' : 'applyHint')}</p>
    </> : <>
      <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchSlots')} placeholder={t('searchSlots')} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className="selector-list" role="radiogroup" aria-label={t('slots')}>
        {filtered.map((slot) => <button key={slot.id} role="radio" aria-checked={slot.id === selectedId} className={`selector-item ${slot.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(slot.id)}><span className="radio-dot" /><SlotInfo slot={slot} t={t} /></button>)}
        {!filtered.length && <p className="selector-empty">{t(draft.slots.length ? 'noResults' : 'noSlots')}</p>}
      </div>
      <div className="selector-actions"><button className="button secondary" onClick={() => start('create')}><Plus size={15} />{t('newSlotDialog')}</button><button className="button secondary" disabled={!selected} onClick={() => start('duplicate')}><Copy size={15} />{t('duplicate')}</button><button className="button secondary" disabled={!selected} onClick={() => start('edit')}><Pencil size={15} />{t('editSlot')}</button></div>
      <p className="field-hint dialog-hint">{t('clearHint')}</p>
    </>}
  </Dialog>;
}
