import { editProject } from '../../core/projectApi.js';
import { createProject } from '../../core/model.js';
import EngineKeyField from '../components/EngineKeyField.jsx';

import IconField from '../components/IconField.jsx';
import useEditorView from '../hooks/useEditorView.js';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import ComputedDefinitionDialog from '../dialogs/ComputedDefinitionDialog.jsx';
import OperandTree from '../components/OperandTree.jsx';
import SelectionDialog from '../dialogs/SelectionDialog.jsx';
import { IconButton } from '../components/ui.jsx';
import { formatComputedDefinition, initialValue, variableScope, scopedVariables, expressionNameErrors, childrenOf, isComputed, nodePath, subtreeReferences, subtreeIds, treeErrors } from '../../core/operandModel.js';

const referenceLabel = (ref, t) => ref.macroId ? `${ref.macroName} / ${t(ref.step ? 'taskStep' : 'branchLabel', { count: ref.step ?? ref.branch })}` : ref.ownerId ? t('computedReference', { name: ref.computedName }) : `${ref.slot} · ${t('branchLabel', { count: ref.branch })}`;

function ParentPicker({ nodes, id, t, onClose, onApply, error }) {
  const [selected, setSelected] = useState(nodes[id].parent_id), [search, setSearch] = useState('');
  return <SelectionDialog title={t('chooseParent')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={() => onApply(selected)}>{t('apply')}</button></>}><label className="search-field"><Search size={16} /><input autoFocus aria-label={t('searchVariables')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><button className={`button secondary ${selected === null ? 'selected' : ''}`} aria-pressed={selected === null} onClick={() => setSelected(null)}>{t('rootNode')}</button><OperandTree nodes={nodes} selected={selected} onSelect={setSelected} search={search} selectable="group" disabledIds={subtreeIds(nodes, id)} t={t} /><p className="selected-path">{nodePath(nodes, selected) || t('rootNode')}</p>{error && <p className="inline-error" role="alert">{t(error)}</p>}</SelectionDialog>;
}
export function NodeProperties({ id, nodes, slots, tasks = [], taskMacros = [], onChange, t, locked = false }) {
  const node = nodes[id];
  const api = () => editProject({ ...createProject(), operandNodes: nodes, slots, tasks, taskMacros }, t)[isComputed(node) ? 'expressions' : 'variables'];
  function patch(values) { const result = api().update(id, values); if (result.ok) onChange(result.nodes); else { setBlocked(result.blocked); setError(result.errors[0]?.key); } }
  const [parentPicker, setParentPicker] = useState(false), [error, setError] = useState(null), [blocked, setBlocked] = useState([]);
  const [editingDefinition, setEditingDefinition] = useState(false);
  const errors = [...treeErrors(nodes), ...expressionNameErrors(nodes)].filter((e) => e.path.startsWith(`/operand_nodes/${id}/`) || e.path.startsWith(`/expression_macros/${id}/`));
  const refs = subtreeReferences(nodes, slots, id, taskMacros, tasks), subtreeSize = subtreeIds(nodes, id).size;
  function commitMove(parent, position) {
    try { const result = api().move(id, parent, position); if (!result.ok) throw new Error(result.errors[0].key); onChange(result.nodes); setError(null); setParentPicker(false); }
    catch (e) { setError(e.message); }
  }
  function readOnly(value) { const result = api().update(id, { read_only: value }); setBlocked(result.blocked); setError(result.blocked.length ? 'readOnlyBlocked' : null); if (!result.blocked.length) onChange(result.nodes); }
  function changeBound(key, input) {
    if (input.value === '' && !input.validity.badInput) onChange(api().unset(id, [key]).nodes);
    else patch({ [key]: input.valueAsNumber });
  }
  function changeType(type) {
    const result = api().update(id, { value_type: type });
    setBlocked(result.blocked); setError(null);
    // A blocked reference must not prompt for, or commit, an initial value reset.
    if (!result.blocked.length && (type === node.value_type || window.confirm(t('resetInitialValueConfirm')))) onChange(result.nodes);
  }
  return <div className="node-properties">{locked && <p className="scope-notice">{t('environmentDefinitionLocked')}</p>}<fieldset disabled={locked} className="definition-fields"><div className="schedule-titlebar"><div className="schedule-name"><div className="name-with-icon"><IconField value={node.icon || (isComputed(node) ? 'tabler:calculator' : node.node_type === 'group' ? 'tabler:books' : 'tabler:code')} onChange={(icon) => patch({ icon })} t={t} /><input aria-label={t('nodeName')} value={node.display_name} aria-invalid={errors.some((e) => e.path.endsWith('/display_name'))} onChange={(e) => { patch({ display_name: e.target.value }); setError(null); }} /><EngineKeyField kind={isComputed(node) ? 'expressions' : 'operands'} item={{ ...node, id }} onChange={(engine_key) => patch({ engine_key })} t={t} /></div></div></div><p className="node-path" title={nodePath(nodes, id)}>{nodePath(nodes, id)}</p>
    <div className="node-fields"><div><span className="field-label">{t('variableNodeType')}</span><strong>{t(isComputed(node) ? 'expressionMacro' : `node_${node.node_type}`)}</strong></div>{!isComputed(node) && <div><span className="field-label">{t('parentNode')}</span><button className="button secondary parent-picker" onClick={() => setParentPicker(true)} title={nodePath(nodes, node.parent_id)}>{nodePath(nodes, node.parent_id) || t('rootNode')}</button></div>}
    {node.node_type === 'value' && !isComputed(node) && <label className="readonly-field"><input type="checkbox" aria-label={t('readOnly')} checked={node.read_only ?? false} onChange={(e) => readOnly(e.target.checked)} /><span>{t('readOnly')}</span><small>{t('readOnlyHint')}</small></label>}
    {node.node_type === 'value' && (isComputed(node) ? <><div><span className="field-label">{t('computedResult')}</span><strong>{t('type_' + node.value_type)}</strong></div><section className="expression-preview"><span className="field-label">{t('definition')}</span><pre>{formatComputedDefinition(node.definition, nodes)}</pre><button className="button secondary" onClick={() => setEditingDefinition(true)}>{t('editDefinition')}</button></section></> : <label>{t('valueType')}<select aria-label={t('valueType')} value={node.value_type} onChange={(e) => changeType(e.target.value)}>{['number','string','boolean'].map((type) => <option key={type} value={type}>{t(`type_${type}`)}</option>)}</select></label>)}
    {node.node_type === 'value' && !isComputed(node) && node.value_type === 'number' && <label className="readonly-field"><input type="checkbox" aria-label={t('integerOnly')} checked={node.integer_only ?? false} onChange={(event) => patch({ integer_only: event.target.checked })} /><span>{t('integerOnly')}</span><small>{t('integerOnlyHint')}</small></label>}
    {node.node_type === 'value' && !isComputed(node) && <label>{t('initialValue')}{node.value_type === 'boolean' ? <select aria-label={t('initialValue')} value={String(initialValue(node))} onChange={(e) => patch({ initial_value: e.target.value === 'true' })}><option value="false">false</option><option value="true">true</option></select> : <input aria-label={t('initialValue')} type={node.value_type === 'number' ? 'number' : 'text'} step={node.value_type === 'number' ? node.integer_only ? '1' : 'any' : undefined} value={Number.isNaN(initialValue(node)) ? '' : initialValue(node)} onChange={(e) => patch({ initial_value: node.value_type === 'number' ? e.target.value === '' ? NaN : e.target.valueAsNumber : e.target.value })} />}<small>{t('initialValueHint')}</small></label>}
    {node.node_type === 'value' && !isComputed(node) && node.value_type === 'number' && <div className="variable-bounds">{['min_value', 'max_value'].map((key) => <label key={key}>{t(key === 'min_value' ? 'minValue' : 'maxValue')}<input type="number" step={node.integer_only ? 1 : 'any'} aria-label={t(key === 'min_value' ? 'minValue' : 'maxValue')} aria-invalid={errors.some((e) => e.path.endsWith(`/${key}`))} placeholder={t('unboundedValue')} value={Number.isNaN(node[key]) ? '' : node[key] ?? ''} onChange={(e) => changeBound(key, e.target)} /></label>)}<small>{t('variableBoundsHint')}</small></div>}
    </div>
    {errors.map((e, i) => <p key={i} className="inline-error" role="alert">{t(e.key)}</p>)}{error && <p className="inline-error" role="alert">{t(error)}</p>}
    {!!blocked.length && <div className="shared-warning" role="alert"><p>{t(error === 'readOnlyBlocked' ? 'readOnlyBlocked' : 'typeChangeBlocked')}</p><ul>{blocked.map((ref) => <li key={ref.path}>{referenceLabel(ref, t)}<code>{ref.path}</code></li>)}</ul></div>}
    {refs.length > 0 && <div className="shared-warning"><p>{t('nodeInUse')}</p>{refs.map((ref) => <p key={ref.path}>{nodePath(nodes, ref.nodeId)} · {referenceLabel(ref, t)}</p>)}</div>}
    <button className="button secondary danger" disabled={refs.length > 0} onClick={() => { if (window.confirm(t(subtreeSize > 1 ? 'deleteSubtreeConfirm' : 'deleteNodeConfirm', { name: node.display_name, count: subtreeSize }))) onChange(api().remove(id).nodes); }}><Trash2 size={16} />{t('deleteNode')}</button>
    </fieldset>
    {parentPicker && <ParentPicker error={error} nodes={scopedVariables(nodes, variableScope(node))} id={id} t={t} onClose={() => { setParentPicker(false); setError(null); }} onApply={(parent) => commitMove(parent, parent === node.parent_id ? node.order : childrenOf(nodes, parent, variableScope(node)).length)} />}
    {editingDefinition && <ComputedDefinitionDialog taskMacros={taskMacros} tasks={tasks} id={id} nodes={nodes} slots={slots} t={t} onApply={onChange} onClose={() => setEditingDefinition(false)} />}
  </div>;
}
export default function OperandsEditor({ draft, onChange, t, scope = 'environment', view, onViewChange }) {
  const nodes = draft.operandNodes;
  const [templateError, setTemplateError] = useState(null);
  function addProgress() {
    try { const result = editProject(draft, t).variables.addProgress(); if (!result.ok) throw new Error(result.errors[0].key); if (JSON.stringify(result.nodes) !== JSON.stringify(nodes)) onChange(result.nodes); setTemplateError(null); }
    catch (error) { setTemplateError(error.message); }
  }
  const initialId = Object.entries(scopedVariables(nodes, scope)).find(([, node]) => node.engine_key === 'schedule.current_week')?.[0] ?? Object.keys(scopedVariables(nodes, scope))[0] ?? null;
  const [selected, setSelected, search, setSearch] = useEditorView(view, onViewChange, initialId);
  const locked = !!nodes[selected] && variableScope(nodes[selected]) !== scope;
  const node = nodes[selected];
  const siblings = node ? childrenOf(nodes, node.parent_id, variableScope(node)) : [];
  const position = siblings.findIndex(([id]) => id === selected);
  function swap(offset) {
    if (locked || !node || search || position + offset < 0 || position + offset >= siblings.length) return;
    onChange(editProject(draft, t).variables.move(selected, node.parent_id, position + offset).nodes);
  }
  function add(type) { const result = editProject(draft, t).variables.create({ selectedId: selected, node_type: type, display_name: t(type === 'group' ? 'newVariableGroup' : 'newVariable'), scope }); onChange(result.nodes); setSelected(result.id); setSearch(''); }
  function copy() { const result = editProject(draft, t).variables.duplicate(selected); onChange(result.nodes); setSelected(result.id); setSearch(''); }
  return <div className="operand-workspace"><aside className="operand-sidebar"><h2>{t(scope === 'environment' ? 'environmentVariables' : 'applicationVariables')}</h2><label className="search-field"><Search size={16} /><input aria-label={t('searchVariables')} placeholder={t('searchVariables')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="tree-actions"><button className="button secondary" onClick={() => add('group')}><FolderPlus size={15} />{t('addVariableGroup')}</button><button className="button secondary" onClick={() => add('value')}><Plus size={15} />{t('addVariable')}</button><IconButton icon={Copy} label={t('duplicateSubtree')} disabled={!nodes[selected] || locked} onClick={copy} /><div className="tree-reorder"><IconButton icon={ArrowUp} label={t('up')} disabled={locked || !!search || position <= 0} onClick={() => swap(-1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={locked || !!search || position < 0 || position >= siblings.length - 1} onClick={() => swap(1)} /></div></div>{scope === 'environment' && <button className="button secondary" onClick={addProgress}>{t('addProgressTemplate')}</button>}{templateError && <p className="inline-error" role="alert">{t(templateError)}</p>}<div className="scope-tree-list">{(scope === 'application' ? ['application', 'environment'] : ['environment']).map((layer) => <section className="variable-scope" key={layer}><h3>{t(layer === 'environment' ? 'environmentVariables' : 'applicationVariables')}{layer !== scope && <span className="scope-badge">{t('definitionReadOnly')}</span>}</h3><OperandTree revealSelected nodes={scopedVariables(nodes, layer)} selected={selected} onSelect={setSelected} search={search} t={t} /></section>)}</div></aside><main className="operand-properties-area">{nodes[selected] ? <NodeProperties locked={locked} key={selected} id={selected} nodes={nodes} slots={draft.slots} tasks={draft.tasks} taskMacros={draft.taskMacros} t={t} onChange={(next) => { onChange(next); if (!next[selected]) setSelected(null); }} /> : <div className="empty-state"><h2>{t('selectVariable')}</h2><p>{t('variablesHint')}</p></div>}</main></div>;
}
