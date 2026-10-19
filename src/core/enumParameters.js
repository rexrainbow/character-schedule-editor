export const parameterValueType = (parameter) => parameter?.type === 'enum' ? 'string' : parameter?.type;
export function resolveEnumParameter(parameter, definitions = {}) {
  if (parameter?.type !== 'enum' || parameter.enum_id === undefined) return parameter;
  const source = definitions[parameter.enum_id];
  return { ...parameter, options: source?.node_type === 'enum' ? source.options : [] };
}
export const resolveEnumParameters = (parameters = [], definitions = {}) => (Array.isArray(parameters) ? parameters : []).map((parameter) => resolveEnumParameter(parameter, definitions));
export const resolveDraftEnums = (draft) => ({ ...draft, tasks: (draft.tasks ?? []).map((task) => ({ ...task, parameters: resolveEnumParameters(task.parameters, draft.enumNodes) })), taskMacros: (draft.taskMacros ?? []).map((macro) => ({ ...macro, parameters: resolveEnumParameters(macro.parameters, draft.enumNodes) })) });
export const enumAccepts = (required, supplied) => supplied?.type === 'enum' && Array.isArray(supplied.options) && supplied.options.length > 0 && supplied.options.every((option) => required.options?.some((candidate) => candidate.value === option.value));
export function enumArgumentErrors(value, parameter, parameters = [], path = '', literal = false) {
  if (value?.type === 'parameter_reference') return enumAccepts(parameter, parameters.find((item) => item.id === value.parameter_id)) ? [] : [{ path, key: 'enumContractMismatch' }];
  const candidate = literal ? typeof value === 'string' ? value : undefined : value?.type === 'constant' ? value.value : undefined;
  return typeof candidate === 'string' && parameter.options?.some((option) => option.value === candidate) ? [] : [{ path, key: 'chooseEnumOption' }];
}
export function enumDefinitionErrors(parameter, path = '') {
  if (parameter.type !== 'enum') return [];
  if (parameter.enum_id !== undefined && parameter.options === undefined) return [];
  if (!Array.isArray(parameter.options) || !parameter.options.length) return [{ path: `${path}/options`, key: 'enumOptionsRequired' }];
  const seen = new Set(), errors = [];
  parameter.options.forEach((option, index) => {
    const location = `${path}/options/${index}`;
    if (typeof option?.display_name !== 'string' || !option.display_name.trim()) errors.push({ path: `${location}/display_name`, key: 'enumOptionNameRequired' });
    if (typeof option?.value !== 'string' || !option.value.trim() || option.value !== option.value.trim()) errors.push({ path: `${location}/value`, key: 'enumOptionValueRequired' });
    if (seen.has(option?.value)) errors.push({ path: `${location}/value`, key: 'enumOptionValueDuplicate' });
    seen.add(option?.value);
  });
  return errors;
}
export const probabilityEnumContract = (key, t = (value) => value) => ({ type: 'enum', options: (key === 'property' ? ['probability_percent', 'cooldown_days'] : ['set', 'increase']).map((value) => ({ value, display_name: t(`${key === 'property' ? 'eventProperty' : 'eventOperation'}_${value}`) })) });
