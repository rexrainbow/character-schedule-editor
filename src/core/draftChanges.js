// Editor changes are sent by object, never as an unchecked full-project replacement.
const arrays = ['slots', 'days', 'weeks', 'sequences', 'tasks', 'taskMacros'];
const maps = ['operandNodes', 'enumNodes'];
const metadata = ['project', 'environment', 'builtinTasks'];
export function sameData(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]));
}
export function draftChanges(before, after) {
  const changes = [];
  for (const collection of [...arrays, ...maps]) {
    const list = arrays.includes(collection);
    const left = list ? Object.fromEntries(before[collection].map((item) => [item.id, item])) : before[collection] ?? {};
    const right = list ? Object.fromEntries(after[collection].map((item) => [item.id, item])) : after[collection] ?? {};
    for (const id of Object.keys(left)) if (!Object.hasOwn(right, id)) changes.push({ collection, kind: 'remove', id });
    for (const [id, value] of Object.entries(right)) if (!sameData(left[id], value)) changes.push({ collection, kind: 'put', id, value: structuredClone(value) });
    if (list && !sameData(before[collection].map((item) => item.id), after[collection].map((item) => item.id))) changes.push({ collection, kind: 'order', ids: after[collection].map((item) => item.id) });
  }
  for (const id of metadata) if (!sameData(before[id], after[id])) changes.push({ collection: 'metadata', id, kind: after[id] === undefined ? 'remove' : 'put', ...(after[id] === undefined ? {} : { value: structuredClone(after[id]) }) });
  return changes;
}
export function applyDraftChanges(draft, changes) {
  if (!Array.isArray(changes) || changes.length > 10000) throw new Error('invalidDraftChanges');
  const next = structuredClone(draft);
  for (const change of changes) {
    if (!change || typeof change !== 'object') throw new Error('invalidDraftChanges');
    const { collection, kind, id, value, ids } = change;
    if (collection === 'metadata') {
      if (!metadata.includes(id) || !['put', 'remove'].includes(kind) || id === 'project' && kind === 'remove') throw new Error('invalidDraftChanges');
      if (kind === 'remove') delete next[id]; else next[id] = structuredClone(value);
    } else if (arrays.includes(collection)) {
      const items = next[collection];
      if (kind === 'order') {
        if (!Array.isArray(ids) || ids.length !== items.length || new Set(ids).size !== ids.length || ids.some((key) => !items.some((item) => item.id === key))) throw new Error('invalidDraftOrder');
        next[collection] = ids.map((key) => items.find((item) => item.id === key));
      } else {
        if (typeof id !== 'string' || !['put', 'remove'].includes(kind)) throw new Error('invalidDraftChanges');
        if (kind === 'remove') next[collection] = items.filter((item) => item.id !== id);
        else {
          if (!value || value.id !== id) throw new Error('invalidDraftChanges');
          next[collection] = items.some((item) => item.id === id) ? items.map((item) => item.id === id ? structuredClone(value) : item) : [...items, structuredClone(value)];
        }
      }
    } else if (maps.includes(collection)) {
      if (typeof id !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(id) || !['put', 'remove'].includes(kind)) throw new Error('invalidDraftChanges');
      if (kind === 'remove') delete next[collection][id]; else next[collection] = { ...next[collection], [id]: structuredClone(value) };
    } else throw new Error('invalidDraftChanges');
  }
  return next;
}

// Unfinished numeric GUI fields contain NaN. Ordinary JSON would turn it into null.
export const stringifyWire = (value) => JSON.stringify(value, (_, item) => typeof item === 'number' && !Number.isFinite(item) ? { $scheduleNumber: String(item) } : item);
export const parseWire = (text) => JSON.parse(text, (_, item) => item && typeof item === 'object' && Object.keys(item).length === 1 && Object.hasOwn(item, '$scheduleNumber') && ['NaN', 'Infinity', '-Infinity'].includes(item.$scheduleNumber) ? Number(item.$scheduleNumber) : item);
