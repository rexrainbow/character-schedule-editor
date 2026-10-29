import { addExpressionFunctions } from './expressionFunctions.js';
// The engine supplies these values as one consistent execution snapshot.
export function addProgressDefinitions(nodes, slotsPerDay, t) {
  const next = structuredClone(nodes);
  const find = (key) => Object.entries(next).find(([, node]) => node.symbol?.trim() === key)?.[0];
  function ensure(key, definition) {
    const existing = find(key);
    if (existing) {
      const node = next[existing];
      if (node.scope !== 'environment' || node.node_type !== definition.node_type || node.value_type !== definition.value_type || node.source !== definition.source) throw new Error('progressTemplateConflict');
      return existing;
    }
    const id = crypto.randomUUID(); next[id] = { ...definition, scope: 'environment', symbol: key }; return id;
  }
  const root = ensure('schedule_progress', { display_name: t('progressGroup'), icon: 'tabler:calendar-stats', node_type: 'group', parent_id: null, order: Object.values(next).filter((n) => n.source !== 'computed' && (n.scope ?? 'environment') === 'environment' && n.parent_id === null).length });
  const ids = {};
  for (const [name, label, value] of [['current_week', 'progressWeek', 1], ['current_weekday', 'progressWeekday', 1], ['current_day', 'progressDay', 1], ['current_slot', 'progressSlot', 1], ['slots_per_day', 'progressSlotsPerDay', slotsPerDay], ['total_weeks', 'progressTotalWeeks', 0]]) {
    ids[name] = ensure(`schedule_${name}`, { display_name: t(label), icon: 'tabler:code', node_type: 'value', parent_id: root, order: Object.values(next).filter((n) => n.parent_id === root).length, value_type: 'number', read_only: true, initial_value: value });
  }
  const ref = (name) => ({ type: 'reference', reference_id: ids[name] });
  for (const [name, label, a, comparator, b] of [['is_first_slot', 'progressFirstSlot', ref('current_slot'), '==', { type: 'constant', value: 1 }], ['is_weekend', 'progressWeekend', ref('current_weekday'), '>=', { type: 'constant', value: 6 }], ['is_last_week', 'progressLastWeek', ref('current_week'), '==', ref('total_weeks')]]) {
    ensure(`schedule_${name}`, { display_name: t(label), icon: 'tabler:calculator', source: 'computed', node_type: 'value', parent_id: null, order: 0, value_type: 'boolean', definition: { kind: 'boolean', condition: { kind: 'comparison', operand_a: a, comparator, operand_b: b } } });
  }
  return addExpressionFunctions(next, t);
}
