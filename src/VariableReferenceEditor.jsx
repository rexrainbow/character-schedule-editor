import { useState } from 'react';
import { Search } from 'lucide-react';
import SelectionDialog from './SelectionDialog.jsx';
import ScopedVariableTree from './ScopedVariableTree.jsx';
import { variableNodes, formatOperand } from './operandModel.js';
import { referenceContractAccepts, variableReferenceErrors } from './parameterModel.js';

export function VariableReferencePicker({ value, parameter, nodes, parameters = [], onApply, onClose, t }) {
  const [selected, setSelected] = useState(value ?? null), [search, setSearch] = useState('');
  const eligible = Object.fromEntries(Object.entries(variableNodes(nodes)).filter(([id, node]) => node.node_type === 'group' || !variableReferenceErrors({ type: 'variable_reference', reference_id: id }, parameter, nodes).length));
  const locals = parameters.filter((p) => referenceContractAccepts(parameter, p) && p.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const valid = !variableReferenceErrors(selected, parameter, nodes, '', parameters).length;
  return <SelectionDialog title={t('chooseVariableReference')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!valid} onClick={() => { if (onApply(selected) !== false) onClose(); }}>{t('apply')}</button></>}>
    <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchVariables')} placeholder={t('searchVariables')} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <p className="field-hint">{t('referenceValueType')}: {t(parameter.value_type === 'any' ? 'anyVariableType' : 'type_' + parameter.value_type)} · {t('access_' + parameter.access)}</p>
    {!!locals.length && <section className="parameter-reference-list"><h3>{t('macroParameters')}</h3><div role="tree" aria-label={t('macroParameters')}>{locals.map((p) => <button type="button" className="parameter-reference" role="treeitem" aria-selected={selected?.type === 'parameter_reference' && selected.parameter_id === p.id} key={p.id} onClick={() => setSelected({ type: 'parameter_reference', parameter_id: p.id })}>{p.display_name}</button>)}</div></section>}
    <ScopedVariableTree nodes={eligible} defaultExpanded={false} selected={selected?.reference_id} onSelect={(id) => setSelected({ type: 'variable_reference', reference_id: id })} search={search} selectable="value" t={t} />
    <p className="selected-path">{formatOperand(selected, nodes, t('chooseVariableReference'), parameters, t('macroParameters'))}</p>
  </SelectionDialog>;
}
export default function VariableReferenceEditor({ value, parameter, nodes, parameters, label, onChange, t }) {
  const [open, setOpen] = useState(false);
  return <><button className="operand-button" aria-label={label} aria-invalid={!!variableReferenceErrors(value, parameter, nodes, '', parameters).length} onClick={() => setOpen(true)}>{formatOperand(value, nodes, t('chooseVariableReference'), parameters, t('macroParameters'))}</button>{open && <VariableReferencePicker value={value} parameter={parameter} nodes={nodes} parameters={parameters} onApply={onChange} onClose={() => setOpen(false)} t={t} />}</>;
}
