export const accessCapabilities = (access) => access === 'read_write' ? ['read', 'write'] : [access];
export function updateParameterContract(parameter, change) {
  const next = { ...parameter, ...(typeof change === 'string' ? { type: change } : change) };
  if (next.type === 'enum') {
    delete next.value_type; delete next.access; delete next.event_kind;
    if (typeof change === 'object' && Object.hasOwn(change, 'options')) delete next.enum_id;
    if (next.enum_id !== undefined) { delete next.options; return next; }
    return { ...next, options: next.options ?? [{ display_name: '', value: '' }] };
  }
  delete next.options; delete next.enum_id;
  if (next.type === 'event_reference') { delete next.value_type; delete next.access; return { ...next, event_kind: next.event_kind ?? 'any' }; }
  delete next.event_kind;
  if (next.type === 'variable_reference') return { ...next, value_type: next.value_type ?? 'number', access: next.access ?? 'read_write' };
  delete next.value_type; delete next.access; return next;
}
export function referenceContractAccepts(required, supplied) {
  return supplied?.type === 'variable_reference' && (required.value_type === 'any' || required.value_type === supplied.value_type) && accessCapabilities(required.access).every((access) => accessCapabilities(supplied.access).includes(access));
}
export function variableReferenceErrors(value, parameter, nodes, path = '', scope = []) {
  const error = (key) => [{ path, key }];
  if (value?.type === 'parameter_reference') return referenceContractAccepts(parameter, scope.find((p) => p.id === value.parameter_id)) ? [] : error('variableReferenceContractMismatch');
  if (value?.type !== 'variable_reference') return error('chooseVariableReference');
  const node = nodes[value.reference_id];
  if (node?.node_type !== 'value' || node.source === 'computed') return error('invalidVariableReference');
  if (parameter.value_type !== 'any' && node.value_type !== parameter.value_type) return error('variableReferenceTypeMismatch');
  if (accessCapabilities(parameter.access).includes('write') && node.read_only) return error('readonlyTarget');
  return [];
}
