import { Plus, Trash2 } from 'lucide-react';
import ConditionEditor from './ConditionEditor.jsx';
import { formatCondition } from './operandModel.js';

export default function MacroEligibilityEditor({ macro, nodes, onChange, t }) {
  const value = macro.eligibility;
  return <details className="macro-eligibility">
    <summary><strong>{t('candidateCondition')}</strong><span>{value == null ? t('eligibilityUnrestricted') : formatCondition(value, nodes, '?', macro.parameters, t('macroParameters'))}</span></summary>
    <div className="macro-eligibility-body"><p className="field-hint">{t('macroEligibilityHint')}</p>
      {value == null ? <button className="button secondary" onClick={() => onChange({ kind: 'comparison', operand_a: { type: 'constant', value: 0 }, comparator: '==', operand_b: { type: 'constant', value: 0 } })}><Plus size={16} />{t('setEligibility')}</button> : <><ConditionEditor value={value} nodes={nodes} parameters={macro.parameters} t={t} onChange={onChange} /><button className="button secondary" onClick={() => onChange(null)}><Trash2 size={16} />{t('clearEligibility')}</button></>}
    </div>
  </details>;
}
