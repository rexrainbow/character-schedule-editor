import { probabilityEnumContract } from './enumParameters.js';

export const builtinVariableKinds = ['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable'];
export const isBuiltinVariableTask = (value) => builtinVariableKinds.includes(value?.builtin);
export const builtinFlowKinds = ['release_slot'];
export const isBuiltinFlowTask = (value) => value?.builtin === 'release_slot';
export const builtinTaskCategories = ['variableOperations', 'flowControl'];
export const createRelease = () => ({ builtin: 'release_slot', condition: null });
const contracts = {
  set_variable: { name: 'setVariable', icon: 'tabler:code', value_type: 'any', access: 'write', value: 'expression', valueName: 'assignmentValue' },
  increment_variable: { name: 'incrementVariable', icon: 'tabler:calculator', value_type: 'number', access: 'read_write', value: 'number', valueName: 'incrementAmount' },
  toggle_variable: { name: 'toggleVariable', icon: 'tabler:check', value_type: 'boolean', access: 'read_write' },
  reset_variable: { name: 'resetVariable', icon: 'tabler:repeat', value_type: 'any', access: 'write' },
};
function baseBuiltinVariableDefinition(kind, config, t) {
  const item = config?.[kind] ?? {}, contract = contracts[kind];
  return { id: `builtin:${kind}`, description: item.description, display_name: item.display_name || t(contract.name), icon: item.icon || contract.icon, symbol: item.symbol ?? kind, parameters: [
    { id: 'target', description: item.parameters?.target?.description, symbol: item.parameters?.target?.symbol ?? 'target', display_name: item.parameters?.target?.display_name ?? t('writeTarget'), type: 'variable_reference', value_type: contract.value_type, access: contract.access },
    ...(contract.value ? [{ id: 'value', description: item.parameters?.value?.description, symbol: item.parameters?.value?.symbol ?? 'value', display_name: item.parameters?.value?.display_name ?? t(contract.valueName), type: contract.value }] : []),
    ...(kind === 'increment_variable' ? [{ id: 'random_amplitude', description: item.parameters?.random_amplitude?.description, symbol: item.parameters?.random_amplitude?.symbol ?? 'random_amplitude', display_name: item.parameters?.random_amplitude?.display_name ?? t('randomAmplitude'), type: 'number' }] : []),
  ] };
}
export const builtinVariableDefinitions = (config, t) => builtinVariableKinds.map((kind) => builtinVariableDefinition(kind, config, t));
function baseBuiltinTaskDefinition(kind, config, t) {
  if (kind === 'schedule_event') {
    const item = config?.[kind] ?? {};
    const fields = ['display_name', 'date_mode', 'offset', 'weekday', 'day_source', 'execution_mode', 'priority'];
    const choices = { date_mode: ['days', 'weeks_weekday'], weekday: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], execution_mode: ['overlay', 'interrupt_main', 'interrupt_lower'] };
    return { id: `builtin:${kind}`, description: item.description, display_name: item.display_name ?? t('scheduleEvent'), icon: item.icon || 'tabler:calendar-event', symbol: item.symbol ?? kind, category: 'flowControl', parameters: fields.map((id) => ({ id, description: item.parameters?.[id]?.description, symbol: item.parameters?.[id]?.symbol ?? id, display_name: item.parameters?.[id]?.display_name ?? t(`scheduleField_${id}`), type: choices[id] ? 'enum' : ['offset', 'priority'].includes(id) ? 'number' : 'string', ...(choices[id] ? { options: choices[id].map((value) => ({ display_name: t(id === 'weekday' ? value : id === 'execution_mode' ? `executionMode_${value}` : `scheduleDate_${value}`), value })) } : {}) })) };
  }
  if (kind === 'adjust_probability_event') {
    const item = config?.[kind] ?? {};
    return { id: `builtin:${kind}`, description: item.description, display_name: item.display_name ?? t('adjustProbabilityEvent'), icon: item.icon || 'tabler:repeat', symbol: item.symbol ?? kind, category: 'flowControl', parameters: ['event', 'property', 'operation', 'value'].map((id) => ({ id, description: item.parameters?.[id]?.description, symbol: item.parameters?.[id]?.symbol ?? id, display_name: item.parameters?.[id]?.display_name ?? t(`eventAdjust_${id}`), type: id === 'event' ? 'event_reference' : id === 'value' ? 'number' : 'string', ...(id === 'event' ? { event_kind: 'probability' } : ['property', 'operation'].includes(id) ? probabilityEnumContract(id, t) : {}) })) };
  }
  if (!builtinFlowKinds.includes(kind)) return { ...builtinVariableDefinition(kind, config, t), category: 'variableOperations' };
  const item = config?.[kind] ?? {};
  return { id: `builtin:${kind}`, description: item.description, display_name: item.display_name ?? t('releaseSlot'), icon: item.icon || 'tabler:door-exit', symbol: item.symbol ?? kind, parameters: [{ id: 'condition', description: item.parameters?.condition?.description, symbol: item.parameters?.condition?.symbol ?? 'condition', display_name: item.parameters?.condition?.display_name ?? t('releaseCondition'), type: 'boolean' }], category: 'flowControl' };
}
export const builtinTaskDefinitions = (config, t) => [...builtinVariableKinds, ...builtinFlowKinds, 'adjust_probability_event', 'schedule_event'].map((kind) => builtinTaskDefinition(kind, config, t));
export const setVariableDefinition = (config, t) => builtinVariableDefinition('set_variable', config, t);

export function changeBuiltinDefinition(config, current, next) {
  const kind = current.id.slice('builtin:'.length);
  const item = structuredClone(config?.[kind] ?? {});
  for (const key of ['display_name', 'icon', 'symbol', 'description']) if (next[key] !== current[key]) item[key] = next[key];
  for (const p of next.parameters) {
    const previous = current.parameters.find((item) => item.id === p.id);
    if (p.icon !== previous?.icon) item.parameters = { ...item.parameters, [p.id]: { ...item.parameters?.[p.id], icon: p.icon } };
    if (p.options?.some((option, index) => option.icon !== previous?.options?.[index]?.icon)) item.parameters = { ...item.parameters, [p.id]: { ...item.parameters?.[p.id], option_icons: Object.fromEntries(p.options.filter((option) => option.icon !== undefined).map((option) => [option.value, option.icon])) } };
  }
  for (const p of next.parameters) if (p.description !== current.parameters.find((previous) => previous.id === p.id)?.description) item.parameters = { ...item.parameters, [p.id]: { ...item.parameters?.[p.id], description: p.description } };
  for (const p of next.parameters) if (p.symbol !== current.parameters.find((previous) => previous.id === p.id)?.symbol) item.parameters = { ...item.parameters, [p.id]: { ...item.parameters?.[p.id], symbol: p.symbol } };
  for (const p of next.parameters) if (p.display_name !== current.parameters.find((previous) => previous.id === p.id)?.display_name) {
    item.parameters = { ...item.parameters, [p.id]: { ...item.parameters?.[p.id], display_name: p.display_name } };
  }
  return { ...config, [kind]: item };
}

function parameterIcons(definition, config) {
  const overrides = config?.[definition.id.slice(8)]?.parameters ?? {};
  return { ...definition, parameters: definition.parameters.map((p) => ({ ...p, ...(overrides[p.id]?.icon === undefined ? {} : { icon: overrides[p.id].icon }), ...(p.options ? { options: p.options.map((option) => ({ ...option, ...(overrides[p.id]?.option_icons?.[option.value] === undefined ? {} : { icon: overrides[p.id].option_icons[option.value] }) })) } : {}) })) };
}
export function builtinVariableDefinition(kind, config, t) { return parameterIcons(baseBuiltinVariableDefinition(kind, config, t), config); }
export function builtinTaskDefinition(kind, config, t) { return parameterIcons(baseBuiltinTaskDefinition(kind, config, t), config); }
