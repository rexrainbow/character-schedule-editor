import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import OperandSelector, { operandLabel } from './OperandSelector.jsx';
import { conditionErrors, operandType } from './operandModel.js';
import { Plus, Trash2 } from 'lucide-react';
import { comparison, group } from './model.js';

export function OperandEditor({ label, value, nodes, onChange, numericOnly = false, expectedType, parameters = [], t }) {
  // Scope is supplied only by macro steps and branches, never by global conditions.
  const [open, setOpen] = useState(null); const ref = useRef(null);
  function close() { setOpen(null); requestAnimationFrame(() => ref.current?.focus()); }
  const text = operandLabel(value, nodes, t, parameters);
  const canWrap = (!expectedType || expectedType === 'number') && operandType(value, nodes, parameters) === 'number';
  return <div className="comparison-operand"><button ref={ref} type="button" className="operand-button" aria-label={label} aria-invalid={!value} title={text} onClick={() => setOpen('edit')}><span>{text}</span><ChevronDown size={15} /></button><button type="button" className="text-button operand-add" aria-label={t('addOperationFor', { operand: label })} title={!canWrap ? t('numericOperandRequired') : t('addOperation')} disabled={!canWrap} onClick={() => setOpen('wrap')}><Plus size={14} />{t('addOperation')}</button>{open && <OperandSelector parameters={parameters} expectedType={expectedType} numericOnly={numericOnly} initialWrap={open === 'wrap'} value={value} nodes={nodes} onApply={onChange} onClose={close} t={t} />}</div>;
}

export default function ConditionEditor({ value, onChange, onRemove, nodes = {}, parameters = [], t }) {
  const isGroup = value.kind === 'group';
  const errors = conditionErrors(value, nodes, '', parameters);
  const types = [operandType(value.operand_a, nodes, parameters), operandType(value.operand_b, nodes, parameters)];
  const operators = types.some((type) => type && type !== 'number') ? ['==', '!='] : ['==', '!=', '<', '<=', '>', '>='];
  const patch = (values) => onChange({ ...value, ...values });
  return <div className={`condition-node ${isGroup ? 'condition-group' : 'condition-comparison'}`}>
    <div className="condition-toolbar">
      <select aria-label={t('nodeType')} value={value.kind} onChange={(e) => {
        if (e.target.value === 'group') onChange({ kind: 'group', mode: 'ALL', items: [value] });
        else onChange(comparison());
      }}>
        <option value="comparison">{t('comparison')}</option><option value="group">{t('group')}</option>
      </select>
      {isGroup && <select className="mode-select" aria-label={t('mode')} value={value.mode} onChange={(e) => patch({ mode: e.target.value })}>
        <option value="ALL">{t('all')}</option><option value="ANY">{t('any')}</option>
      </select>}
      {onRemove && <button type="button" className="icon-button danger node-remove" aria-label={t('removeCondition')} title={t('removeCondition')} onClick={onRemove}><Trash2 size={15} /></button>}
    </div>
    {isGroup ? <>
      <div className="condition-children">
        {value.items.length === 0 && <p className="inline-error">{t('emptyGroup')}</p>}
        {value.items.map((item, index) => <ConditionEditor parameters={parameters} key={index} value={item} t={t} nodes={nodes}
          onChange={(next) => patch({ items: value.items.map((entry, i) => i === index ? next : entry) })}
          onRemove={() => patch({ items: value.items.filter((_, i) => i !== index) })} />)}
      </div>
      <div className="condition-add-actions">
        <button type="button" className="text-button" onClick={() => patch({ items: [...value.items, comparison()] })}><Plus size={14} />{t('addComparison')}</button>
        <button type="button" className="text-button" onClick={() => patch({ items: [...value.items, group()] })}><Plus size={14} />{t('addGroup')}</button>
      </div>
    </> : <div className="comparison-fields">
      <OperandEditor parameters={parameters} label={t('operandA')} value={value.operand_a} nodes={nodes} t={t} onChange={(operand_a) => patch({ operand_a })} />
      <select aria-label={t('operator')} aria-invalid={!operators.includes(value.comparator)} value={value.comparator} onChange={(e) => patch({ comparator: e.target.value })}>
        {!operators.includes(value.comparator) && <option value={value.comparator} disabled>{value.comparator} !</option>}
        {operators.map((op) => <option key={op} value={op}>{op}</option>)}
      </select>
      <OperandEditor parameters={parameters} label={t('operandB')} value={value.operand_b} nodes={nodes} t={t} onChange={(operand_b) => patch({ operand_b })} />
    </div>}
    {!isGroup && [...new Set(errors.map((error) => error.key))].map((key) => <p className="inline-error" role="alert" key={key}>{t(key)}</p>)}
  </div>;
}
