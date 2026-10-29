import WeightedCandidatesEditor from './WeightedCandidatesEditor.jsx';
import DescriptionField from '../components/DescriptionField.jsx';
import { editProject } from '../../core/projectApi.js';
import PriorityCandidatesEditor from './PriorityCandidatesEditor.jsx';
import LogicOverview from '../components/LogicOverview.jsx';
import MacroEligibilityEditor from './MacroEligibilityEditor.jsx';
import ParameterContractFields from '../components/ParameterContractFields.jsx';
import EngineKeyField, { EngineKeyWarning } from '../components/EngineKeyField.jsx';
import IconField from '../components/IconField.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import useEditorView from '../hooks/useEditorView.js';
import { hasTaskValues, macroEntries, TASK_MACRO_MODES } from '../../core/operandModel.js';
import BranchRulesEditor from './BranchRulesEditor.jsx';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2 } from 'lucide-react';
import ActionMenu from '../components/ActionMenu.jsx';
import { FieldError, IconButton } from '../components/ui.jsx';
import TaskUseEditor from './TaskUseEditor.jsx';

import { macroParameterReferences, macroUses, taskMacroDefinitionErrors } from '../../core/taskMacroModel.js';

export default function TaskMacrosEditor({ draft, onChange, t, view, onViewChange }) {
  const [selected, setSelected, search, setSearch] = useEditorView(view, onViewChange);
  const [blocked, setBlocked] = useState([]);
  const propertiesRef = useRef(null);
  function openMacro(id) { setSelected(id); setSearch(''); requestAnimationFrame(() => propertiesRef.current?.scrollTo({ top: 0 })); }
  const sequence = draft.taskMacros.find((item) => item.id === selected) ?? draft.taskMacros[0];
  const uses = sequence ? macroUses(draft.slots, sequence.id, draft.taskMacros) : [];
  function commit(next) { onChange(next); setBlocked([]); }
  function update(values) { commit(editProject(draft, t).taskMacros.update(sequence.id, values).draft); }
  function add() { const result = editProject(draft, t).taskMacros.create({ display_name: t('newTaskMacro') }); const next = result.value; commit(result.draft); setSelected(next.id); setSearch(''); }
  function copy() { const result = editProject(draft, t).taskMacros.duplicate(sequence.id); const next = result.value; commit(result.draft); setSelected(next.id); setSearch(''); }
  function remove() { if (!uses.length && window.confirm(t('deleteTaskMacroConfirm', { name: sequence.display_name }))) { commit(editProject(draft, t).taskMacros.remove(sequence.id).draft); setSelected(null); } }
  function mode(nextMode) {
    const result = editProject(draft, t).taskMacros.setMode(sequence.id, nextMode);
    if (result.blocked.length) { setBlocked(result.blocked); return; }
    const hasContent = macroEntries(sequence).some(({ entry, fallback }) => fallback || entry.weight != null || entry.condition != null || entry.task?.task_id || entry.task?.task_macro_id || entry.task?.builtin || hasTaskValues(entry.task));
    if (hasContent && !window.confirm(t('macroModeConfirm'))) return;
    commit(result.draft);
  }
  function type(p, nextType) { const result = editProject(draft, t).taskMacros.parameters(sequence.id).update(p.id, nextType); if (result.blocked.length) setBlocked(result.blocked); else commit(result.draft); }
  function removeParameter(p) { if (!macroParameterReferences(sequence, p.id).length && window.confirm(t('deleteParameterConfirm', { name: p.display_name, count: uses.length }))) commit(editProject(draft, t).taskMacros.parameters(sequence.id).remove(p.id).draft); }
  function move(key, index, offset) { commit(editProject(draft, t).taskMacros.moveEntry(sequence.id, key, index, offset).draft); }
  function copyStep(index) { commit(editProject(draft, t).taskMacros.duplicateStep(sequence.id, index).draft); }
  const errors = sequence ? taskMacroDefinitionErrors([sequence]) : [];
  return <div className="operand-workspace tasks-workspace"><aside className="operand-sidebar"><h2>{t('taskMacros')}</h2><label className="search-field"><Search size={16} /><input aria-label={t('searchTaskMacros')} placeholder={t('searchTaskMacros')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><button className="button secondary" onClick={add}><Plus size={16} />{t('addTaskMacro')}</button><div className="slot-list">{draft.taskMacros.filter((item) => item.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => <button key={item.id} className={`slot-item ${sequence?.id === item.id ? 'selected' : ''}`} aria-pressed={sequence?.id === item.id} onClick={() => { setSelected(item.id); setBlocked([]); }}><SlotIcon name={item.icon || 'tabler:briefcase'} /><strong>{item.display_name || '—'}</strong><EngineKeyWarning kind="taskMacros" id={item.id} value={item.symbol} t={t} /><span className="count">{macroEntries(item).length}</span></button>)}</div></aside>
    <main ref={propertiesRef} className="operand-properties-area">{sequence ? <div className="task-definition-editor"><section className="schedule-titlebar"><div className="schedule-name"><div className="name-with-icon"><IconField value={sequence.icon || 'tabler:briefcase'} onChange={(icon) => update({ icon })} t={t} /><input aria-label={t('name')} value={sequence._fallbackValue !== undefined ? '' : sequence.display_name} placeholder={sequence.symbol} onChange={(e) => update({ display_name: e.target.value })} /><EngineKeyField kind="taskMacros" item={sequence} onChange={(symbol) => update({ symbol })} t={t} /></div></div><ActionMenu label={t('taskMacroActions')} items={[{ label: t('duplicateTaskMacro'), icon: Copy, onClick: copy }, { label: t('deleteTaskMacro'), icon: Trash2, disabled: uses.length > 0, danger: true, onClick: remove }]} /></section><DescriptionField value={sequence.description} onChange={(description) => update({ description })} t={t} />
      {sequence.mode === 'random' && <p className="weighted-mode-order">{t('weightedExecutionOrder')}</p>}
      <label className="macro-mode">{t('macroMode')}<select aria-label={t('macroMode')} value={sequence.mode} onChange={(e) => mode(e.target.value)}>{TASK_MACRO_MODES.map((mode) => <option key={mode} value={mode}>{t('macroMode_' + mode)}</option>)}</select></label>
      <section className="task-parameters"><div className="section-heading"><h2>{t('macroParameters')}</h2><button className="button secondary" onClick={() => commit(editProject(draft, t).taskMacros.parameters(sequence.id).add(t('newParameter')).draft)}><Plus size={16} />{t('addParameter')}</button></div><p className="field-hint">{t('macroParametersHint')}</p>
        {sequence.parameters.map((p, index) => { const refs = macroParameterReferences(sequence, p.id); return <article className="parameter-row" key={p.id}><div className="parameter-name-fields"><IconField value={p.icon} onChange={(icon) => commit(editProject(draft, t).taskMacros.parameters(sequence.id).update(p.id, { icon }).draft)} t={t} /><label>{t('engineKey')}<input aria-label={t('engineKey')} value={p.symbol ?? ''} required pattern="[A-Za-z_][A-Za-z0-9_]*" onChange={(e) => commit(editProject(draft, t).taskMacros.parameters(sequence.id).update(p.id, { symbol: e.target.value }).draft)} /></label><label>{t('parameterName')}<input aria-label={t('parameterName')} value={p._fallbackValue !== undefined ? '' : p.display_name} placeholder={p.symbol} onChange={(e) => commit(editProject(draft, t).taskMacros.parameters(sequence.id).update(p.id, { display_name: e.target.value }).draft)} /></label></div><DescriptionField value={p.description} onChange={(description) => commit(editProject(draft, t).taskMacros.parameters(sequence.id).update(p.id, { description }).draft)} t={t} /><ParameterContractFields parameter={p} locked={false} onChange={(change) => type(p, change)} t={t} /><div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => move('parameters', index, -1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === sequence.parameters.length - 1} onClick={() => move('parameters', index, 1)} /><IconButton icon={Trash2} label={t('deleteParameter')} disabled={refs.length > 0} danger onClick={() => removeParameter(p)} /></div>{refs.length > 0 && <p className="field-hint parameter-reference-hint">{t('macroParameterInUse')}</p>}</article>; })}
      </section>
      <LogicOverview macro={sequence} nodes={draft.operandNodes} tasks={draft.tasks} t={t} />
      <MacroEligibilityEditor key={sequence.id} macro={sequence} nodes={draft.operandNodes} onChange={(eligibility) => update({ eligibility })} t={t} />
      {blocked.length > 0 && <div className="shared-warning" role="alert"><p>{t('macroChangeBlocked')}</p>{blocked.map((ref) => <p key={ref.path}><code>{ref.path}</code></p>)}</div>}
      {errors.filter((e) => e.key !== 'requiredText' || e.path.includes('/parameters/')).map((e, index) => <p role="alert" className="inline-error" key={index}>{t(e.key)}</p>)}
      {sequence.mode === 'branch' ? <BranchRulesEditor ownerMacroId={sequence.id} allowEmpty branches={sequence.branches} nodes={draft.operandNodes} tasks={draft.tasks} parameters={sequence.parameters} allowedMacroModes={TASK_MACRO_MODES} t={t} onChange={(branches) => update({ branches })} /> : sequence.mode === 'random' ? <WeightedCandidatesEditor macro={sequence} onChange={update} tasks={draft.tasks} nodes={draft.operandNodes} onOpenMacro={openMacro} t={t} /> : sequence.mode === 'priority' ? <PriorityCandidatesEditor candidates={sequence.candidates} onChange={(candidates) => update({ candidates })} tasks={draft.tasks} nodes={draft.operandNodes} parameters={sequence.parameters} ownerMacroId={sequence.id} onOpenMacro={openMacro} t={t} /> : <section className="task-steps"><div className="section-heading"><h2>{t('taskSteps')}</h2><button className="button secondary" onClick={() => commit(editProject(draft, t).taskMacros.addStep(sequence.id).draft)}><Plus size={16} />{t('addTaskStep')}</button></div><p className="field-hint">{t('taskStepsHint')}</p>
        {!sequence.steps.length && <p className="field-hint">{t('emptyMacroHint')}</p>}
        {sequence.steps.map((step, index) => <article className="branch-card task-step" key={step.id} aria-label={t('taskStep', { count: index + 1 })}><div className="branch-header"><strong>{t('taskStep', { count: index + 1 })}</strong><div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => move('steps', index, -1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === sequence.steps.length - 1} onClick={() => move('steps', index, 1)} /><IconButton icon={Copy} label={t('duplicateTaskStep')} onClick={() => copyStep(index)} /><IconButton icon={Trash2} label={t('deleteTaskStep')} danger onClick={() => update({ steps: sequence.steps.filter((item) => item.id !== step.id) })} /></div></div><div className="branch-body"><TaskUseEditor ownerMacroId={sequence.id} allowedMacroModes={TASK_MACRO_MODES} parameters={sequence.parameters} branch={step} tasks={draft.tasks} nodes={draft.operandNodes} t={t} onChange={(values) => update({ steps: sequence.steps.map((item) => item.id === step.id ? { ...item, ...values } : item) })} /><DescriptionField value={step.description} onChange={(description) => update({ steps: sequence.steps.map((item) => item.id === step.id ? { ...item, description } : item) })} t={t} /></div></article>)}
        {sequence.steps.length > 0 && <button className="button add-branch" onClick={() => commit(editProject(draft, t).taskMacros.addStep(sequence.id).draft)}><Plus size={16} />{t('addTaskStep')}</button>}
       </section>}{uses.length > 0 && <div className="shared-warning"><p>{t('taskMacroInUse')}</p>{uses.map((use) => <p key={use.path}>{use.slot} · {t('branchLabel', { count: use.branch })}</p>)}</div>}
    </div> : <div className="empty-state"><h2>{t('noTaskMacros')}</h2><p>{t('taskMacrosHint')}</p><button className="button primary" onClick={add}><Plus size={16} />{t('addTaskMacro')}</button></div>}</main>
  </div>;
}
