import { useMemo } from 'react';
import { localizeExpressionFunctions } from '../../core/builtinLabels.js';
import { editProject } from '../../core/projectApi.js';
import { EngineKeyWarning } from '../components/EngineKeyField.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import useEditorView from '../hooks/useEditorView.js';
import { Copy, Plus, Search } from 'lucide-react';
import { NodeProperties } from './OperandsEditor.jsx';
import { expressionNodes, expressionScope } from '../../core/operandModel.js';
import { IconButton } from '../components/ui.jsx';

export default function ExpressionMacrosEditor({ draft, onChange, t, view, onViewChange, scope = 'application' }) {
  const nodes = useMemo(() => localizeExpressionFunctions(draft.operandNodes, t), [draft.operandNodes, t]);
  const macros = Object.fromEntries(Object.entries(expressionNodes(nodes)).filter(([, node]) => scope === 'application' || expressionScope(node) === scope));
  const [selected, setSelected, search, setSearch] = useEditorView(view, onViewChange, Object.keys(macros)[0] ?? null);
  const locked = !!macros[selected] && expressionScope(macros[selected]) !== scope;
  function add() { const result = editProject(draft, t).expressions.create({ display_name: t('newComputedVariable'), scope }); onChange(result.nodes); setSelected(result.id); setSearch(''); }
  function copy() { if (locked) return; const result = editProject(draft, t).expressions.duplicate(selected); onChange(result.nodes); setSelected(result.id); setSearch(''); }
  return <div className="operand-workspace tasks-workspace"><aside className="operand-sidebar"><h2>{t(scope === 'environment' ? 'environmentExpressions' : 'expressions')}</h2><label className="search-field"><Search size={16} /><input aria-label={t('searchExpressions')} placeholder={t('searchExpressions')} value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="tree-actions"><button className="button secondary" onClick={add}><Plus size={15} />{t('addComputedVariable')}</button><IconButton icon={Copy} label={t('duplicateExpressionMacro')} disabled={!macros[selected] || locked} onClick={copy} /></div>
    <div className="scope-tree-list expression-scope-list">{(scope === 'application' ? ['application', 'environment'] : ['environment']).map((layer) => <section className="variable-scope" key={layer}><h3>{t(layer === 'environment' ? 'environmentExpressions' : 'expressions')}{layer !== scope && <span className="scope-badge">{t('definitionReadOnly')}</span>}</h3><div role="tree" aria-label={t(layer === 'environment' ? 'environmentExpressions' : 'expressions')} className="expression-macro-list">{Object.entries(macros).filter(([, node]) => expressionScope(node) === layer && node.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(([id, node]) => <button key={id} type="button" role="treeitem" aria-label={node.display_name} aria-selected={selected === id} className={`parameter-reference ${selected === id ? 'selected' : ''}`} onClick={() => setSelected(id)}><SlotIcon name={node.icon || 'tabler:calculator'} /><strong>{node.display_name}</strong><EngineKeyWarning kind="expressions" id={id} value={node.symbol} t={t} /><span>{t('type_' + node.value_type)}</span></button>)}</div></section>)}</div>
    </aside><main className="operand-properties-area">{macros[selected] ? <NodeProperties draftContext={draft} locked={locked} key={selected} id={selected} nodes={nodes} slots={draft.slots} tasks={draft.tasks} taskMacros={draft.taskMacros} t={t} onChange={(next) => { onChange(next); if (!next[selected]) setSelected(null); }} /> : <div className="empty-state"><h2>{t('noExpressions')}</h2><p>{t('expressionsHint')}</p><button className="button primary" onClick={add}>{t('addComputedVariable')}</button></div>}</main></div>;
}
