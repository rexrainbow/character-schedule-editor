export const eventKind = (group) => group.kind ?? (group.interval === 0 ? 'once' : 'periodic');
export const eventProperties = ['probability_percent', 'cooldown_days', 'cooldown_remaining'];
export const eventCatalog = (draft) => (draft.sequences ?? []).flatMap((sequence) => (sequence.eventGroups ?? []).map((group) => ({ ...group, kind: eventKind(group), sequenceId: sequence.id, sequenceName: sequence.name, name: group.display_name?.trim() || draft.days.find((day) => day.id === group.dayId)?.name || '', icon: group.icon ?? draft.days.find((day) => day.id === group.dayId)?.icon ?? 'tabler:calendar-event' })));
export const eventContractAccepts = (required, supplied) => supplied?.type === 'event_reference' && ((required.event_kind ?? 'any') === 'any' || supplied.event_kind === required.event_kind);
export function eventReferenceErrors(value, contract = {}, parameters = [], path = '') {
  if (value?.type === 'parameter_reference') return eventContractAccepts(contract, parameters.find((p) => p.id === value.parameter_id)) ? [] : [{ path, key: 'eventReferenceContractMismatch' }];
  return value?.type === 'current_event_reference' || value?.type === 'event_reference' && typeof value.event_group_id === 'string' && !!value.event_group_id ? [] : [{ path, key: 'chooseEventReference' }];
}
export function eventUsageErrors(draft) {
  const catalog = new Map(eventCatalog(draft).map((group) => [group.id, group])), errors = [];
  function walk(value, path, required = 'any', scope = []) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'event_reference' && value.event_group_id) {
      const group = catalog.get(value.event_group_id);
      if (!group) errors.push({ path: `${path}/event_group_id`, key: 'missingEventReference' });
      else if (required === 'probability' && group.kind !== 'probability') errors.push({ path, key: 'probabilityEventRequired' });
    }
    if (value.type === 'event_property') {
      errors.push(...eventReferenceErrors(value.event, { event_kind: 'probability' }, scope, `${path}/event`));
      walk(value.event, `${path}/event`, 'probability', scope); return;
    }
    if (value.builtin === 'adjust_probability_event') {
      walk(value.event, `${path}/event`, 'probability', scope); walk(value.value, `${path}/value`, 'any', scope); return;
    }
    if (value.arguments) {
      const definition = value.task_macro_id ? draft.taskMacros.find((macro) => macro.id === value.task_macro_id) : draft.tasks.find((task) => task.id === value.task_id);
      for (const [id, arg] of Object.entries(value.arguments)) walk(arg, `${path}/arguments/${id}`, definition?.parameters.find((p) => p.id === id)?.event_kind ?? 'any', scope);
    }
    for (const [key, child] of Object.entries(value)) if (key !== 'arguments') walk(child, `${path}/${key}`, required, scope);
  }
  for (const slot of draft.slots ?? []) walk(slot, `/slots/${slot.id}`);
  for (const macro of draft.taskMacros ?? []) walk(macro, `/task_macros/${macro.id}`, 'any', macro.parameters);
  for (const [id, node] of Object.entries(draft.operandNodes ?? {})) walk(node.definition, `/expression_macros/${id}/definition`);
  return errors;
}
export function eventReferencesTo(draft, ids) {
  const wanted = new Set(ids), refs = [];
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'event_reference' && wanted.has(value.event_group_id)) refs.push({ path, id: value.event_group_id });
    for (const [key, child] of Object.entries(value)) walk(child, `${path}/${key}`);
  }
  walk(draft.slots, '/slots'); walk(draft.taskMacros, '/task_macros'); walk(draft.operandNodes, '/operand_nodes'); return refs;
}
