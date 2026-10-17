import { VariableReferencePicker } from './VariableReferenceEditor.jsx';
import { useBuiltinVariableDefinitions } from './builtinTasks.js';
import { useState } from 'react';
import { OperandEditor } from './ConditionEditor.jsx';
import { isComputed, nodePath, operandType, setVariableErrors } from './operandModel.js';

export default function SetVariableEditor({ value, nodes, parameters, onChange, t }) {
  const definition = useBuiltinVariableDefinitions(t).find((item) => item.id === `builtin:${value.builtin}`);
  const targetContract = definition.parameters[0], needsValue = definition.parameters.length === 2;
  const targetName = targetContract.display_name, valueName = definition.parameters[1]?.display_name;
  const [picking, setPicking] = useState(false), target = nodes[value.target_variable_id];
  const validTarget = target?.node_type === 'value' && !isComputed(target) && !target.read_only && (targetContract.value_type === 'any' || target.value_type === targetContract.value_type);
  const errors = setVariableErrors(value, nodes, '', parameters);
  function applyTarget(id) {
    const type = operandType(value.value, nodes, parameters), incompatible = needsValue && type && type !== nodes[id].value_type;
    if (incompatible && !window.confirm(t('clearAssignmentValueConfirm'))) return false;
    onChange({ ...value, target_variable_id: id, ...(needsValue ? { value: incompatible ? null : value.value } : {}) }); setPicking(false);
  }
  return <div className="task-arguments"><div className="task-argument"><span className="field-label">{targetName}</span><button className="operand-button" aria-label={targetName} aria-invalid={!validTarget} onClick={() => setPicking(true)}>{nodePath(nodes, value.target_variable_id) || t('chooseWriteTarget')}</button></div>
    {needsValue && <div className="task-argument"><span className="field-label">{valueName}{validTarget && <small>{t('type_' + target.value_type)}</small>}</span>{validTarget ? <OperandEditor label={valueName} value={value.value} nodes={nodes} parameters={parameters} expectedType={target.value_type} onChange={(next) => onChange({ ...value, value: next })} t={t} /> : <p className="field-hint">{t('selectWriteTargetFirst')}</p>}</div>}
    {value.builtin === 'increment_variable' && <p className="field-hint">{t('incrementVariableHint')}</p>}
    {value.builtin === 'reset_variable' && <p className="field-hint">{t('resetVariableHint')}</p>}
    {errors.filter((error) => validTarget || error.path.includes('target_variable_id')).map((error, index) => <p className="inline-error" role="alert" key={index}>{t(error.key)}</p>)}
    {picking && <VariableReferencePicker value={value.target_variable_id ? { type: 'variable_reference', reference_id: value.target_variable_id } : null} parameter={targetContract} nodes={nodes} t={t} onClose={() => setPicking(false)} onApply={(reference) => applyTarget(reference.reference_id)} />}
  </div>;
}
