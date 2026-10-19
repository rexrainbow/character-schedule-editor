// Editor references always use UUIDs; these names are opaque engine contracts.
import { eventGroupName } from './sequenceEvents.js';
export const engineMetadata = (item) => item.engine_key === undefined ? {} : { engine_key: item.engine_key };
export function clearEngineKey(item) { const copy = structuredClone(item); delete copy.engine_key; return copy; }
export function engineKeyEntries(draft) {
  const collections = ['slots', 'days', 'weeks', 'sequences', 'tasks', 'taskMacros'];
  return [
    ...Object.entries(draft.enumNodes ?? {}).map(([id, item]) => ({ kind: 'enums', id, name: item.display_name, key: item.engine_key, path: `/enum_definitions/${id}/engine_key` })),
    ...Object.entries(draft.builtinTasks ?? {}).map(([id, item]) => ({ kind: 'builtinTasks', id, name: item.display_name ?? id, key: item.engine_key })),
    ...collections.flatMap((kind) => (draft[kind] ?? []).map((item) => ({ kind, id: item.id, name: item.name ?? item.display_name, key: item.engine_key }))),
    ...(draft.sequences ?? []).flatMap((sequence) => (sequence.eventGroups ?? []).map((group, index) => ({ kind: 'eventGroups', id: group.id, ownerId: sequence.id, name: eventGroupName(group, draft.days ?? []), key: group.engine_key, path: `/week_sequences/${sequence.id}/event_groups/${index}/engine_key` }))),
    ...Object.entries(draft.operandNodes ?? {}).map(([id, item]) => ({ kind: item.source === 'computed' ? 'expressions' : 'operands', id, name: item.display_name, key: item.engine_key })),
  ];
}
export function engineKeyConflicts(entries, kind, id, key) {
  const normalized = typeof key === 'string' ? key.trim() : '';
  return normalized ? entries.filter((entry) => (entry.kind !== kind || entry.id !== id) && typeof entry.key === 'string' && entry.key.trim() === normalized) : [];
}
