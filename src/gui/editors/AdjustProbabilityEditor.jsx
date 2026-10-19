import { useBuiltinTaskDefinitions } from '../hooks/builtinTasks.js';
import EventReferenceEditor from './EventReferenceEditor.jsx';
import { OperandEditor } from './ConditionEditor.jsx';
import { taskUseErrors } from '../../core/operandModel.js';
import EnumArgumentEditor from './EnumArgumentEditor.jsx';

export default function AdjustProbabilityEditor({ value, nodes, parameters = [], onChange, t }) {
  const definition = useBuiltinTaskDefinitions(t).find((item) => item.id === 'builtin:adjust_probability_event');
  const names = Object.fromEntries(definition.parameters.map((p) => [p.id, p.display_name]));
  return <div className="task-arguments"><p className="field-hint">{t('adjustProbabilityHint')}</p><EventReferenceEditor label={names.event} value={value.event} parameter={{ event_kind: 'probability' }} parameters={parameters} onChange={(event) => onChange({ ...value, event })} t={t} />
    {['property', 'operation'].map((key) => <EnumArgumentEditor key={key} literal value={value[key]} parameter={definition.parameters.find((item) => item.id === key)} parameters={parameters} onChange={(next) => onChange({ ...value, [key]: next })} t={t} />)}
    <OperandEditor label={names.value} value={value.value} nodes={nodes} parameters={parameters} expectedType="number" onChange={(next) => onChange({ ...value, value: next })} t={t} />
    {taskUseErrors(value, [], nodes, '', parameters).map((error, index) => <p className="inline-error" role="alert" key={index}>{t(error.key)}</p>)}
  </div>;
}
