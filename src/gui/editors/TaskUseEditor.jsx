import ScheduleEventEditor from './ScheduleEventEditor.jsx';
import { createScheduleEvent } from '../../core/scheduledEvents.js';
import EnumArgumentEditor from './EnumArgumentEditor.jsx';
import { resolveEnumParameters } from '../../core/enumParameters.js';
import EventReferenceEditor from './EventReferenceEditor.jsx';
import AdjustProbabilityEditor from './AdjustProbabilityEditor.jsx';
import VariableReferenceEditor from './VariableReferenceEditor.jsx';
import { useBuiltinTaskDefinitions, builtinTaskCategories, isBuiltinFlowTask } from '../hooks/builtinTasks.js';
import SetVariableEditor from './SetVariableEditor.jsx';
import { hasTaskValues } from '../../core/operandModel.js';
import { OperandEditor } from './ConditionEditor.jsx';
import { taskUseErrors } from '../../core/taskModel.js';
import { useContext } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatCondition, macroReaches, macroEligibility } from '../../core/operandModel.js';
import { TaskMacrosContext, EnumDefinitionsContext } from '../contexts/TaskContext.js';

export default function TaskUseEditor({ branch, tasks, nodes, parameters = [], allowMacros = true, allowedMacroModes = ['sequence', 'branch', 'priority'], macrosOnly = false, showConditionSummary = false, ownerMacroId, onOpenMacro, onChange, t }) {
  const definitions = useContext(EnumDefinitionsContext);
  parameters = resolveEnumParameters(parameters, definitions);
  tasks = tasks.map((task) => ({ ...task, parameters: resolveEnumParameters(task.parameters, definitions) }));
  // Share localized and customized fixed definitions across slots and macros.
  const allBuiltinDefinitions = useBuiltinTaskDefinitions(t), builtinDefinitions = macrosOnly ? [] : allBuiltinDefinitions.filter((item) => !isBuiltinFlowTask({ builtin: item.id.slice(8) }));
  tasks = macrosOnly ? [] : tasks;
  const availableSequences = useContext(TaskMacrosContext);
  const sequences = allowMacros ? availableSequences.filter((macro) => allowedMacroModes.includes(macro.mode) && (!ownerMacroId || !macroReaches(availableSequences, macro.id, ownerMacroId))).map((macro) => ({ ...macro, parameters: resolveEnumParameters(macro.parameters, definitions) })) : [];
  const use = branch.task ?? { task_id: '', arguments: {} };
  const selected = builtinDefinitions.some((item) => item.id === `builtin:${use.builtin}`) ? `builtin:${use.builtin}` : use.task_macro_id !== undefined ? `macro:${use.task_macro_id}` : use.task_id;
  const builtin = builtinDefinitions.some((item) => item.id === selected);
  const task = use.task_macro_id !== undefined ? sequences.find((item) => item.id === use.task_macro_id) : tasks.find((item) => item.id === use.task_id);
  const errors = taskUseErrors(use, tasks, nodes, '', parameters, sequences);
  function select(value) {
    if (value === selected) return;
    if (hasTaskValues(use) && !window.confirm(t('switchTaskConfirm'))) return;
    if (builtinDefinitions.some((item) => item.id === value)) { const kind = value.slice(8); onChange({ task: kind === 'schedule_event' ? createScheduleEvent() : kind === 'adjust_probability_event' ? { builtin: kind, event: { type: 'current_event_reference' }, property: 'probability_percent', operation: 'set', value: { type: 'constant', value: 10 } } : { builtin: kind, target_variable_id: '', ...(['set_variable', 'increment_variable'].includes(kind) ? { value: null, ...(kind === 'increment_variable' ? { random_amplitude: { type: 'constant', value: 0 } } : {}) } : {}) } }); return; }
    onChange({ task: { ...(value.startsWith('macro:') ? { task_macro_id: value.slice(6) } : { task_id: value }), arguments: {} } });
  }
  return <div className="task-editor">
    <label className="task-select"><span className="field-label">{t(allowMacros ? 'taskOrMacro' : 'task')}</span><select aria-label={t('task')} aria-invalid={!builtin && !task} value={selected} onChange={(event) => select(event.target.value)}><option value="">{t('chooseTask')}</option><>{builtinTaskCategories.filter((category) => builtinDefinitions.some((item) => item.category === category)).map((category) => <optgroup key={category} label={t(category)}>{builtinDefinitions.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</optgroup>)}</>{!!tasks.length && <optgroup label={t('engineTasks')}>{tasks.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</optgroup>}{sequences.length > 0 && <optgroup label={t('taskMacros')}>{sequences.map((item) => <option key={item.id} value={`macro:${item.id}`}>{item.display_name}</option>)}</optgroup>}</select></label>
    {builtin && (use.builtin === 'schedule_event' ? <ScheduleEventEditor value={use} definition={builtinDefinitions.find((item) => item.id === selected)} nodes={nodes} parameters={parameters} t={t} onChange={(task) => onChange({ task })} /> : use.builtin === 'adjust_probability_event' ? <AdjustProbabilityEditor value={use} nodes={nodes} parameters={parameters} t={t} onChange={(task) => onChange({ task })} /> : <SetVariableEditor value={use} nodes={nodes} parameters={parameters} t={t} onChange={(task) => onChange({ task })} />)}
    {showConditionSummary && task?.mode && <div className="candidate-condition-summary"><strong>{t('candidateCondition')}</strong><p>{macroEligibility(task) == null ? t('eligibilityUnrestricted') : formatCondition(macroEligibility(task), nodes, '?', task.parameters, t('macroParameters'))}</p>{onOpenMacro && <button className="button secondary" onClick={() => onOpenMacro(task.id)}><ExternalLink size={15} />{t('openConditionalTask')}</button>}</div>}
    {task && <div className="task-arguments">{task.parameters.map((p) => <div className="task-argument" key={p.id}><span className="field-label">{p.display_name} <small>{t('type_' + p.type)}</small></span>{p.type === 'enum' ? <EnumArgumentEditor value={use.arguments[p.id]} parameter={p} parameters={parameters} label={t('argumentFor', { name: p.display_name })} t={t} onChange={(value) => onChange({ task: { ...use, arguments: { ...use.arguments, [p.id]: value } } })} /> : p.type === 'event_reference' ? <EventReferenceEditor value={use.arguments[p.id]} parameter={p} parameters={parameters} label={t('argumentFor', { name: p.display_name })} t={t} onChange={(value) => onChange({ task: { ...use, arguments: { ...use.arguments, [p.id]: value } } })} /> : p.type === 'variable_reference' ? <VariableReferenceEditor value={use.arguments[p.id]} parameter={p} nodes={nodes} parameters={parameters} label={t('argumentFor', { name: p.display_name })} t={t} onChange={(value) => onChange({ task: { ...use, arguments: { ...use.arguments, [p.id]: value } } })} /> : <OperandEditor parameters={parameters} label={t('argumentFor', { name: p.display_name })} expectedType={p.type} value={use.arguments[p.id]} nodes={nodes} t={t} onChange={(value) => onChange({ task: { ...use, arguments: { ...use.arguments, [p.id]: value } } })} />}{!use.arguments[p.id] && <p className="inline-error">{t('missingArgument')}</p>}</div>)}</div>}
    {!builtin && errors.filter((e) => e.key !== 'chooseOperand').map((e, i) => <p className="inline-error" role="alert" key={i}>{t(e.key, { field: e.field })}</p>)}
  </div>;
}
