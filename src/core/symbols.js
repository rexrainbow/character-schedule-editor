export const symbolPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function symbolBase(value, fallback = 'item') {
  const base = String(value ?? '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return base ? /^[A-Za-z_]/.test(base) ? base : `_${base}` : fallback;
}
export function newSymbol(items, label, fallback = 'item') {
  const used = new Set(items.map((item) => item.symbol)), base = symbolBase(label, fallback);
  let name = base, suffix = 2; while (used.has(name)) name = `${base}_${suffix++}`;
  return name;
}
export function normalizeSymbols(input) {
  const draft = structuredClone(input);
  function collection(items, fallback, label = 'display_name', reserved = []) {
    items = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === 'object');
    const used = new Set([...reserved, ...items.filter((item) => item.symbol && !item._autoSymbol).map((item) => item.symbol)]);
    for (const item of items) {
      if (item.symbol === undefined || item._autoSymbol) {
        const base = symbolBase(item.symbol ?? item[label], fallback); let name = base, suffix = 2;
        while (used.has(name)) name = `${base}_${suffix++}`;
        item.symbol = name; used.add(name); delete item._autoSymbol;
      }
      if (!item[label] || item._fallbackValue !== undefined && item[label] === item._fallbackValue) { item[label] = item.symbol; item._fallbackValue = item.symbol; }
      else delete item._fallbackValue;
    }
  }
  const computed = Object.values(draft.operandNodes ?? {}).filter((item) => item.source === 'computed');
  collection(Object.values(draft.operandNodes ?? {}).filter((item) => item.source !== 'computed'), 'variable');
  collection(computed, 'expression'); collection(Object.values(draft.enumNodes ?? {}), 'enum');
  const builtinNames = ['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable', 'release_slot', 'adjust_probability_event', 'schedule_event'];
  draft.builtinTasks ??= {};
  for (const [name, item] of Object.entries(draft.builtinTasks)) if (item.symbol === undefined) item.symbol = name;
  collection(Object.values(draft.builtinTasks), 'builtin');
  collection(draft.tasks ?? [], 'task', 'display_name', builtinNames.map((name) => draft.builtinTasks[name]?.symbol ?? name));
  for (const key of ['slots', 'days', 'weeks', 'sequences']) collection(draft[key] ?? [], key.slice(0, -1), 'name');
  collection(draft.taskMacros ?? [], 'macro');
  for (const owner of [...(draft.tasks ?? []), ...(draft.taskMacros ?? [])]) collection(owner.parameters ?? [], 'parameter');
  collection((draft.sequences ?? []).flatMap((sequence) => sequence.eventGroups ?? []), 'event');
  return draft;
}
export function symbolErrors(draft) {
  const groups = {
    variables: Object.entries(draft.operandNodes ?? {}).filter(([, item]) => item.source !== 'computed'),
    expressions: Object.entries(draft.operandNodes ?? {}).filter(([, item]) => item.source === 'computed'),
    enums: Object.entries(draft.enumNodes ?? {}),
    tasks: [...(draft.tasks ?? []).map((item) => [item.id, item]), ...['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable', 'release_slot', 'adjust_probability_event', 'schedule_event'].map((key) => [key, draft.builtinTasks?.[key] ?? { symbol: key }])],
    taskMacros: (draft.taskMacros ?? []).map((item) => [item.id, item]),
    ...Object.fromEntries(['slots', 'days', 'weeks', 'sequences'].map((key) => [key, (draft[key] ?? []).map((item) => [item.id, item])])),
    events: (draft.sequences ?? []).flatMap((sequence) => (sequence.eventGroups ?? []).map((item) => [item.id, item])),
  };
  for (const owner of [...(draft.tasks ?? []), ...(draft.taskMacros ?? [])]) groups[`parameters/${owner.id}`] = (Array.isArray(owner.parameters) ? owner.parameters : []).filter(Boolean).map((item) => [item.id, item]);
  const builtinRoles = { set_variable: ['target', 'value'], increment_variable: ['target', 'value', 'random_amplitude'], toggle_variable: ['target'], reset_variable: ['target'], release_slot: ['condition'], adjust_probability_event: ['event', 'property', 'operation', 'value'], schedule_event: ['display_name', 'date_mode', 'offset', 'weekday', 'day_source', 'execution_mode', 'priority'] };
  for (const [kind, roles] of Object.entries(builtinRoles)) groups[`parameters/builtin_${kind}`] = roles.map((role) => [role, { symbol: draft.builtinTasks?.[kind]?.parameters?.[role]?.symbol ?? role }]);
  const errors = [];
  for (const [group, items] of Object.entries(groups)) {
    const used = new Map();
    for (const [id, item] of items) {
      const path = `/${group}/${id}/symbol`;
      if (!symbolPattern.test(item.symbol ?? '')) errors.push({ key: 'invalidSymbol', code: 'invalidSymbol', path });
      else if (used.has(item.symbol)) errors.push({ key: 'duplicateSymbol', code: 'duplicateSymbol', path, value: item.symbol });
      else used.set(item.symbol, id);
    }
  }
  return errors;
}
// Persistence/runtime use `name`; working schedules retain their historical display `name`.
export function namedData(value) {
  if (Array.isArray(value)) return value.map(namedData);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).filter(([key, item]) => !key.startsWith('_') && !(key === 'description' && typeof item === 'string' && !item.trim())).map(([key, item]) => [key === 'symbol' ? 'name' : key, namedData(item)]));
  if (value._fallbackValue !== undefined && value.display_name === value._fallbackValue) result.display_name = '';
  return result;
}
export function workingData(value) {
  if (Array.isArray(value)) return value.map(workingData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === 'name' ? 'symbol' : key, workingData(item)]));
}
