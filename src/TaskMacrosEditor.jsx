import PriorityCandidatesEditor from './PriorityCandidatesEditor.jsx';
import MacroEligibilityEditor from './MacroEligibilityEditor.jsx';
import ParameterContractFields from './ParameterContractFields.jsx';
import EngineKeyField, { EngineKeyWarning } from './EngineKeyField.jsx';
import IconField from './IconField.jsx';
import SlotIcon from './SlotIcon.jsx';
import useEditorView from './useEditorView.js';
import { hasTaskValues, macroEntries, TASK_MACRO_MODES } from './operandModel.js';
import BranchRulesEditor from './BranchRulesEditor.jsx';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2 } from 'lucide-react';
import ActionMenu from './ActionMenu.jsx';
import { FieldError, IconButton } from './ui.jsx';
import TaskUseEditor from './TaskUseEditor.jsx';
import { createParameter } from './taskModel.js';
import { changeMacroMode, changeMacroParameterType, createTaskMacro, createTaskStep, deleteMacroParameter, deleteTaskMacro, duplicateTaskMacro, macroParameterReferences, macroUses, taskMacroDefinitionErrors } from './taskMacroModel.js';

export default function TaskMacrosEditor({ draft, onChange, t, view, onViewChange }) {
  const [selected, setSelected, search, setSearch] = useEditorView(view, onViewChange);
  const [blocked, setBlocked] = useState([]);
  const propertiesRef = useRef(null);
  function openMacro(id) { setSelected(id); setSearch(''); requestAnimationFrame(() => propertiesRef.current?.scrollTo({ top: 0 })); }
  const sequence = draft.taskMacros.find((item) => item.id === selected) ?? draft.taskMacros[0];
  const uses = sequence ? macroUses(draft.slots, sequence.id, draft.taskMacros) : [];
  function commit(next) { onChange(next); setBlocked([]); }
  function update(values) { commit({ ...draft, taskMacros: draft.taskMacros.map((item) => item.id === sequence.id ? { ...sequence, ...values } : item) }); }
  function add() { const next = createTaskMacro(t('newTaskMacro')); commit({ ...draft, taskMacros: [...draft.taskMacros, next] }); setSelected(next.id); setSearch(''); }
  function copy() { const next = duplicateTaskMacro(sequence); commit({ ...draft, taskMacros: [...draft.taskMacros, next] }); setSelected(next.id); setSearch(''); }
  function remove() { if (!uses.length && window.confirm(t('deleteTaskMacroConfirm', { name: sequence.display_name }))) { commit(deleteTaskMacro(draft, sequence.id)); setSelected(null); } }
  function mode(nextMode) {
    const result = changeMacroMode(draft, sequence.id, nextMode);
    if (result.blocked.length) { setBlocked(result.blocked); return; }
    const hasContent = macroEntries(sequence).some(({ entry }) => entry.condition != null || entry.task?.task_id || entry.task?.task_macro_id || entry.task?.builtin || hasTaskValues(entry.task));
    if (hasContent && !window.confirm(t('macroModeConfirm'))) return;
    commit(result.draft);
  }
  function type(p, nextType) { const result = changeMacroParameterType(draft, sequence.id, p.id, nextType); if (result.blocked.length) setBlocked(result.blocked); else commit(result.draft); }
  function removeParameter(p) { if (!macroParameterReferences(sequence, p.id).length && window.confirm(t('deleteParameterConfirm', { name: p.display_name, count: uses.length }))) commit(deleteMacroParameter(draft, sequence.id, p.id)); }
  function move(key, index, offset) { const list = [...sequence[key]]; [list[index], list[index + offset]] = [list[index + offset], list[index]]; update({ [key]: list }); }
  function copyStep(index) { const steps = [...sequence.steps], step = structuredClone(steps[index]); step.id = crypto.randomUUID(); steps.splice(index + 1, 0, step); update({ steps }); }
  const errors = sequence ? taskMacroDefinitionErrors([sequence]) : [];
  return <div className="operand-workspace tasks-workspace"><aside className="operand-sidebar"><h2>{t('taskMacros')}</h2><label className="search-field"><Search size={16} /><input aria-label={t('searchTaskMacros')} placeholder={t('searchTaskMacros')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><button className="button secondary" onClick={add}><Plus size={16} />{t('addTaskMacro')}</button><div className="slot-list">{draft.taskMacros.filter((item) => item.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => <button key={item.id} className={`slot-item ${sequence?.id === item.id ? 'selected' : ''}`} aria-pressed={sequence?.id === item.id} onClick={() => { setSelected(item.id); setBlocked([]); }}><SlotIcon name={item.icon || 'tabler:briefcase'} /><strong>{item.display_name || '—'}</strong><EngineKeyWarning kind="taskMacros" id={item.id} value={item.engine_key} t={t} /><span className="count">{macroEntries(item).length}</span></button>)}</div></aside>
    <main ref={propertiesRef} className="operand-properties-area">{sequence ? <div className="task-definition-editor"><section className="schedule-titlebar"><div className="schedule-name"><div className="name-with-icon"><IconField value={sequence.icon || 'tabler:briefcase'} onChange={(icon) => update({ icon })} t={t} /><input aria-label={t('name')} value={sequence.display_name} aria-invalid={!sequence.display_name.trim()} onChange={(e) => update({ display_name: e.target.value })} /><EngineKeyField kind="taskMacros" item={sequence} onChange={(engine_key) => update({ engine_key })} t={t} /></div><FieldError show={!sequence.display_name.trim()} t={t} /></div><ActionMenu label={t('taskMacroActions')} items={[{ label: t('duplicateTaskMacro'), icon: Copy, onClick: copy }, { label: t('deleteTaskMacro'), icon: Trash2, disabled: uses.length > 0, danger: true, onClick: remove }]} /></section>
      <label className="macro-mode">{t('macroMode')}<select aria-label={t('macroMode')} value={sequence.mode} onChange={(e) => mode(e.target.value)}>{TASK_MACRO_MODES.map((mode) => <option key={mode} value={mode}>{t('macroMode_' + mode)}</option>)}</select></label>
      <section className="task-parameters"><div className="section-heading"><h2>{t('macroParameters')}</h2><button className="button secondary" onClick={() => update({ parameters: [...sequence.parameters, createParameter(t('newParameter'))] })}><Plus size={16} />{t('addParameter')}</button></div><p className="field-hint">{t('macroParametersHint')}</p>
        {sequence.parameters.map((p, index) => { const refs = macroParameterReferences(sequence, p.id); return <article className="parameter-row" key={p.id}><label>{t('parameterName')}<input aria-label={t('parameterName')} value={p.display_name} aria-invalid={!p.display_name.trim()} onChange={(e) => update({ parameters: sequence.parameters.map((item) => item.id === p.id ? { ...item, display_name: e.target.value } : item) })} /></label><ParameterContractFields parameter={p} locked={false} onChange={(change) => type(p, change)} t={t} /><div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => move('parameters', index, -1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === sequence.parameters.length - 1} onClick={() => move('parameters', index, 1)} /><IconButton icon={Trash2} label={t('deleteParameter')} disabled={refs.length > 0} danger onClick={() => removeParameter(p)} /></div>{refs.length > 0 && <p className="field-hint parameter-reference-hint">{t('macroParameterInUse')}</p>}</article>; })}
      </section>
      <MacroEligibilityEditor key={sequence.id} macro={sequence} nodes={draft.operandNodes} onChange={(eligibility) => update({ eligibility })} t={t} />
      {blocked.length > 0 && <div className="shared-warning" role="alert"><p>{t('macroChangeBlocked')}</p>{blocked.map((ref) => <p key={ref.path}><code>{ref.path}</code></p>)}</div>}
      {errors.filter((e) => e.key !== 'requiredText' || e.path.includes('/parameters/')).map((e, index) => <p role="alert" className="inline-error" key={index}>{t(e.key)}</p>)}
      {sequence.mode === 'branch' ? <BranchRulesEditor ownerMacroId={sequence.id} allowEmpty branches={sequence.branches} nodes={draft.operandNodes} tasks={draft.tasks} parameters={sequence.parameters} allowedMacroModes={TASK_MACRO_MODES} t={t} onChange={(branches) => update({ branches })} /> : sequence.mode === 'priority' ? <PriorityCandidatesEditor candidates={sequence.candidates} onChange={(candidates) => update({ candidates })} tasks={draft.tasks} nodes={draft.operandNodes} parameters={sequence.parameters} ownerMacroId={sequence.id} onOpenMacro={openMacro} t={t} /> : <section className="task-steps"><div className="section-heading"><h2>{t('taskSteps')}</h2><button className="button secondary" onClick={() => update({ steps: [...sequence.steps, createTaskStep()] })}><Plus size={16} />{t('addTaskStep')}</button></div><p className="field-hint">{t('taskStepsHint')}</p>
        {!sequence.steps.length && <p className="field-hint">{t('emptyMacroHint')}</p>}
        {sequence.steps.map((step, index) => <article className="branch-card task-step" key={step.id} aria-label={t('taskStep', { count: index + 1 })}><div className="branch-header"><strong>{t('taskStep', { count: index + 1 })}</strong><div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => move('steps', index, -1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === sequence.steps.length - 1} onClick={() => move('steps', index, 1)} /><IconButton icon={Copy} label={t('duplicateTaskStep')} onClick={() => copyStep(index)} /><IconButton icon={Trash2} label={t('deleteTaskStep')} danger onClick={() => update({ steps: sequence.steps.filter((item) => item.id !== step.id) })} /></div></div><div className="branch-body"><TaskUseEditor ownerMacroId={sequence.id} allowedMacroModes={TASK_MACRO_MODES} parameters={sequence.parameters} branch={step} tasks={draft.tasks} nodes={draft.operandNodes} t={t} onChange={(values) => update({ steps: sequence.steps.map((item) => item.id === step.id ? { ...item, ...values } : item) })} /></div></article>)}
        {sequence.steps.length > 0 && <button className="button add-branch" onClick={() => update({ steps: [...sequence.steps, createTaskStep()] })}><Plus size={16} />{t('addTaskStep')}</button>}
       </section>}{uses.length > 0 && <div className="shared-warning"><p>{t('taskMacroInUse')}</p>{uses.map((use) => <p key={use.path}>{use.slot} · {t('branchLabel', { count: use.branch })}</p>)}</div>}
    </div> : <div className="empty-state"><h2>{t('noTaskMacros')}</h2><p>{t('taskMacrosHint')}</p><button className="button primary" onClick={add}><Plus size={16} />{t('addTaskMacro')}</button></div>}</main>
  </div>;
}
