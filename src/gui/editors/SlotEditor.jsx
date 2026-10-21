import DescriptionField from '../components/DescriptionField.jsx';
import EngineKeyField from '../components/EngineKeyField.jsx';
import LogicOverview from '../components/LogicOverview.jsx';
import BranchRulesEditor from './BranchRulesEditor.jsx';
import { ArrowLeft, Copy, Trash2, Plus } from 'lucide-react';
import PriorityCandidatesEditor from './PriorityCandidatesEditor.jsx';
import { createCandidate } from '../../core/taskMacroModel.js';
import IconField from '../components/IconField.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import { FieldError } from '../components/ui.jsx';

export default function SlotEditor({ slot, onChange, onDuplicate, onDelete, onReturnDay, returnDayName, onOpenMacro, operandNodes = {}, tasks = [], t }) {
  // Both standalone and day/week modal editors receive the current task definitions.
  function patch(values) { onChange({ ...slot, ...values }); }
  return <div className="slot-editor">
    <section className="schedule-titlebar">
      {onReturnDay && <button className="button secondary return-day-button" title={t('returnDayNamed', { name: returnDayName })} onClick={onReturnDay}><ArrowLeft size={16} />{t('returnToDay')}</button>}
      <div className="schedule-name"><label className="sr-only" htmlFor={`slot-name-${slot.uid}`}>{t('name')}</label><div className="name-with-icon"><IconField value={slot.icon} onChange={(icon) => patch({ icon })} t={t} /><input id={`slot-name-${slot.uid}`} aria-label={t('name')} value={slot._fallbackValue !== undefined ? '' : slot.name} placeholder={slot.symbol} onChange={(e) => patch({ name: e.target.value })} /><EngineKeyField kind="slots" item={slot} onChange={(symbol) => patch({ symbol })} t={t} /></div></div>
      {(onDuplicate || onDelete) && <ActionMenu label={t('slotActions')} items={[...(onDuplicate ? [{ label: t('duplicate'), icon: Copy, onClick: onDuplicate }] : []), ...(onDelete ? [{ label: t('deleteSlot'), icon: Trash2, danger: true, onClick: onDelete }] : [])]} />}
    </section><DescriptionField value={slot.description} onChange={(description) => patch({ description })} t={t} />
    <LogicOverview slot={slot} nodes={operandNodes} tasks={tasks} t={t} />
    {slot.mode === 'priority' ? <PriorityCandidatesEditor candidates={slot.candidates} nodes={operandNodes} tasks={tasks} onOpenMacro={onOpenMacro} t={t} onChange={(candidates) => {
      if (candidates.length) patch({ candidates });
      else { const { mode, candidates: previousCandidates, ...base } = slot; onChange({ ...base, branches: [] }); }
    }} /> : <BranchRulesEditor allowEmpty emptyHint="emptySlotHint" emptyActions={<button className="button add-branch" onClick={() => patch({ mode: 'priority', branches: [], candidates: [createCandidate()] })}><Plus size={17} />{t('addSlotPriority')}</button>} branches={slot.branches} nodes={operandNodes} tasks={tasks} t={t} onChange={(branches) => patch({ branches })} />}
  </div>;
}
