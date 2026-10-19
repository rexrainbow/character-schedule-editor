import { editProject } from '../../core/projectApi.js';
import { builtinTaskDefinitions } from '../hooks/builtinTasks.js';
import { useState } from 'react';
import { Copy, Pencil, Plus, Search } from 'lucide-react';
import { clone, compileDraft, referenceCount, taskSummary } from '../../core/model.js';
import { Dialog, SlotInfo } from '../components/ui.jsx';
import SlotEditor from '../editors/SlotEditor.jsx';
import { dayAssignment, assignmentLabel } from '../../core/dayEvents.js';

export default function SlotDialog({ draft, day, index, onCommit, onClose, t, onApplySlot, contextSubtitle, weekContext = false }) {
  const [selectedId, setSelectedId] = useState(dayAssignment(day, index));
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const searchName = search.trim();
  const exactMatches = draft.slots.filter((slot) => slot.name.trim() === searchName);
  const selected = draft.slots.find((slot) => slot.id === selectedId);
  const filtered = draft.slots.filter((slot) => `${slot.name} ${taskSummary(slot, t('unnamedTask'), draft.tasks, draft.taskMacros, Object.fromEntries(builtinTaskDefinitions(draft.builtinTasks, t).map((item) => [item.id.slice(8), item.display_name])))}`.toLocaleLowerCase().includes(searchName.toLocaleLowerCase()));
  const editErrors = edit ? compileDraft([edit.slot], draft.operandNodes, draft.tasks, draft.taskMacros, draft.enumNodes).errors : [];
  const invalid = edit ? editErrors.length > 0 : !selected;
  function start(mode) {
    const slot = mode === 'create' ? editProject(draft, t).slots.newDraft(t('newSlot')) : mode === 'duplicate' ? editProject(draft, t).slots.duplicateDraft(selected.id) : clone(selected);
    setEdit({ mode, slot });
  }
  function apply() {
    if (invalid) return;
    if (onApplySlot) { onApplySlot(edit ? edit.slot.id : selectedId, edit?.slot ?? null); onClose(); return; }
    const next = edit ? editProject(draft, t).days.assignSlot(day.id, index, edit.slot.id, edit.slot).draft : editProject(draft, t).days.assignSlot(day.id, index, selectedId).draft;
    onCommit(next); onClose();
  }
  function clear() { if (onApplySlot) onApplySlot(null, null); else onCommit(editProject(draft, t).days.assignSlot(day.id, index, null).draft); setSelectedId(null); }
  function assignNamed() {
    if (!searchName || exactMatches.length > 1) return;
    const slot = exactMatches[0] ?? editProject(draft, t).slots.newDraft(searchName);
    const created = !exactMatches.length;
    if (onApplySlot) onApplySlot(slot.id, created ? slot : null);
    else onCommit(created ? editProject(draft, t).days.assignSlot(day.id, index, slot.id, slot).draft : editProject(draft, t).days.assignSlot(day.id, index, slot.id).draft);
    onClose();
  }
  const title = edit ? t(edit.mode === 'create' ? 'newSlotDialog' : edit.mode === 'duplicate' ? 'duplicateSlotDialog' : 'editSlotDialog') : t('selector');
  return <Dialog title={title} subtitle={contextSubtitle ?? `${day.name} / ${assignmentLabel(index, t)}`} t={t} wide onClose={onClose}
    footer={<>{!edit && <button className="button clear-button" onClick={clear}>{t('clearAssignment')}</button>}<div className="modal-footer-right">{edit && <button className="button secondary" onClick={() => setEdit(null)}>{t('back')}</button>}<button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={apply} disabled={invalid}>{t('apply')}</button></div></>}>
    {edit ? <>
      {edit.mode === 'edit' && <p className="shared-warning">{weekContext ? t('weekSharedWarning') : t('sharedWarning', { count: referenceCount(draft, edit.slot.id) })}</p>}
      <SlotEditor tasks={draft.tasks} operandNodes={draft.operandNodes} slot={edit.slot} onChange={(slot) => setEdit({ ...edit, slot })} t={t} />
      <p className="field-hint dialog-hint">{t(weekContext ? 'weekApplyHint' : 'applyHint')}</p>
    </> : <>
      <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchSlots')} placeholder={t('searchSlots')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); assignNamed(); } }} /></label>
      {searchName && exactMatches.length === 0 && <button className="button primary" onClick={assignNamed}><Plus size={15} />{t('createAndAssignSlot', { name: searchName })}</button>}
      {searchName && exactMatches.length === 1 && <button className="button primary" onClick={assignNamed}>{t('assignNamedSlot', { name: exactMatches[0].name })}</button>}
      {searchName && exactMatches.length > 1 && <p className="field-hint">{t('chooseSameNameSlot')}</p>}
      <div className="selector-list" role="radiogroup" aria-label={t('slots')}>
        {filtered.map((slot) => <button key={slot.id} role="radio" aria-checked={slot.id === selectedId} className={`selector-item ${slot.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(slot.id)}><span className="radio-dot" /><SlotInfo slot={slot} t={t} /></button>)}
        {!filtered.length && <p className="selector-empty">{t(draft.slots.length ? 'noResults' : 'noSlots')}</p>}
      </div>
      <div className="selector-actions"><button className="button secondary" onClick={() => start('create')}><Plus size={15} />{t('newSlotDialog')}</button><button className="button secondary" disabled={!selected} onClick={() => start('duplicate')}><Copy size={15} />{t('duplicate')}</button><button className="button secondary" disabled={!selected} onClick={() => start('edit')}><Pencil size={15} />{t('editSlot')}</button></div>
      <p className="field-hint dialog-hint">{t('clearHint')}</p>
    </>}
  </Dialog>;
}
