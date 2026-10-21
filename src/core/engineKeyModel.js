// Editor references always use UUIDs; these names are opaque engine contracts.
import { eventGroupName } from './sequenceEvents.js';
export const engineMetadata = (item) => ({ ...(item.description === undefined ? {} : { description: item.description }), ...(item.symbol === undefined ? {} : { symbol: item.symbol }), ...(item._fallbackValue === undefined ? {} : { _fallbackValue: item._fallbackValue }) });
export function clearEngineKey(item) { const copy = structuredClone(item); if (copy.symbol) { copy.symbol += '_copy'; copy._autoSymbol = true; } return copy; }
export function engineKeyEntries(draft) {
  const collections = ['slots', 'days', 'weeks', 'sequences', 'tasks', 'taskMacros'];
  return [
    ...Object.entries(draft.enumNodes ?? {}).map(([id, item]) => ({ kind: 'enums', id, name: item.display_name, key: item.symbol, path: `/enum_definitions/${id}/symbol` })),
    ...Object.entries(draft.builtinTasks ?? {}).map(([id, item]) => ({ kind: 'builtinTasks', id, name: item.display_name ?? id, key: item.symbol })),
    ...collections.flatMap((kind) => (draft[kind] ?? []).map((item) => ({ kind, id: item.id, name: item.name ?? item.display_name, key: item.symbol }))),
    ...(draft.sequences ?? []).flatMap((sequence) => (sequence.eventGroups ?? []).map((group, index) => ({ kind: 'eventGroups', id: group.id, ownerId: sequence.id, name: eventGroupName(group, draft.days ?? []), key: group.symbol, path: `/week_sequences/${sequence.id}/event_groups/${index}/symbol` }))),
    ...Object.entries(draft.operandNodes ?? {}).map(([id, item]) => ({ kind: item.source === 'computed' ? 'expressions' : 'operands', id, name: item.display_name, key: item.symbol })),
  ];
}
export function engineKeyConflicts(entries, kind, id, key) {
  const normalized = typeof key === 'string' ? key.trim() : '';
  const namespace = (value) => value === 'builtinTasks' ? 'tasks' : value;
  return normalized ? entries.filter((entry) => namespace(entry.kind) === namespace(kind) && entry.id !== id && typeof entry.key === 'string' && entry.key.trim() === normalized) : [];
}
