import { editProject } from '../../core/projectApi.js';
import { useState } from 'react';
import { ArrowUp, ArrowDown, Copy, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import OperandTree from '../components/OperandTree.jsx';
import IconField from '../components/IconField.jsx';
import EngineKeyField from '../components/EngineKeyField.jsx';
import EnumOptionsEditor from './EnumOptionsEditor.jsx';
import useEditorView from '../hooks/useEditorView.js';
import { IconButton, Issues } from '../components/ui.jsx';
import { enumChildren, enumPath, enumScope, enumSubtree, enumTreeErrors } from '../../core/enumDefinitions.js';

export default function EnumDefinitionsEditor({ draft, scope, onChange, t, view, onViewChange }) {
  const nodes = draft.enumNodes ?? {}, initial = Object.keys(nodes).find((id) => enumScope(nodes[id]) === scope);
  const [selected, setSelected, search, setSearch] = useEditorView(view, onViewChange, initial);
  const [blocked, setBlocked] = useState([]), node = nodes[selected], locked = !!node && enumScope(node) !== scope;
  const siblings = node ? enumChildren(nodes, node.parent_id, enumScope(node)) : [], position = siblings.findIndex(([id]) => id === selected);
  const subtree = node ? enumSubtree(nodes, selected) : new Set();
  function commit(next) {
    const result = editProject(draft, t).enums.replaceNodes(next); setBlocked(result.blocked);
    if (result.blocked.length) return false;
    onChange(result.draft); return true;
  }
  function update(change) { if (!locked) commit({ ...nodes, [selected]: { ...node, ...change } }); }
  function add(type) { const result = editProject(draft, t).enums.create({ selectedId: selected, node_type: type, display_name: t(type === 'group' ? 'newEnumGroup' : 'newEnum'), scope }); if (commit(result.draft.enumNodes)) { setSelected(result.id); setSearch(''); } }
  function copy() { const result = editProject(draft, t).enums.duplicate(selected); if (commit(result.draft.enumNodes)) { setSelected(result.id); setSearch(''); } }
  function remove() { if (window.confirm(t('deleteEnumConfirm', { count: subtree.size }))) { const result = editProject(draft, t).enums.remove(selected); if (!result.ok) { setBlocked(result.blocked); return; } if (commit(result.draft.enumNodes)) setSelected(null); } }
  function swap(offset) { if (!locked && node) commit(editProject(draft, t).enums.move(selected, node.parent_id, position + offset).draft.enumNodes); }
  const errors = enumTreeErrors(nodes).filter((error) => error.path.startsWith(`/enum_definitions/${selected}/`));
  return <div className="operand-workspace enum-definitions-workspace"><aside className="operand-sidebar"><h2>{t('enums')}</h2><label className="search-field"><Search size={16} /><input aria-label={t('searchEnums')} placeholder={t('searchEnums')} value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="tree-actions"><button className="button secondary" onClick={() => add('group')}><FolderPlus size={15} />{t('addEnumGroup')}</button><button className="button secondary" onClick={() => add('enum')}><Plus size={15} />{t('addEnumDefinition')}</button><IconButton icon={Copy} label={t('duplicateSubtree')} disabled={!node || locked} onClick={copy} /><div className="tree-reorder"><IconButton icon={ArrowUp} label={t('up')} disabled={!node || locked || !!search || position <= 0} onClick={() => swap(-1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={!node || locked || !!search || position >= siblings.length - 1} onClick={() => swap(1)} /></div></div><div className="scope-tree-list">{(scope === 'application' ? ['application', 'environment'] : ['environment']).map((layer) => <section className="variable-scope" key={layer}><h3>{t(layer === scope ? 'ownEnumDefinitions' : 'providedEnumDefinitions')}{layer !== scope && <span className="scope-badge">{t('definitionReadOnly')}</span>}</h3><OperandTree nodes={Object.fromEntries(Object.entries(nodes).filter(([, item]) => enumScope(item) === layer))} selected={selected} search={search} onSelect={(id) => { setSelected(id); setBlocked([]); }} collection="enums" treeLabel="enumTree" emptyLabel="noEnums" t={t} /></section>)}</div></aside>
    <main className="operand-properties-area">{node ? <div className="node-properties">{locked && <p className="scope-notice">{t('enumDefinitionLocked')}</p>}<fieldset className="definition-fields" disabled={locked}><div className="schedule-titlebar"><div className="schedule-name"><div className="name-with-icon"><IconField value={node.icon} onChange={(icon) => update({ icon })} t={t} /><input aria-label={t('enumDefinitionName')} value={node.display_name} onChange={(event) => update({ display_name: event.target.value })} /><EngineKeyField kind="enums" item={{ ...node, id: selected }} onChange={(engine_key) => update({ engine_key })} t={t} /></div></div></div><p className="node-path">{enumPath(nodes, selected)}</p><label className="enum-parent-field">{t('parentNode')}<select aria-label={t('parentNode')} value={node.parent_id ?? ''} onChange={(event) => commit(editProject(draft, t).enums.move(selected, event.target.value || null).draft.enumNodes)}><option value="">{t('rootNode')}</option>{Object.entries(nodes).filter(([id, item]) => item.node_type === 'group' && enumScope(item) === enumScope(node) && !subtree.has(id)).map(([id]) => <option key={id} value={id}>{enumPath(nodes, id)}</option>)}</select></label>
      {node.node_type === 'enum' && <section className="enum-definition-options"><h2>{t('enumOptions')}</h2><p className="field-hint">{t('enumDefinitionHint')}</p><EnumOptionsEditor options={node.options} onChange={(options) => update({ options })} t={t} /></section>}<button className="button secondary danger" onClick={remove}><Trash2 size={16} />{t('deleteEnumDefinition')}</button></fieldset>{!!errors.length && <Issues errors={errors} t={t} />}</div> : <div className="empty-state"><h2>{t('selectEnumDefinition')}</h2><p>{t('enumDefinitionHint')}</p><button className="button primary" onClick={() => add('enum')}><Plus size={16} />{t('addEnumDefinition')}</button></div>}{!!blocked.length && <div className="shared-warning" role="alert"><p>{t('enumChangeBlocked')}</p><Issues errors={blocked} t={t} /></div>}</main>
  </div>;
}
