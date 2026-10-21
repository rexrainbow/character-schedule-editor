import { enumDefinitionErrors, enumArgumentErrors, resolveDraftEnums, probabilityEnumContract } from './enumParameters.js';

export const enumScope = (node) => node?.scope ?? 'environment';
export const enumChildren = (nodes, parent = null, scope) => Object.entries(nodes).filter(([, node]) => node.parent_id === parent && (!scope || enumScope(node) === scope)).sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
export function enumPath(nodes, id) {
  const parts = [], seen = new Set();
  while (nodes[id] && !seen.has(id)) { seen.add(id); parts.unshift(nodes[id].display_name); id = nodes[id].parent_id; }
  return parts.join('.');
}
export function enumSubtree(nodes, id) {
  const result = new Set(), pending = [id];
  while (pending.length) { const next = pending.pop(); if (result.has(next)) continue; result.add(next); pending.push(...enumChildren(nodes, next).map(([key]) => key)); }
  return result;
}
export function enumTreeErrors(nodes = {}) {
  const errors = [];
  for (const [id, node] of Object.entries(nodes)) {
    const path = `/enum_definitions/${id}`;
    if (!node || typeof node !== 'object') { errors.push({ path, key: 'invalidEnumDefinition' }); continue; }
    if (typeof node.display_name !== 'string' || !node.display_name.trim()) errors.push({ path: `${path}/display_name`, key: 'requiredText' });
    if (node.parent_id !== null && (nodes[node.parent_id]?.node_type !== 'group' || enumScope(nodes[node.parent_id]) !== enumScope(node))) errors.push({ path: `${path}/parent_id`, key: 'invalidEnumParent' });
    let parent = node.parent_id; const seen = new Set([id]);
    while (nodes[parent]) { if (seen.has(parent)) { errors.push({ path: `${path}/parent_id`, key: 'invalidEnumParent' }); break; } seen.add(parent); parent = nodes[parent].parent_id; }
    if (node.node_type === 'enum') errors.push(...enumDefinitionErrors({ ...node, type: 'enum' }, path));
  }
  return errors;
}
export function enumReferences(draft) {
  const parameters = (owner) => (Array.isArray(owner.parameters) ? owner.parameters : []).filter((p) => p?.type === 'enum' && p.enum_id !== undefined);
  return [...(draft.tasks ?? []).flatMap((owner) => parameters(owner).map((p) => ({ id: p.enum_id, parameter: p, owner, scope: 'environment', path: `/tasks/${owner.id}/parameters/${p.id}/enum_id` }))), ...(draft.taskMacros ?? []).flatMap((owner) => parameters(owner).map((p) => ({ id: p.enum_id, parameter: p, owner, scope: 'application', path: `/task_macros/${owner.id}/parameters/${p.id}/enum_id` })))];
}
export function enumReferenceErrors(draft) {
  return enumReferences(draft).flatMap((reference) => {
    const node = draft.enumNodes?.[reference.id];
    return node?.node_type !== 'enum' ? [{ path: reference.path, key: 'missingEnumDefinition' }] : reference.scope === 'environment' && enumScope(node) !== 'environment' ? [{ path: reference.path, key: 'enumEnvironmentOnly' }] : [];
  });
}
export function enumUsageErrors(rawDraft) {
  const draft = resolveDraftEnums(rawDraft), errors = [];
  function walk(value, path, scope) {
    if (!value || typeof value !== 'object') return;
    if (value.builtin === 'adjust_probability_event') for (const key of ['property', 'operation']) errors.push(...enumArgumentErrors(value[key], probabilityEnumContract(key), scope, `${path}/${key}`, true));
    const owner = value.task_id ? draft.tasks.find((task) => task.id === value.task_id) : value.task_macro_id ? draft.taskMacros.find((macro) => macro.id === value.task_macro_id) : null;
    for (const parameter of owner?.parameters ?? []) if (parameter.type === 'enum') errors.push(...enumArgumentErrors(value.arguments?.[parameter.id], parameter, scope, `${path}/arguments/${parameter.id}`));
    for (const [key, child] of Object.entries(value)) walk(child, `${path}/${key}`, scope);
  }
  for (const slot of draft.slots ?? []) walk(slot, `/slots/${slot.id}`, []);
  for (const macro of draft.taskMacros) walk(macro, `/task_macros/${macro.id}`, macro.parameters);
  return errors;
}
export function changeEnumDefinitions(draft, enumNodes) {
  const next = { ...draft, enumNodes }, previous = [...enumReferenceErrors(draft), ...enumUsageErrors(draft)];
  const blocked = [...enumReferenceErrors(next), ...enumUsageErrors(next)].filter((error) => !previous.some((old) => old.path === error.path && old.key === error.key));
  return { draft: blocked.length ? draft : next, blocked };
}
export function addEnumNode(nodes, selected, type, name, scope) {
  const current = nodes[selected], parent = enumScope(current) === scope ? current?.node_type === 'group' ? selected : current?.parent_id ?? null : null;
  const id = crypto.randomUUID();
  return { id, nodes: { ...nodes, [id]: { node_type: type, scope, parent_id: parent, order: enumChildren(nodes, parent, scope).length, display_name: name, icon: type === 'group' ? 'tabler:books' : 'tabler:list', ...(type === 'enum' ? { options: [{ display_name: '', value: '' }] } : {}) } } };
}
export function moveEnumNode(nodes, id, parent, offset) {
  const node = nodes[id];
  if (parent !== null && (nodes[parent]?.node_type !== 'group' || enumScope(nodes[parent]) !== enumScope(node) || enumSubtree(nodes, id).has(parent))) throw new Error('invalidEnumParent');
  const siblings = enumChildren(nodes, parent, enumScope(node)).filter(([key]) => key !== id), position = Math.max(0, Math.min(offset ?? siblings.length, siblings.length));
  siblings.splice(position, 0, [id, { ...node, parent_id: parent }]);
  return { ...nodes, ...Object.fromEntries(siblings.map(([key, value], order) => [key, { ...value, order }])) };
}
export function duplicateEnumSubtree(nodes, id) {
  const ids = [...enumSubtree(nodes, id)], mapping = new Map(ids.map((key) => [key, crypto.randomUUID()])), next = { ...nodes };
  for (const key of ids) { const copy = structuredClone(nodes[key]); delete copy.symbol; next[mapping.get(key)] = { ...copy, parent_id: mapping.get(copy.parent_id) ?? copy.parent_id, ...(key === id ? { display_name: `${copy.display_name} (副本)`, order: enumChildren(nodes, copy.parent_id, enumScope(copy)).length } : {}) }; }
  return { nodes: next, id: mapping.get(id) };
}
