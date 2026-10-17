import { useState } from 'react';
import ConditionEditor, { OperandEditor } from './ConditionEditor.jsx';
import BranchRulesEditor from './BranchRulesEditor.jsx';
import { addBranch } from './model.js';
import { Dialog, Issues } from './ui.jsx';
import { applyComputedDefinition, defaultDefinition, formatComputedDefinition, changeComputedMode, nodePath, expressionScope, nodeScope } from './operandModel.js';

const withIds = (definition) => ({ ...structuredClone(definition), branches: definition.branches.map((branch) => ({ ...structuredClone(branch), uid: crypto.randomUUID() })) });
export default function ComputedDefinitionDialog({ id, nodes, slots, tasks = [], taskMacros = [], onApply, onClose, t }) {
  const node = nodes[id];
  const [kind, setKind] = useState(node.value_type), [mode, setMode] = useState(node.definition.kind === 'branch' ? 'branch' : 'single');
  const [drafts, setDrafts] = useState(() => ({ number: node.definition.kind === 'number' ? structuredClone(node.definition) : defaultDefinition('number'), boolean: node.definition.kind === 'boolean' ? structuredClone(node.definition) : defaultDefinition('boolean'), branch: node.definition.kind === 'branch' ? withIds(node.definition) : null }));
  const [choosing, setChoosing] = useState(false), [keepIndex, setKeepIndex] = useState('');
  const definition = mode === 'branch' ? { kind: 'branch', branches: drafts.branch.branches.map(({ condition, result }) => structuredClone({ condition, result })) } : drafts[kind];
  const candidate = { ...nodes, [id]: { ...node, value_type: kind, definition } };
  const available = expressionScope(node) === 'environment' ? Object.fromEntries(Object.entries(candidate).filter(([, item]) => nodeScope(item) === 'environment')) : candidate;
  const result = applyComputedDefinition(nodes, slots, id, definition, tasks, taskMacros, kind);
  function update(value) { setDrafts({ ...drafts, [kind]: { kind, [kind === 'number' ? 'expression' : 'condition']: value } }); }
  function changeMode(next) {
    if (next === mode) return;
    if (next === 'branch') { setDrafts({ ...drafts, branch: withIds(changeComputedMode(definition, 'branch')) }); setMode(next); }
    else if (definition.branches.length === 1) { setDrafts({ ...drafts, [kind]: changeComputedMode(definition, 'single') }); setMode(next); }
    else { setKeepIndex(''); setChoosing(true); }
  }
  function changeKind(next) {
    if (mode === 'branch' && next !== kind) {
      if (!window.confirm(t('computedTypeResetConfirm'))) return;
      setDrafts({ ...drafts, branch: { ...drafts.branch, branches: drafts.branch.branches.map((branch) => ({ ...branch, result: defaultDefinition(next) })) } });
    }
    setKind(next);
  }
  function scalarEditor(scalar, onChange, label) {
    return kind === 'number' ? <OperandEditor numericOnly label={label} value={scalar.expression} nodes={available} onChange={(expression) => onChange({ kind, expression })} t={t} /> : <ConditionEditor value={scalar.condition} nodes={available} onChange={(condition) => onChange({ kind, condition })} t={t} />;
  }
  return <Dialog title={t('editDefinition')} subtitle={nodePath(nodes, id)} t={t} wide onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={choosing || result.errors.length > 0} onClick={() => { onApply(result.nodes); onClose(); }}>{t('apply')}</button></>}>
    <div className="computed-mode-fields"><label className="definition-kind">{t('computedMode')}<select aria-label={t('computedMode')} value={mode} disabled={choosing} onChange={(e) => changeMode(e.target.value)}><option value="single">{t('computedModeSingle')}</option><option value="branch">{t('computedModeBranch')}</option></select></label><label className="definition-kind">{t('definitionKind')}<select aria-label={t('definitionKind')} value={kind} disabled={choosing} onChange={(e) => changeKind(e.target.value)}><option value="number">{t('numericDefinition')}</option><option value="boolean">{t('booleanDefinition')}</option></select></label></div>
    {choosing && <section className="shared-warning"><p>{t('chooseComputedResult')}</p><select aria-label={t('chooseComputedResult')} value={keepIndex} onChange={(e) => setKeepIndex(e.target.value)}><option value="" disabled>{t('chooseComputedResult')}</option>{definition.branches.map((branch, index) => <option key={index} value={index}>{branch.condition === null ? 'ELSE' : t('branchLabel', { count: index + 1 })}: {formatComputedDefinition(branch.result, candidate)}</option>)}</select><div className="row-actions"><button className="button secondary" onClick={() => setChoosing(false)}>{t('cancel')}</button><button className="button secondary" disabled={keepIndex === ''} onClick={() => { if (!window.confirm(t('computedKeepConfirm'))) return; setDrafts({ ...drafts, [kind]: changeComputedMode(definition, 'single', Number(keepIndex)) }); setMode('single'); setChoosing(false); }}>{t('keepComputedResult')}</button></div></section>}
    <p className="field-hint">{t('computedResult')}: {t('type_' + kind)}</p>
    <fieldset disabled={choosing} className="computed-definition-fields">{mode === 'branch' ? <BranchRulesEditor branches={drafts.branch.branches} nodes={available} t={t} onChange={(branches) => setDrafts({ ...drafts, branch: { kind: 'branch', branches } })} onAddBranch={() => setDrafts({ ...drafts, branch: { kind: 'branch', branches: addBranch(drafts.branch.branches).map(({ task, ...branch }) => ({ ...branch, result: branch.result ?? defaultDefinition(kind) })) } })} renderResult={(branch, index, patch) => <div className="computed-result-editor"><span className="field-label">{t('computedReturn')}</span>{scalarEditor(branch.result, (result) => patch({ result }), t('computedReturnFor', { count: index + 1 }))}</div>} /> : <article className="branch-card computed-definition"><div className="branch-header"><strong>{t('definition')}</strong></div><div className="branch-body">{kind === 'number' ? <OperandEditor numericOnly label={t('numericDefinition')} value={definition.expression} nodes={available} onChange={update} t={t} /> : <ConditionEditor value={definition.condition} nodes={available} onChange={update} t={t} />}</div></article>}</fieldset>
    {result.errors.length > 0 && <div className="computed-errors" role="alert"><Issues errors={result.errors} t={t} /></div>}
    <section className="expression-preview"><span className="field-label">{t('expressionPreview')}</span><pre>{formatComputedDefinition(definition, candidate, t('chooseOperand'))}</pre></section>
  </Dialog>;
}
