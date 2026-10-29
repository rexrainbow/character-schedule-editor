import { localizeExpressionFunctions } from '../../core/builtinLabels.js';
import SlotIcon from '../components/SlotIcon.jsx';
import { parameterValueType } from '../../core/enumParameters.js';
import EventReferenceEditor from '../editors/EventReferenceEditor.jsx';
import { eventProperties } from '../../core/eventReferences.js';
import { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react';
import ScopedVariableTree from '../components/ScopedVariableTree.jsx';
import SelectionDialog from './SelectionDialog.jsx';
import { arithmeticOperators, formatOperand, operandAt, operandErrors, operandType, replaceOperand, wrapExpression, variableNodes, expressionNodes, referenceOperand } from '../../core/operandModel.js';

export const operandLabel = (value, nodes, t, parameters = []) => formatOperand(value, localizeExpressionFunctions(nodes, t), t('chooseOperand'), parameters, t('macroParameters'));

function OperandPane({ value, nodes, numericOnly, expectedType, parameters, onChange, onEnter, t }) {
  // Keep parameter identity distinct from project variable identity in every nested operand.
  const mode = value?.type === 'expression_macro_reference' ? 'macro' : value?.type === 'parameter_reference' ? 'reference' : value?.type ?? 'reference';
  const [selected, setSelected] = useState(value?.type === 'reference' ? value.reference_id : null);
  const [selectedMacro, setSelectedMacro] = useState(value?.type === 'expression_macro_reference' ? value.expression_macro_id : null);
  const [selectedParameter, setSelectedParameter] = useState(value?.type === 'parameter_reference' ? value.parameter_id : null);
  const [type, setType] = useState(value?.type === 'constant' && ['number','string','boolean'].includes(typeof value.value) ? typeof value.value : 'number');
  const [constants, setConstants] = useState({ number: value?.type === 'constant' && typeof value.value === 'number' ? String(value.value) : '', string: value?.type === 'constant' && typeof value.value === 'string' ? value.value : '', boolean: value?.type === 'constant' && typeof value.value === 'boolean' ? String(value.value) : 'true' });
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState(false);
  const canWrap = (!expectedType || expectedType === 'number') && operandType(value, nodes, parameters) === 'number';
  function constantData(nextType, values = constants) {
    const text = values[nextType];
    return { type: 'constant', value: nextType === 'number' ? text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : null : nextType === 'boolean' ? text === 'true' : text };
  }
  function switchMode(next) {
    setRemoving(false);
    if (next === mode) return;
    if (next === 'event_property') onChange({ type: 'event_property', event: { type: 'current_event_reference' }, property: 'probability_percent' });
    else if (next === 'expression') { if (canWrap) onChange(wrapExpression(value)); }
    else if (next === 'macro') onChange(selectedMacro ? referenceOperand(selectedMacro, nodes, numericOnly ? 'number' : expectedType) : { type: 'expression_macro_reference', expression_macro_id: '' });
    else if (next === 'reference') onChange(selectedParameter ? { type: 'parameter_reference', parameter_id: selectedParameter } : referenceOperand(selected ?? '', nodes));
    else onChange(constantData(numericOnly ? 'number' : expectedType ?? type));
  }
  function editConstant(text) {
    const next = { ...constants, [numericOnly ? 'number' : expectedType ?? type]: text };
    setConstants(next); onChange(constantData(numericOnly ? 'number' : expectedType ?? type, next));
  }
  function keepOperand(next) {
    if (next?.type === 'reference') { setSelected(next.reference_id); setSelectedParameter(null); }
    if (next?.type === 'expression_macro_reference') { setSelectedMacro(next.expression_macro_id); setSelectedParameter(null); }
    if (next?.type === 'parameter_reference') { setSelectedParameter(next.parameter_id); setSelected(null); }
    if (next?.type === 'constant') {
      const nextType = ['number','string','boolean'].includes(typeof next.value) ? typeof next.value : 'number';
      setType(nextType); setConstants({ ...constants, [nextType]: next.value === null ? '' : String(next.value) });
    }
    onChange(next); setRemoving(false);
  }
  const currentType = numericOnly ? 'number' : expectedType ?? type;
  const macroItems = Object.entries(expressionNodes(nodes)).filter(([, node]) => (!(numericOnly || expectedType) || node.value_type === 'any' || node.value_type === (numericOnly ? 'number' : expectedType)) && node.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <>
    <div className="operand-mode" role="tablist" aria-label={t('operandMode')}>{['reference','constant','macro','event_property','expression'].map((key) => <button key={key} role="tab" aria-selected={mode === key} disabled={key === 'expression' && mode !== 'expression' && !canWrap || key === 'event_property' && !!expectedType && expectedType !== 'number'} title={key === 'expression' && !canWrap ? t('numericOperandRequired') : undefined} onClick={() => switchMode(key)}>{t(key === 'macro' ? 'expressions' : key === 'expression' ? 'operandArithmetic' : key === 'event_property' ? 'eventProperties' : key)}</button>)}</div>
    {numericOnly && <p className="field-hint numeric-hint">{t('numericOperandRequired')}</p>}
    {mode === 'reference' ? <>
      <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchVariables')} placeholder={t('searchVariables')} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      {parameters.length > 0 && <section className="parameter-reference-list"><h3>{t('macroParameters')}</h3><div role="tree" aria-label={t('macroParameters')}>{parameters.filter((p) => !['variable_reference', 'event_reference'].includes(p.type) && (!(numericOnly || expectedType) || parameterValueType(p) === (numericOnly ? 'number' : expectedType)) && p.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((p) => <button type="button" role="treeitem" aria-label={p.display_name} aria-selected={value.type === 'parameter_reference' && value.parameter_id === p.id} className="parameter-reference" key={p.id} onClick={() => { setSelectedParameter(p.id); setSelected(null); onChange({ type: 'parameter_reference', parameter_id: p.id }); }}><SlotIcon name={p.icon} /><strong>{p.display_name}</strong><span>{t('type_' + p.type)}</span></button>)}</div></section>}
      <h3 className="reference-source-heading">{t('operands')}</h3>
      <ScopedVariableTree defaultExpanded={false} nodes={variableNodes(nodes)} selected={value.reference_id} onSelect={(id) => { setSelected(id); setSelectedParameter(null); onChange(referenceOperand(id, nodes, numericOnly ? 'number' : expectedType)); }} search={search} selectable="value" valueType={numericOnly ? 'number' : expectedType} t={t} />
      {Object.keys(expressionNodes(nodes)).length > 0 && <section className="parameter-reference-list"><h3>{t('expressions')}</h3><div role="tree" aria-label={t('expressions')}>{Object.entries(expressionNodes(nodes)).filter(([, node]) => (!(numericOnly || expectedType) || node.value_type === 'any' || node.value_type === (numericOnly ? 'number' : expectedType)) && node.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(([id, node]) => <button type="button" role="treeitem" aria-label={node.display_name} aria-selected={value.type === 'expression_macro_reference' && value.expression_macro_id === id} className="parameter-reference" key={id} onClick={() => { setSelectedMacro(id); setSelectedParameter(null); onChange(referenceOperand(id, nodes, numericOnly ? 'number' : expectedType)); }}><strong>{node.display_name}</strong><span>{t('type_' + node.value_type)}</span></button>)}</div></section>}
      <p className="selected-path">{t('selectedPath')}: {operandLabel(value, nodes, t, parameters)}</p>
    </> : mode === 'macro' ? <>
      <label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchExpressions')} placeholder={t('searchExpressions')} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div role="tree" aria-label={t('expressions')}>{macroItems.map(([id, node]) => <button type="button" role="treeitem" key={id} aria-label={node.display_name} aria-selected={value.expression_macro_id === id} className="parameter-reference" onClick={() => { setSelectedMacro(id); setSelectedParameter(null); onChange(referenceOperand(id, nodes, numericOnly ? 'number' : expectedType)); }}><strong>{node.display_name}</strong><span>{t('type_' + node.value_type)}</span></button>)}</div>
      {!macroItems.length && <p className="selector-empty">{t('noMatchingExpressionMacros')}</p>}
      <p className="selected-path">{t('selectedPath')}: {operandLabel(value, nodes, t, parameters)}</p>
    </> : mode === 'event_property' ? <><EventReferenceEditor value={value.event} parameter={{ event_kind: 'probability' }} parameters={parameters} onChange={(event) => onChange({ ...value, event })} t={t} /><label>{t('eventProperty')}<select aria-label={t('eventProperty')} value={value.property} onChange={(event) => onChange({ ...value, property: event.target.value })}>{eventProperties.map((key) => <option key={key} value={key}>{t(`eventProperty_${key}`)}</option>)}</select></label></> : mode === 'constant' ? <div className="constant-fields">
      <label>{t('constantType')}<select aria-label={t('constantType')} value={currentType} disabled={numericOnly || !!expectedType} onChange={(e) => { setType(e.target.value); onChange(constantData(e.target.value)); }}>{(numericOnly ? ['number'] : expectedType ? [expectedType] : ['number','string','boolean']).map((key) => <option key={key} value={key}>{t('type_' + key)}</option>)}</select></label>
      <label>{t('constantValue')}{currentType === 'boolean' ? <select aria-label={t('constantValue')} value={constants.boolean} onChange={(e) => editConstant(e.target.value)}><option value="true">true</option><option value="false">false</option></select> : <input type={currentType === 'number' ? 'number' : 'text'} step="any" aria-label={t('constantValue')} aria-invalid={currentType === 'number' && value.value === null} value={constants[currentType]} onChange={(e) => editConstant(e.target.value)} />}</label>
    </div> : <section className="expression-editor" aria-label={t('expression')}>
      <div className="expression-bracket">(</div>
      <div className="expression-parts"><button type="button" className="operand-button" aria-label={t('editExpressionA')} title={operandLabel(value.operand_a, nodes, t, parameters)} onClick={() => onEnter('operand_a')}><span>{operandLabel(value.operand_a, nodes, t, parameters)}</span></button>
      <select aria-label={t('arithmeticOperator')} value={value.operator} onChange={(e) => onChange({ ...value, operator: e.target.value })}>{arithmeticOperators.map((op) => <option value={op} key={op}>{op}</option>)}</select>
      <button type="button" className="operand-button" aria-label={t('editExpressionB')} title={operandLabel(value.operand_b, nodes, t, parameters)} onClick={() => onEnter('operand_b')}><span>{operandLabel(value.operand_b, nodes, t, parameters)}</span></button></div>
      <div className="expression-bracket">)</div>
    </section>}
    {mode === 'macro' && nodes[value.expression_macro_id]?.parameters?.length > 0 && <section className="expression-call-arguments"><h3>{t('expressionCallArguments')}</h3>{nodes[value.expression_macro_id].parameters.map((p) => {
      const args = p.variadic ? value.arguments?.[p.id] ?? [] : [value.arguments?.[p.id]];
      function update(args) { onChange({ ...value, arguments: { ...value.arguments, [p.id]: args } }); }
      return <div className="expression-call-parameter" key={p.id}><span className="field-label">{p.display_name}</span>{args.map((arg, index) => <div className="expression-call-argument" key={index}><button type="button" className="operand-button" aria-label={t('argumentFor', { name: p.display_name + (p.variadic ? ' ' + (index + 1) : '') })} onClick={() => onEnter(['arguments', p.id, ...(p.variadic ? [index] : [])])}>{operandLabel(arg, nodes, t, parameters)}</button>{p.variadic && <button type="button" className="icon-button danger" aria-label={t('removeExpressionCandidate')} disabled={args.length <= 1} onClick={() => update(args.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}</div>)}{p.variadic && <button type="button" className="button secondary" onClick={() => update([...args, { type: 'constant', value: (expectedType ?? operandType(args[0], nodes, parameters)) === 'number' ? 0 : (expectedType ?? operandType(args[0], nodes, parameters)) === 'boolean' ? false : '' }])}><Plus size={16} />{t('addExpressionCandidate')}</button>}</div>;
    })}</section>}
    <div className="expression-actions"><button type="button" className="button secondary" disabled={!canWrap} title={!canWrap ? t('numericOperandRequired') : undefined} onClick={() => { onChange(wrapExpression(value)); setRemoving(false); }}><Plus size={15} />{t('addOperation')}</button>{mode === 'expression' && <button type="button" className="button secondary" onClick={() => setRemoving(!removing)}>{t('removeOperation')}</button>}</div>
    {removing && mode === 'expression' && <div className="remove-expression" role="group" aria-label={t('removeOperation')}><p>{t('keepOperandPrompt')}</p>{['operand_a','operand_b'].map((key) => <button type="button" className="button secondary" key={key} title={operandLabel(value[key], nodes, t, parameters)} onClick={() => keepOperand(value[key])}>{t(key === 'operand_a' ? 'keepOperandA' : 'keepOperandB')}: {operandLabel(value[key], nodes, t, parameters)}</button>)}<button type="button" className="button secondary" onClick={() => setRemoving(false)}>{t('cancelRemove')}</button></div>}
  </>;
}

export default function OperandSelector({ value, nodes, onApply, onClose, initialWrap = false, numericOnly = false, expectedType, parameters = [], t }) {
  nodes = useMemo(() => localizeExpressionFunctions(nodes, t), [nodes, t]);
  const [draft, setDraft] = useState(() => initialWrap ? wrapExpression(value) : structuredClone(value ?? { type: 'reference', reference_id: '' }));
  const [path, setPath] = useState([]), [history, setHistory] = useState([]);
  function enter(keys) { setHistory([...history, path]); setPath([...path, ...(Array.isArray(keys) ? keys : [keys])]); }
  function back() { setPath(history.at(-1) ?? []); setHistory(history.slice(0, -1)); }
  const errors = operandErrors(draft, nodes, '', numericOnly || expectedType === 'number', parameters);
  if (expectedType && operandType(draft, nodes, parameters) && operandType(draft, nodes, parameters) !== expectedType) errors.push({ path: '', key: 'parameterTypeMismatch' });
  let current = operandAt(draft, path);
  let childType = numericOnly ? 'number' : expectedType, cursor = draft;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (key === 'arguments') { const p = nodes[cursor.expression_macro_id]?.parameters?.find((p) => p.id === path[i + 1]); childType = p?.type === 'any' ? childType : p?.type; const id = path[++i]; cursor = cursor.arguments?.[id]; if (p?.variadic) { const index = path[++i]; cursor = cursor?.[index]; } }
    else { cursor = cursor[key]; childType = 'number'; }
  }
  current ??= { type: 'constant', value: childType === 'number' ? 0 : childType === 'boolean' ? false : '' };
  function change(next) { setDraft(replaceOperand(draft, path, next)); }
  return <SelectionDialog title={t('selectOperand')} t={t} onClose={onClose} wide footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={errors.length > 0} onClick={() => { onApply(structuredClone(draft)); onClose(); }}>{t('apply')}</button></>}>
    {path.length > 0 && <div className="expression-navigation"><button type="button" className="button secondary" onClick={back}><ArrowLeft size={15} />{t('back')}</button><nav aria-label={t('expressionNavigation')}><button type="button" onClick={() => { setPath([]); setHistory([]); }}>{t('rootOperand')}</button><span> › {t(path.includes('arguments') ? 'expressionCallArguments' : path.at(-1) === 'operand_a' ? 'expressionA' : 'expressionB')}</span></nav></div>}
    <OperandPane parameters={parameters} key={path.join('.') || 'root'} value={current} nodes={nodes} numericOnly={childType === 'number'} expectedType={childType} onChange={change} onEnter={enter} t={t} />
    {errors.length > 0 && <div className="expression-errors" role="alert">{errors.map((error, index) => <p key={index}>{t(error.key)}{error.path && <span className="expression-error-path">{error.path.replaceAll('/operand_a', ' / A').replaceAll('/operand_b', ' / B').replace('/value', '').replace('/reference_id', '').replace('/expression_macro_id', '').replace('/operator', '')}</span>}</p>)}</div>}
    <section className="expression-preview" aria-label={t('expressionPreview')}><span className="field-label">{t('expressionPreview')}</span><pre>{operandLabel(draft, nodes, t, parameters)}</pre></section>
  </SelectionDialog>;
}
