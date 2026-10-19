import { probabilityEnumContract } from './enumParameters.js';

export const builtinVariableKinds = ['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable'];
export const isBuiltinVariableTask = (value) => builtinVariableKinds.includes(value?.builtin);
export const builtinFlowKinds = ['schedule_takeover'];
export const isBuiltinFlowTask = (value) => value?.builtin === 'schedule_takeover';
export const builtinTaskCategories = ['variableOperations', 'flowControl'];
export const createTakeover = () => ({ builtin: 'schedule_takeover', condition: { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: true }, operand_b: { type: 'constant', value: true } }, scope: 'day', target: 'main' });
const contracts = {
  set_variable: { name: 'setVariable', icon: 'tabler:code', value_type: 'any', access: 'write', value: 'expression', valueName: 'assignmentValue' },
  increment_variable: { name: 'incrementVariable', icon: 'tabler:calculator', value_type: 'number', access: 'read_write', value: 'number', valueName: 'incrementAmount' },
  toggle_variable: { name: 'toggleVariable', icon: 'tabler:check', value_type: 'boolean', access: 'read_write' },
  reset_variable: { name: 'resetVariable', icon: 'tabler:repeat', value_type: 'any', access: 'write' },
};
export function builtinVariableDefinition(kind, config, t) {
  const item = config?.[kind] ?? {}, contract = contracts[kind];
  return { id: `builtin:${kind}`, display_name: item.display_name ?? t(contract.name), icon: item.icon || contract.icon, engine_key: item.engine_key ?? '', parameters: [
    { id: 'target', display_name: item.parameters?.target?.display_name ?? t('writeTarget'), type: 'variable_reference', value_type: contract.value_type, access: contract.access },
    ...(contract.value ? [{ id: 'value', display_name: item.parameters?.value?.display_name ?? t(contract.valueName), type: contract.value }] : []),
    ...(kind === 'increment_variable' ? [{ id: 'random_amplitude', display_name: item.parameters?.random_amplitude?.display_name ?? t('randomAmplitude'), type: 'number' }] : []),
  ] };
}
export const builtinVariableDefinitions = (config, t) => builtinVariableKinds.map((kind) => builtinVariableDefinition(kind, config, t));
export function builtinTaskDefinition(kind, config, t) {
  if (kind === 'adjust_probability_event') {
    const item = config?.[kind] ?? {};
    return { id: `builtin:${kind}`, display_name: item.display_name ?? t('adjustProbabilityEvent'), icon: item.icon || 'tabler:repeat', engine_key: item.engine_key ?? '', category: 'flowControl', parameters: ['event', 'property', 'operation', 'value'].map((id) => ({ id, display_name: item.parameters?.[id]?.display_name ?? t(`eventAdjust_${id}`), type: id === 'event' ? 'event_reference' : id === 'value' ? 'number' : 'string', ...(id === 'event' ? { event_kind: 'probability' } : ['property', 'operation'].includes(id) ? probabilityEnumContract(id, t) : {}) })) };
  }
  if (!builtinFlowKinds.includes(kind)) return { ...builtinVariableDefinition(kind, config, t), category: 'variableOperations' };
  const item = config?.[kind] ?? {};
  return { id: `builtin:${kind}`, display_name: item.display_name ?? t('scheduleTakeover'), icon: item.icon || 'tabler:calendar-off', engine_key: item.engine_key ?? '', parameters: ['condition', 'scope', 'target'].map((id) => ({ id, display_name: item.parameters?.[id]?.display_name ?? t({ condition: 'takeoverCondition', scope: 'takeoverScope', target: 'takeoverTarget' }[id]), type: id === 'condition' ? 'boolean' : 'string' })), category: 'flowControl' };
}
export const builtinTaskDefinitions = (config, t) => [...builtinVariableKinds, ...builtinFlowKinds, 'adjust_probability_event'].map((kind) => builtinTaskDefinition(kind, config, t));
export const setVariableDefinition = (config, t) => builtinVariableDefinition('set_variable', config, t);

export function changeBuiltinDefinition(config, current, next) {
  const kind = current.id.slice('builtin:'.length);
  const item = structuredClone(config?.[kind] ?? {});
  for (const key of ['display_name', 'icon', 'engine_key']) if (next[key] !== current[key]) item[key] = next[key];
  for (const p of next.parameters) if (p.display_name !== current.parameters.find((previous) => previous.id === p.id)?.display_name) {
    item.parameters = { ...item.parameters, [p.id]: { display_name: p.display_name } };
  }
  return { ...config, [kind]: item };
}
