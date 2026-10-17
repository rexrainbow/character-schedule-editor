import { EngineKeyWarning } from './EngineKeyField.jsx';
import SlotIcon from './SlotIcon.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { isComputed, nodePath } from './operandModel.js';

export default function OperandTree({ nodes, selected, onSelect, search = '', selectable = 'all', valueType, disabledIds = new Set(), revealSelected = false, defaultExpanded = true, t }) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded ? Object.keys(nodes) : []));
  const [searchCollapsed, setSearchCollapsed] = useState(() => new Set());
  const [focused, setFocused] = useState(selected);
  const ref = useRef(null);
  const { children, visible } = useMemo(() => {
    const children = new Map(), visible = new Set();
    for (const [id, node] of Object.entries(nodes)) {
      const list = children.get(node.parent_id) ?? []; list.push([id, node]); children.set(node.parent_id, list);
      // Browsing includes folders even when only value nodes can be selected.
      // Searching a folder's path also reveals the values nested underneath it.
      const matches = !search || nodePath(nodes, id).toLocaleLowerCase().includes(search.toLocaleLowerCase());
      const eligible = !search ? selectable !== 'group' || node.node_type === 'group' : selectable === 'all' || node.node_type === selectable;
      if (matches && eligible && (!valueType || node.node_type === 'group' || node.value_type === valueType)) {
        let parent = id; const seen = new Set();
        while (nodes[parent] && !seen.has(parent)) { seen.add(parent); visible.add(parent); parent = nodes[parent].parent_id; }
      }
    }
    for (const list of children.values()) list.sort((a, b) => a[1].order - b[1].order);
    return { children, visible };
  }, [nodes, search, selectable, valueType]);
  useEffect(() => { setSearchCollapsed(new Set()); }, [search]);
  const isExpanded = (id) => search ? !searchCollapsed.has(id) : expanded.has(id);
  useEffect(() => {
    setFocused(selected);
    setExpanded((previous) => { const next = new Set(previous), seen = new Set(); let parent = nodes[selected]?.parent_id; while (parent && !seen.has(parent)) { seen.add(parent); next.add(parent); parent = nodes[parent]?.parent_id; } return next; });
  }, [selected, nodes[selected]?.parent_id]);
  useEffect(() => {
    if (!revealSelected || !selected) return;
    const frame = requestAnimationFrame(() => ref.current?.querySelector(`[data-node-id="${selected}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [selected, nodes[selected]?.parent_id, nodes[selected]?.order, revealSelected]);
  const rows = [], pending = [...(children.get(null) ?? [])].reverse().map(([id, node]) => ({ id, node, depth: 1 }));
  const seen = new Set();
  while (pending.length) {
    const row = pending.pop(); if (!visible.has(row.id) || seen.has(row.id)) continue; seen.add(row.id); rows.push(row);
    if (isExpanded(row.id)) pending.push(...[...(children.get(row.id) ?? [])].reverse().map(([id, node]) => ({ id, node, depth: row.depth + 1 })));
  }
  function toggle(id) {
    const update = search ? setSearchCollapsed : setExpanded;
    update((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function choose(row) {
    if (disabledIds.has(row.id)) return;
    if (selectable === 'all' || row.node.node_type === selectable) onSelect(row.id);
    else toggle(row.id);
  }
  function focus(id) { setFocused(id); requestAnimationFrame(() => ref.current?.querySelector(`[data-node-id="${id}"]`)?.focus()); }
  function keyboard(e, row, index) {
    let target;
    if (e.key === 'ArrowDown') target = rows[Math.min(index + 1, rows.length - 1)]?.id;
    else if (e.key === 'ArrowUp') target = rows[Math.max(index - 1, 0)]?.id;
    else if (e.key === 'Home') target = rows[0]?.id;
    else if (e.key === 'End') target = rows.at(-1)?.id;
    else if (e.key === 'ArrowRight') { if (row.node.node_type === 'group' && !isExpanded(row.id)) toggle(row.id); else if (rows[index + 1]?.depth > row.depth) target = rows[index + 1].id; }
    else if (e.key === 'ArrowLeft') { if (isExpanded(row.id) && row.node.node_type === 'group') toggle(row.id); else target = row.node.parent_id; }
    else if (e.key === 'Enter' || e.key === ' ') choose(row);
    else return;
    e.preventDefault(); if (target) focus(target);
  }
  const tabId = rows.some((row) => row.id === focused) ? focused : rows[0]?.id;
  return <div className="operand-tree" role="tree" aria-label={t('variableTree')} ref={ref}>{rows.map((row, index) => {
    const { id, node, depth } = row, isGroup = node.node_type === 'group';
    return <div key={id} role="treeitem" aria-level={depth} aria-selected={id === selected} aria-expanded={isGroup ? isExpanded(id) : undefined} aria-disabled={disabledIds.has(id) || undefined} aria-label={node.display_name || t('unnamedNode')} tabIndex={id === tabId ? 0 : -1} data-node-id={id} className={`operand-tree-row ${id === selected ? 'selected' : ''}`} style={{ '--tree-depth': Math.min(depth - 1, 10) }} title={nodePath(nodes, id)} onFocus={() => setFocused(id)} onKeyDown={(e) => keyboard(e, row, index)} onClick={() => choose(row)}>
      {isGroup ? <button type="button" className="tree-expander" tabIndex={-1} aria-label={t(isExpanded(id) ? 'collapseNode' : 'expandNode', { name: node.display_name })} onClick={(e) => { e.stopPropagation(); toggle(id); }}>{isExpanded(id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="tree-expander" />}
      <SlotIcon name={node.icon || (isComputed(node) ? 'tabler:calculator' : isGroup ? 'tabler:books' : 'tabler:code')} /><span className="tree-node-name">{node.display_name || t('unnamedNode')}</span><EngineKeyWarning kind={isComputed(node) ? 'expressions' : 'operands'} id={id} value={node.engine_key} t={t} />{!isGroup && <span className="tree-type">{t(`type_${node.value_type}`)}</span>}
    </div>;
  })}{!rows.length && <p className="selector-empty">{t('noVariables')}</p>}</div>;
}
