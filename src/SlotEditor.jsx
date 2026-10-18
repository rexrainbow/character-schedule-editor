import EngineKeyField from './EngineKeyField.jsx';
import BranchRulesEditor from './BranchRulesEditor.jsx';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import IconField from './IconField.jsx';
import ActionMenu from './ActionMenu.jsx';
import { FieldError } from './ui.jsx';

export default function SlotEditor({ slot, onChange, onDuplicate, onDelete, onReturnDay, returnDayName, operandNodes = {}, tasks = [], t }) {
  // Both standalone and day/week modal editors receive the current task definitions.
  function patch(values) { onChange({ ...slot, ...values }); }
  return <div className="slot-editor">
    <section className="schedule-titlebar">
      {onReturnDay && <button className="button secondary return-day-button" title={t('returnDayNamed', { name: returnDayName })} onClick={onReturnDay}><ArrowLeft size={16} />{t('returnToDay')}</button>}
      <div className="schedule-name"><label className="sr-only" htmlFor={`slot-name-${slot.uid}`}>{t('name')}</label><div className="name-with-icon"><IconField value={slot.icon} onChange={(icon) => patch({ icon })} t={t} /><input id={`slot-name-${slot.uid}`} aria-label={t('name')} aria-invalid={!slot.name.length} value={slot.name} onChange={(e) => patch({ name: e.target.value })} /><EngineKeyField kind="slots" item={slot} onChange={(engine_key) => patch({ engine_key })} t={t} /></div><FieldError show={!slot.name.length} t={t} /></div>
      {(onDuplicate || onDelete) && <ActionMenu label={t('slotActions')} items={[...(onDuplicate ? [{ label: t('duplicate'), icon: Copy, onClick: onDuplicate }] : []), ...(onDelete ? [{ label: t('deleteSlot'), icon: Trash2, danger: true, onClick: onDelete }] : [])]} />}
    </section>
    <BranchRulesEditor allowEmpty emptyHint="emptySlotHint" branches={slot.branches} nodes={operandNodes} tasks={tasks} t={t} onChange={(branches) => patch({ branches })} />
  </div>;
}
