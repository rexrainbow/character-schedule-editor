import { eventReferenceErrors, eventProperties } from './eventReferences.js';
import { enumArgumentErrors, parameterValueType, probabilityEnumContract } from './enumParameters.js';
import { variableBoundsErrors } from './variableBounds.js';
import { isBuiltinVariableTask, isBuiltinFlowTask } from './builtinTaskModel.js';
import { variableReferenceErrors } from './parameterModel.js';
import { clearEngineKey, engineMetadata } from './engineKeyModel.js';
export const variableScope = (node) => node?.scope ?? 'environment';
export const expressionScope = (node) => node?.scope ?? 'application';
export const nodeScope = (node) => node?.source === 'computed' ? expressionScope(node) : variableScope(node);
export const defaultInitialValue = (type) => type === 'string' ? '' : type === 'boolean' ? false : 0;
export const initialValue = (node) => Object.hasOwn(node, 'initial_value') ? node.initial_value : defaultInitialValue(node.value_type);
export const scopedVariables = (nodes, scope) => Object.fromEntries(Object.entries(variableNodes(nodes)).filter(([, node]) => variableScope(node) === scope));
export const childrenOf = (nodes, parent, scope) => Object.entries(nodes).filter(([, n]) => n.source !== 'computed' && n.parent_id === parent && (!scope || variableScope(n) === scope)).sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
export function subtreeIds(nodes, id) {
  const result = new Set(), pending = [id];
  const children = new Map();
  for (const [key, node] of Object.entries(nodes)) { const list = children.get(node.parent_id) ?? []; list.push(key); children.set(node.parent_id, list); }
  while (pending.length) { const key = pending.pop(); if (result.has(key)) continue; result.add(key); pending.push(...(children.get(key) ?? [])); }
  return result;
}
export function nodePath(nodes, id) {
  const parts = [], seen = new Set();
  while (id && nodes[id] && !seen.has(id)) { seen.add(id); parts.unshift(nodes[id].display_name || '—'); id = nodes[id].parent_id; }
  return parts.join('.');
}
export function operandType(operand, nodes, parameters = []) {
  // Parameter UUIDs resolve only against the current sequence invocation scope.
  if (operand?.type === 'parameter_reference') return parameterValueType(parameters.find((p) => p.id === operand.parameter_id)) ?? null;
  if (operand?.type === 'expression' || operand?.type === 'event_property') return 'number';
  if (operand?.type === 'constant') return ['number', 'string', 'boolean'].includes(typeof operand.value) ? typeof operand.value : null;
  const node = nodes?.[operand?.type === 'expression_macro_reference' ? operand.expression_macro_id : operand?.reference_id];
  return node?.node_type === 'value' && (operand?.type === 'expression_macro_reference' ? isComputed(node) : operand?.type === 'reference' && !isComputed(node)) ? node.value_type : null;
}
export const arithmeticOperators = ['+', '-', '*', '/'];
export const wrapExpression = (operand) => ({ type: 'expression', operator: '+', operand_a: structuredClone(operand), operand_b: { type: 'constant', value: 0 } });
export function operandAt(root, path) { return path.reduce((node, key) => node?.[key], root); }
export function replaceOperand(root, path, value) {
  if (!path.length) return value;
  const next = { ...root }; let target = next, original = root;
  for (const key of path.slice(0, -1)) { target[key] = { ...original[key] }; target = target[key]; original = original[key]; }
  target[path.at(-1)] = value;
  return next;
}
export function formatOperand(value, nodes, missing = '?', parameters = [], parameterPrefix = 'Parameters') {
  const output = [], pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') { output.push(item); continue; }
    if (item?.type === 'event_property') { output.push(`Event.${item.property}`); continue; }
    if (item?.type === 'expression') pending.push(')', item.operand_b, ` ${item.operator} `, item.operand_a, '(');
    else if ((item?.type === 'reference' || item?.type === 'variable_reference')) output.push(nodePath(nodes, item.reference_id) || missing);
    else if (item?.type === 'expression_macro_reference') output.push(nodePath(nodes, item.expression_macro_id) || missing);
    else if (item?.type === 'parameter_reference') { const p = parameters.find((p) => p.id === item.parameter_id); output.push(p ? `${parameterPrefix}.${p.display_name}` : missing); }
    else if (item?.type === 'constant' && ['number','string','boolean'].includes(typeof item.value) && (typeof item.value !== 'number' || Number.isFinite(item.value))) output.push(typeof item.value === 'string' ? JSON.stringify(item.value) : String(item.value));
    else output.push(missing);
  }
  return output.join('');
}
export function operandErrors(operand, nodes, path = '', numericOnly = false, parameters = []) {
  const errors = [], pending = [{ operand, path, numericOnly }];
  while (pending.length) {
    const { operand: op, path: location, numericOnly: numberRequired } = pending.pop();
    const report = (key, suffix = '') => errors.push({ path: `${location}${suffix}`, key });
    if (!op || typeof op !== 'object') { report('chooseOperand'); continue; }
    if (op.type === 'event_property') {
      errors.push(...eventReferenceErrors(op.event, { event_kind: 'probability' }, parameters, `${location}/event`));
      if (!eventProperties.includes(op.property)) report('invalidEventProperty', '/property');
    } else if (op.type === 'expression') {
      if (!arithmeticOperators.includes(op.operator)) report('invalidArithmeticOperator', '/operator');
      if (op.operator === '/' && op.operand_b?.type === 'constant' && op.operand_b.value === 0) report('divisionByZero', '/operand_b/value');
      pending.push({ operand: op.operand_b, path: `${location}/operand_b`, numericOnly: true }, { operand: op.operand_a, path: `${location}/operand_a`, numericOnly: true });
    } else if (op.type === 'parameter_reference') {
      const type = operandType(op, nodes, parameters);
      if (!type) report('missingMacroParameter', '/parameter_id');
      else if (['variable_reference', 'event_reference'].includes(type)) report('variableReferenceAsValue');
      else if (numberRequired && type !== 'number') report('numericOperandRequired');
    } else if (op.type === 'reference' || op.type === 'expression_macro_reference') {
      const type = operandType(op, nodes);
      const key = op.type === 'reference' ? 'reference_id' : 'expression_macro_id';
      if (!op[key]) report('chooseOperand', `/${key}`);
      else if (!type) report('missingOperand', `/${key}`);
      else if (numberRequired && type !== 'number') report('numericOperandRequired');
    } else if (op.type === 'constant') {
      const type = typeof op.value;
      if (!['number','string','boolean'].includes(type) || type === 'number' && !Number.isFinite(op.value)) report('finiteNumber', '/value');
      else if (numberRequired && type !== 'number') report('numericOperandRequired');
    } else report('chooseOperand');
  }
  return errors;
}
export function conditionErrors(condition, nodes, path = '', parameters = []) {
  if (condition == null) return [];
  if (typeof condition !== 'object') return [{ path, key: 'invalidCondition' }];
  if (condition.kind === 'group') {
    const errors = [];
    if (!['ALL','ANY'].includes(condition.mode)) errors.push({ path: `${path}/mode`, key: 'invalidConditionMode' });
    if (!Array.isArray(condition.items) || !condition.items.length) errors.push({ path: `${path}/items`, key: 'emptyGroup' });
    else condition.items.forEach((item, i) => errors.push(...(item === null ? [{ path: `${path}/items/${i}`, key: 'invalidCondition' }] : conditionErrors(item, nodes, `${path}/items/${i}`, parameters))));
    return errors;
  }
  const errors = [];
  if (condition.kind !== 'comparison') errors.push({ path, key: 'invalidCondition' });
  if (!['==','!=','<','<=','>','>='].includes(condition.comparator)) errors.push({ path: `${path}/comparator`, key: 'invalidComparator' });
  for (const key of ['operand_a', 'operand_b']) {
    errors.push(...operandErrors(condition[key], nodes, `${path}/${key}`, false, parameters));
  }
  const a = operandType(condition.operand_a, nodes, parameters), b = operandType(condition.operand_b, nodes, parameters);
  if (a && b && a !== b) errors.push({ path, key: 'operandTypeMismatch' });
  if ((a && a !== 'number' || b && b !== 'number') && !['==', '!='].includes(condition.comparator)) errors.push({ path: `${path}/comparator`, key: 'comparatorMismatch' });
  return errors;
}
export function argumentErrors(value, parameter, nodes, path = '', scope = []) {
  if (parameter.type === 'enum') return enumArgumentErrors(value, parameter, scope, path);
  if (parameter.type === 'event_reference') return eventReferenceErrors(value, parameter, scope, path);
  if (parameter.type === 'variable_reference') return variableReferenceErrors(value, parameter, nodes, path, scope);
  const errors = operandErrors(value, nodes, path, parameter.type === 'number', scope);
  const type = operandType(value, nodes, scope);
  if (type && type !== parameter.type) errors.push({ path, key: 'parameterTypeMismatch', field: parameter.display_name });
  return errors;
}
export const TASK_MACRO_MODES = ['sequence', 'branch', 'priority'];
export const allowedMacroModes = () => TASK_MACRO_MODES;
export const macroEligibility = (macro) => macro.mode === 'conditional' ? macro.condition : macro.eligibility;
export function taskUseErrors(use, tasks = [], nodes = {}, path = '', scope = [], sequences = [], allowedModes = TASK_MACRO_MODES) {
  if (use?.builtin === 'adjust_probability_event') return [
    ...eventReferenceErrors(use.event, { event_kind: 'probability' }, scope, `${path}/event`),
    ...operandErrors(use.value, nodes, `${path}/value`, true, scope),
    ...enumArgumentErrors(use.property, probabilityEnumContract('property'), scope, `${path}/property`, true),
    ...enumArgumentErrors(use.operation, probabilityEnumContract('operation'), scope, `${path}/operation`, true),
  ];
  if (isBuiltinFlowTask(use)) return [
    ...conditionErrors(use.condition, nodes, `${path}/condition`, scope),
    ...(!use.condition ? [{ path: `${path}/condition`, key: 'invalidCondition' }] : []),
    ...(!['slot', 'day'].includes(use.scope) ? [{ path: `${path}/scope`, key: 'invalidTakeoverScope' }] : []),
    ...(!['main', 'lower_priority'].includes(use.target) ? [{ path: `${path}/target`, key: 'invalidTakeoverTarget' }] : []),
    ...Object.keys(use).filter((key) => !['builtin', 'condition', 'scope', 'target'].includes(key)).map((field) => ({ path: `${path}/${field}`, key: 'schema_additionalProperties', field })),
  ];
  if (isBuiltinVariableTask(use)) return setVariableErrors(use, nodes, path, scope);
  if (use?.builtin !== undefined) return [{ path: `${path}/builtin`, key: 'invalidBuiltin' }];
  if (use?.task_id !== undefined && use?.task_macro_id !== undefined) return [{ path, key: 'invalidTaskTarget' }];
  const task = use?.task_macro_id !== undefined ? sequences.find((item) => item.id === use.task_macro_id) : tasks.find((item) => item.id === use?.task_id);
  if (!task) return [{ path: `${path}/${use?.task_macro_id !== undefined ? 'task_macro_id' : 'task_id'}`, key: 'chooseTask' }];
  const errors = [];
  if (use?.task_macro_id !== undefined && !allowedModes.includes(task.mode === 'conditional' ? 'sequence' : task.mode)) errors.push({ path: `${path}/task_macro_id`, key: 'macroCallNotAllowed' });
  const parameters = Array.isArray(task.parameters) ? task.parameters.filter((p) => p && typeof p === 'object') : [];
  for (const p of parameters) {
    const value = use.arguments?.[p.id], location = `${path}/arguments/${p.id}`;
    errors.push(...argumentErrors(value, p, nodes, location, scope));
  }
  for (const id of Object.keys(use.arguments ?? {})) if (!parameters.some((p) => p.id === id)) errors.push({ path: `${path}/arguments/${id}`, key: 'unknownParameter' });
  return errors;
}
export function branchOrderErrors(branches, path = '') {
  return !Array.isArray(branches) || branches.filter((branch) => branch?.condition === null).length !== 1 || branches.at(-1)?.condition !== null ? [{ path, key: 'elseLast' }] : [];
}
export function macroEntries(macro) {
  if (macro.mode === 'conditional') return [{ entry: macro, index: 0, path: `/task_macros/${macro.id}` }];
  const key = macro.mode === 'branch' ? 'branches' : macro.mode === 'priority' ? 'candidates' : 'steps';
  return (Array.isArray(macro[key]) ? macro[key] : []).map((entry, index) => ({ entry, index, path: `/task_macros/${macro.id}/${key}/${index}` })).filter(({ entry }) => entry && typeof entry === 'object');
}
export function mapMacroEntries(macro, change) {
  if (macro.mode === 'conditional') return change(macro);
  const key = macro.mode === 'branch' ? 'branches' : macro.mode === 'priority' ? 'candidates' : 'steps';
  return { ...macro, [key]: (macro[key] ?? []).map(change) };
}
export function macroReaches(macros, start, target) {
  const byId = new Map(macros.map((macro) => [macro.id, macro])), pending = [start], seen = new Set();
  while (pending.length) {
    const id = pending.pop(); if (id === target) return true;
    if (seen.has(id) || !byId.has(id)) continue; seen.add(id);
    for (const { entry } of macroEntries(byId.get(id))) if (entry.task?.task_macro_id) pending.push(entry.task.task_macro_id);
  }
  return false;
}
export function taskMacroContentErrors(macros = [], tasks = [], nodes = {}, allMacros = macros) {
  return macros.flatMap((macro) => [
    ...(macro.eligibility == null ? [] : conditionErrors(macro.eligibility, nodes, `/task_macros/${macro.id}/eligibility`, macro.parameters ?? [])),
    ...macroEntries(macro).flatMap(({ entry, path }) => [
    ...(['branch', 'conditional'].includes(macro.mode) ? conditionErrors(entry.condition, nodes, `${path}/condition`, Array.isArray(macro.parameters) ? macro.parameters.filter(Boolean) : []) : []),
    ...(macro.mode === 'priority' && !entry.task?.task_macro_id ? [{ path: `${path}/task`, key: 'conditionalCandidateRequired' }] : []),
    ...taskUseErrors(entry.task, tasks, nodes, `${path}/task`, Array.isArray(macro.parameters) ? macro.parameters.filter(Boolean) : [], allMacros, allowedMacroModes(macro.mode)),
  ])]);
}
export const isPrioritySlot = (slot) => slot.mode === 'priority';
export function slotEntries(slot) {
  const key = isPrioritySlot(slot) ? 'candidates' : 'branches';
  return (Array.isArray(slot[key]) ? slot[key] : []).map((entry, index) => ({ entry, index, path: `/slots/${slot.id}/${key}/${index}` })).filter(({ entry }) => entry && typeof entry === 'object');
}
export function mapSlotEntries(slot, change) {
  const key = isPrioritySlot(slot) ? 'candidates' : 'branches';
  return { ...slot, [key]: (slot[key] ?? []).map(change) };
}
export function slotContentErrors(slots, tasks, nodes, sequences = []) {
  return slots.flatMap((slot) => {
    const seen = new Set(), errors = [];
    for (const { entry, path } of slotEntries(slot)) {
      if (isPrioritySlot(slot)) {
        if (!entry.task?.task_macro_id) errors.push({ path: `${path}/task`, key: 'conditionalCandidateRequired' });
        if (seen.has(entry.id)) errors.push({ path: `${path}/id`, key: 'duplicateStep' }); seen.add(entry.id);
      } else errors.push(...conditionErrors(entry.condition, nodes, `${path}/condition`));
      errors.push(...taskUseErrors(entry.task, tasks, nodes, `${path}/task`, [], sequences));
    }
    return errors;
  });
}
const slotUseErrors = (slots, tasks, nodes, sequences = []) => [...slotContentErrors(slots, tasks, nodes, sequences), ...taskMacroContentErrors(sequences, tasks, nodes)];
export function referencesIn(value, path = '', referenceKind = 'reference') {
  const result = [], pending = [{ value, path }];
  while (pending.length) {
    const { value: item, path: location } = pending.pop();
    if (!item || typeof item !== 'object') continue;
    if (item.type === referenceKind || referenceKind === 'reference' && ['expression_macro_reference', 'variable_reference'].includes(item.type)) result.push({ nodeId: item.type === 'expression_macro_reference' ? item.expression_macro_id : referenceKind === 'reference' ? item.reference_id : item.parameter_id, path: location, key: item.type === 'expression_macro_reference' ? 'expression_macro_id' : referenceKind === 'reference' ? 'reference_id' : 'parameter_id' });
    else if (item.type === 'event_property') pending.push({ value: item.event, path: `${location}/event` });
    else if (item.kind === 'group' && Array.isArray(item.items)) item.items.forEach((entry, i) => pending.push({ value: entry, path: `${location}/items/${i}` }));
    else if (item.type === 'expression' || item.kind === 'comparison') for (const key of ['operand_a','operand_b']) pending.push({ value: item[key], path: `${location}/${key}` });
  }
  return result;
}
export const isComputed = (node) => node?.node_type === 'value' && node.source === 'computed';
export const variableNodes = (nodes) => Object.fromEntries(Object.entries(nodes).filter(([, node]) => !isComputed(node)));
export const expressionNodes = (nodes) => Object.fromEntries(Object.entries(nodes).filter(([, node]) => isComputed(node)));
export const referenceOperand = (id, nodes) => isComputed(nodes[id]) ? { type: 'expression_macro_reference', expression_macro_id: id } : { type: 'reference', reference_id: id };
export function documentNodes(data) {
  const variables = data?.operand_nodes && typeof data.operand_nodes === 'object' && !Array.isArray(data.operand_nodes) ? structuredClone(data.operand_nodes) : {};
  const macros = data?.expression_macros && typeof data.expression_macros === 'object' && !Array.isArray(data.expression_macros) ? data.expression_macros : {};
  for (const [id, macro] of Object.entries(macros)) variables[id] = { ...structuredClone(macro), source: 'computed', node_type: 'value', parent_id: null, order: 0 };
  return variables;
}
export function serializeNodes(nodes) {
  return {
    operand_nodes: Object.fromEntries(Object.entries(variableNodes(nodes)).map(([id, node]) => { const { source, ...value } = node; return [id, { ...structuredClone(value), ...(node.node_type === 'value' ? { read_only: node.read_only ?? false } : {}) }]; })),
    expression_macros: Object.fromEntries(Object.entries(expressionNodes(nodes)).map(([id, node]) => [id, structuredClone({ display_name: node.display_name, ...engineMetadata(node), ...(node.icon === undefined ? {} : { icon: node.icon }), ...(node.scope === undefined ? {} : { scope: node.scope }), value_type: node.value_type, definition: node.definition })])),
  };
}
export function expressionNameErrors(nodes) {
  const errors = [], names = new Set();
  for (const [id, node] of Object.entries(expressionNodes(nodes))) {
    const name = typeof node.display_name === 'string' ? node.display_name.trim() : '';
    if (!name) errors.push({ path: `/expression_macros/${id}/display_name`, key: 'requiredText' });
    if (names.has(name)) errors.push({ path: `/expression_macros/${id}/display_name`, key: 'duplicateExpressionName' }); names.add(name);
  }
  return errors;
}
export function taskOperandRoots(use, path = '') {
  return use?.builtin === 'adjust_probability_event' ? ['event', 'property', 'operation', 'value'].map((key) => ({ value: use[key], path: `${path}/${key}` })) : isBuiltinFlowTask(use) ? [{ value: use.condition, path: `${path}/condition` }] : isBuiltinVariableTask(use) ? ['value', ...(use.builtin === 'increment_variable' ? ['random_amplitude'] : [])].map((key) => ({ value: use[key], path: `${path}/${key}` })) : Object.entries(use?.arguments ?? {}).map(([id, value]) => ({ value, path: `${path}/arguments/${id}` }));
}
export const hasTaskValues = (use) => use?.builtin === 'adjust_probability_event' ? !!use.event || !!use.value : isBuiltinFlowTask(use) ? !!use.condition : isBuiltinVariableTask(use) ? !!use.value || !!use.target_variable_id || !!use.random_amplitude : Object.keys(use?.arguments ?? {}).length > 0;
export function setVariableErrors(use, nodes, path = '', parameters = []) {
  // All fixed variable operations share target validation and reference protection.
  const target = nodes[use.target_variable_id], errors = [];
  if (target?.node_type !== 'value' || isComputed(target)) errors.push({ path: `${path}/target_variable_id`, key: 'invalidWriteTarget' });
  else if (target.read_only) errors.push({ path: `${path}/target_variable_id`, key: 'readonlyTarget' });
  const expectedType = use.builtin === 'increment_variable' ? 'number' : use.builtin === 'toggle_variable' ? 'boolean' : null;
  if (expectedType && target?.value_type && target.value_type !== expectedType) errors.push({ path: `${path}/target_variable_id`, key: 'variableReferenceTypeMismatch' });
  if (['toggle_variable', 'reset_variable'].includes(use.builtin)) return errors;
  errors.push(...operandErrors(use.value, nodes, `${path}/value`, target?.value_type === 'number' || use.builtin === 'increment_variable', parameters));
  if (use.builtin === 'increment_variable' && use.random_amplitude !== undefined) {
    errors.push(...operandErrors(use.random_amplitude, nodes, `${path}/random_amplitude`, true, parameters));
    if (use.random_amplitude?.type === 'constant' && typeof use.random_amplitude.value === 'number' && use.random_amplitude.value < 0) errors.push({ path: `${path}/random_amplitude`, key: 'invalidRandomAmplitude' });
  }
  const type = operandType(use.value, nodes, parameters);
  if (type && target?.value_type && type !== target.value_type) errors.push({ path: `${path}/value`, key: 'writeTypeMismatch' });
  return errors;
}
export function changeReadOnly(nodes, slots, id, readOnly, macros = [], tasks = []) {
  if (nodes[id]?.node_type !== 'value' || isComputed(nodes[id])) throw new Error('invalidWriteTarget');
  const blocked = readOnly ? nodeReferences(slots, id, nodes, new Set(), macros, tasks).filter((ref) => ref.access === 'write') : [];
  return { nodes: blocked.length ? nodes : { ...nodes, [id]: { ...nodes[id], read_only: readOnly } }, blocked };
}
export function definitionRoot(node, id) {
  const key = node?.definition?.kind === 'boolean' ? 'condition' : 'expression';
  return { value: node?.definition?.[key], path: `/expression_macros/${id}/definition/${key}` };
}
export function definitionRoots(node, id) {
  const path = `/expression_macros/${id}/definition`;
  if (node?.definition?.kind !== 'branch') return [definitionRoot(node, id)];
  return (Array.isArray(node.definition.branches) ? node.definition.branches : []).flatMap((branch, index) => {
    const key = branch?.result?.kind === 'boolean' ? 'condition' : 'expression';
    return [{ value: branch?.condition, path: `${path}/branches/${index}/condition` }, { value: branch?.result?.[key], path: `${path}/branches/${index}/result/${key}` }];
  });
}
function taskArgumentReferences(use, root, tasks, macros) {
  const definition = use?.task_macro_id ? macros.find((macro) => macro.id === use.task_macro_id) : tasks.find((task) => task.id === use?.task_id);
  const parameter = definition?.parameters.find((p) => p.id === root.path.split('/').at(-1));
  return referencesIn(root.value, root.path).map((ref) => root.value?.type === 'variable_reference' ? { ...ref, access: parameter?.access === 'read' ? 'read' : 'write' } : ref);
}
export function nodeReferences(slots, id, nodes = {}, excludedOwners = new Set(), sequences = [], tasks = []) {
  const found = [];
  const targets = id instanceof Set ? id : new Set([id]);
  slots.forEach((slot) => slotEntries(slot).forEach(({ entry: branch, index: i, path }) => {
    for (const ref of referencesIn(branch.condition, `${path}/condition`)) if (targets.has(ref.nodeId)) found.push({ ...ref, slot: slot.name, branch: i + 1 });
    for (const root of taskOperandRoots(branch.task, `${path}/task`)) for (const ref of taskArgumentReferences(branch.task, root, tasks, sequences)) if (targets.has(ref.nodeId)) found.push({ ...ref, slot: slot.name, branch: i + 1 });
    if (isBuiltinVariableTask(branch.task) && targets.has(branch.task.target_variable_id)) found.push({ nodeId: branch.task.target_variable_id, path: `${path}/task/target_variable_id`, access: 'write', slot: slot.name, branch: i + 1 });
  }));
  for (const macro of sequences) {
    for (const ref of referencesIn(macro.eligibility, `/task_macros/${macro.id}/eligibility`)) if (targets.has(ref.nodeId)) found.push({ ...ref, macroId: macro.id, macroName: macro.display_name });
    for (const { entry, index, path } of macroEntries(macro)) {
      const refs = [...referencesIn(entry.condition, `${path}/condition`), ...taskOperandRoots(entry.task, `${path}/task`).flatMap((root) => taskArgumentReferences(entry.task, root, tasks, sequences))];
      if (isBuiltinVariableTask(entry.task)) refs.push({ nodeId: entry.task.target_variable_id, path: `${path}/task/target_variable_id`, access: 'write' });
      for (const ref of refs) if (targets.has(ref.nodeId)) found.push({ ...ref, macroId: macro.id, macroName: macro.display_name, ...(macro.mode === 'branch' ? { branch: index + 1 } : { step: index + 1 }) });
    }
  }
  for (const [ownerId, node] of Object.entries(nodes)) {
    if (!isComputed(node) || excludedOwners.has(ownerId)) continue;
    for (const root of definitionRoots(node, ownerId)) for (const ref of referencesIn(root.value, root.path)) if (targets.has(ref.nodeId)) found.push({ ...ref, ownerId, computedName: nodePath(nodes, ownerId) });
  }
  return found;
}
export const subtreeReferences = (nodes, slots, id, sequences = [], tasks = []) => { const ids = subtreeIds(nodes, id); return nodeReferences(slots, ids, nodes, ids, sequences, tasks); };

export function computedErrors(nodes = {}) {
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return [];
  const errors = expressionNameErrors(nodes), edges = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    if (!isComputed(node)) continue;
    const path = `/expression_macros/${id}/definition`;
    function checkScalar(definition, location, lazy = false) {
      if (!['number', 'boolean'].includes(definition?.kind)) { errors.push({ path: location, key: 'invalidDefinition' }); return; }
      if (node.value_type !== definition.kind) errors.push({ path: location, key: 'computedResultMismatch' });
      const found = definition.kind === 'number' ? operandErrors(definition.expression, nodes, `${location}/expression`, true) : !definition.condition ? [{ path: `${location}/condition`, key: 'invalidCondition' }] : conditionErrors(definition.condition, nodes, `${location}/condition`);
      errors.push(...found.filter((error) => !lazy || error.key !== 'divisionByZero'));
    }
    if (node.definition?.kind === 'branch') {
      errors.push(...branchOrderErrors(node.definition.branches, `${path}/branches`));
      for (const [index, branch] of (Array.isArray(node.definition.branches) ? node.definition.branches : []).entries()) {
        if (branch?.condition === undefined) errors.push({ path: `${path}/branches/${index}/condition`, key: 'invalidCondition' });
        else errors.push(...conditionErrors(branch.condition, nodes, `${path}/branches/${index}/condition`).filter((error) => error.key !== 'divisionByZero'));
        checkScalar(branch?.result, `${path}/branches/${index}/result`, true);
      }
    } else checkScalar(node.definition, path);
    const refs = definitionRoots(node, id).flatMap((root) => referencesIn(root.value, root.path));
    if (expressionScope(node) === 'environment') for (const ref of refs) if (nodes[ref.nodeId] && nodeScope(nodes[ref.nodeId]) !== 'environment') errors.push({ path: `${ref.path}/${ref.key}`, key: 'environmentExpressionDependency' });
    edges.set(id, refs.filter((ref) => isComputed(nodes[ref.nodeId])));
  }
  // Parent hierarchy and expression dependencies are two independent graphs.
  const colors = new Map();
  for (const start of edges.keys()) {
    if (colors.has(start)) continue;
    const stack = [{ id: start, index: 0 }]; colors.set(start, 1);
    while (stack.length) {
      const frame = stack.at(-1), links = edges.get(frame.id) ?? [];
      if (frame.index >= links.length) { colors.set(frame.id, 2); stack.pop(); continue; }
      const ref = links[frame.index++];
      if (colors.get(ref.nodeId) === 1) errors.push({ path: `${ref.path}/${ref.key}`, key: 'computedCycle', field: stack.slice(stack.findIndex((entry) => entry.id === ref.nodeId)).map((entry) => nodePath(nodes, entry.id)).concat(nodePath(nodes, ref.nodeId)).join(' → ') });
      else if (!colors.has(ref.nodeId)) { colors.set(ref.nodeId, 1); stack.push({ id: ref.nodeId, index: 0 }); }
    }
  }
  return errors;
}
export function defaultDefinition(kind) {
  return kind === 'number' ? { kind, expression: { type: 'constant', value: 0 } } : { kind: 'boolean', condition: { kind: 'group', mode: 'ALL', items: [{ kind: 'comparison', operand_a: { type: 'constant', value: 0 }, comparator: '==', operand_b: { type: 'constant', value: 0 } }] } };
}
export function formatComputedDefinition(definition, nodes, missing = '?') {
  if (definition?.kind === 'branch') return (definition.branches ?? []).map((branch, index) => `${branch.condition === null ? 'ELSE' : index === 0 ? 'IF' : 'ELSE IF'}${branch.condition === null ? '' : ` ${formatCondition(branch.condition, nodes, missing)}`} → ${formatComputedDefinition(branch.result, nodes, missing)}`).join('\n');
  return definition?.kind === 'number' ? formatOperand(definition.expression, nodes, missing) : formatCondition(definition?.condition, nodes, missing);
}
export function changeComputedMode(definition, mode, keepIndex = null) {
  if (mode === 'branch') return definition.kind === 'branch' ? structuredClone(definition) : { kind: 'branch', branches: [{ condition: null, result: structuredClone(definition) }] };
  if (definition.kind !== 'branch') return structuredClone(definition);
  const index = definition.branches.length === 1 ? 0 : keepIndex;
  if (!Number.isInteger(index) || !definition.branches[index]) throw new Error('chooseComputedResult');
  return structuredClone(definition.branches[index].result);
}
export function formatCondition(condition, nodes, missing = '?', parameters = [], parameterPrefix = 'Parameters') {
  if (!condition) return missing;
  if (condition.kind === 'group') return `${condition.mode}(${(condition.items ?? []).map((item) => formatCondition(item, nodes, missing, parameters, parameterPrefix)).join(', ')})`;
  return `${formatOperand(condition.operand_a, nodes, missing, parameters, parameterPrefix)} ${condition.comparator} ${formatOperand(condition.operand_b, nodes, missing, parameters, parameterPrefix)}`;
}
const referenceAffected = (ref, error) => ref.access === 'write' ? error.path.startsWith(ref.path.replace(/\/target_variable_id$/, '')) : ref.path.startsWith(error.path.replace(/\/comparator$/, ''));
function affectedErrors(nodes, slots, id, tasks = [], sequences = []) {
  const refs = nodeReferences(slots, id, nodes, new Set(), sequences);
  const errors = [...computedErrors(nodes), ...slotUseErrors(slots, tasks, nodes, sequences), ...slots.flatMap((slot) => slot.branches.flatMap((branch, i) => conditionErrors(branch.condition, nodes, `/slots/${slot.id}/branches/${i}/condition`)))];
  return { refs, errors: errors.filter((error) => refs.some((ref) => referenceAffected(ref, error))) };
}
export function applyComputedDefinition(nodes, slots, id, definition, tasks = [], sequences = [], valueType = definition.kind === 'branch' ? nodes[id]?.value_type : definition.kind) {
  if (!nodes[id] || !isComputed(nodes[id])) throw new Error('invalidDefinition');
  const next = { ...nodes, [id]: { ...nodes[id], value_type: valueType, definition: structuredClone(definition) } };
  const errors = [...computedErrors(next), ...affectedErrors(next, slots, id, tasks, sequences).errors];
  return { nodes: errors.length ? nodes : next, errors: errors.filter((error, i) => errors.findIndex((other) => other.path === error.path && other.key === error.key) === i) };
}
export function treeErrors(nodes) {
  const initialErrors = Object.entries(variableNodes(nodes)).filter(([, n]) => n.node_type === 'value' && (typeof initialValue(n) !== n.value_type || n.value_type === 'number' && !Number.isFinite(initialValue(n)))).map(([id]) => ({ path: `/operand_nodes/${id}/initial_value`, key: 'invalidInitialValue' }));
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return [];
  const errors = [...initialErrors], siblings = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object' || isComputed(node)) continue;
    const path = `/operand_nodes/${id}`;
    if (node.node_type === 'value') errors.push(...variableBoundsErrors(node, path, initialValue(node)));
    if (typeof node.display_name !== 'string' || !node.display_name.trim()) errors.push({ path: `${path}/display_name`, key: 'requiredText' });
    if (node.parent_id !== null && (nodes[node.parent_id]?.node_type !== 'group' || variableScope(nodes[node.parent_id]) !== variableScope(node))) errors.push({ path: `${path}/parent_id`, key: 'invalidParent' });
    const list = siblings.get(`${variableScope(node)}:${node.parent_id}`) ?? []; list.push([id, node]); siblings.set(`${variableScope(node)}:${node.parent_id}`, list);
  }
  // Iterative parent walks avoid stack overflow for deeply nested trees.
  const done = new Set();
  for (const id of Object.keys(nodes)) {
    let current = id; const seen = new Set();
    while (nodes[current] && !done.has(current)) {
      if (seen.has(current)) { errors.push({ path: `/operand_nodes/${current}/parent_id`, key: 'cyclicParent' }); break; }
      seen.add(current); current = nodes[current]?.parent_id;
    }
    for (const key of seen) done.add(key);
  }
  for (const list of siblings.values()) {
    list.sort((a, b) => a[1].order - b[1].order);
    const names = new Map();
    list.forEach(([id, node], i) => {
      if (node.order !== i) errors.push({ path: `/operand_nodes/${id}/order`, key: 'invalidOrder' });
      const name = typeof node.display_name === 'string' ? node.display_name.trim() : '';
      if (names.has(name)) {
        errors.push({ path: `/operand_nodes/${id}/display_name`, key: 'duplicateNodeName' });
        errors.push({ path: `/operand_nodes/${names.get(name)}/display_name`, key: 'duplicateNodeName' });
      }
      names.set(name, id);
    });
  }
  const paths = new Map();
  for (const [id, node] of Object.entries(variableNodes(nodes))) {
    const path = nodePath(nodes, id).trim();
    if (paths.has(path) && variableScope(nodes[paths.get(path)]) !== variableScope(node)) {
      for (const key of [id, paths.get(path)]) errors.push({ path: `/operand_nodes/${key}/display_name`, key: 'duplicateNodeName' });
    }
    paths.set(path, id);
  }
  return errors;
}
function uniqueName(nodes, parent, base) {
  const names = new Set(childrenOf(nodes, parent).map(([, n]) => n.display_name.trim()));
  let name = base, number = 2;
  while (names.has(name)) name = `${base} ${number++}`;
  return name;
}
export function addOperandNode(nodes, selected, type, name, scope = variableScope(nodes[selected])) {
  const parent = nodes[selected]?.node_type === 'group' && variableScope(nodes[selected]) === scope ? selected : null;
  const id = crypto.randomUUID();
  return { id, nodes: { ...nodes, [id]: { display_name: uniqueName(nodes, parent, name), parent_id: parent, order: childrenOf(nodes, parent, scope).length, scope, node_type: type, ...(type === 'value' ? { read_only: false, value_type: 'number', initial_value: 0 } : {}) } } };
}
export function addComputedNode(nodes, selected, name, scope = 'application') {
  const id = crypto.randomUUID(), names = new Set(Object.values(nodes).filter(isComputed).map((n) => n.display_name));
  let unique = name, index = 2; while (names.has(unique)) unique = `${name} ${index++}`;
  return { id, nodes: { ...nodes, [id]: { display_name: unique, parent_id: null, order: 0, node_type: 'value', source: 'computed', ...(scope === 'environment' ? { scope } : {}), value_type: 'number', definition: defaultDefinition('number') } } };
}
function orderSiblings(nodes, parent, ids) { ids.forEach((id, order) => { nodes[id] = { ...nodes[id], parent_id: parent, order }; }); }
export function moveOperandNode(nodes, id, parent, position) {
  if (!nodes[id] || parent !== null && (nodes[parent]?.node_type !== 'group' || variableScope(nodes[parent]) !== variableScope(nodes[id]) || subtreeIds(nodes, id).has(parent))) throw new Error('invalidParent');
  if (!Number.isInteger(position) || position < 0) throw new Error('invalidOrder');
  if (parent !== nodes[id].parent_id && childrenOf(nodes, parent, variableScope(nodes[id])).some(([key, n]) => key !== id && n.display_name.trim() === nodes[id].display_name.trim())) throw new Error('duplicateNodeName');
  const next = { ...nodes }, previous = nodes[id].parent_id;
  const targets = childrenOf(nodes, parent, variableScope(nodes[id])).map(([key]) => key).filter((key) => key !== id);
  if (position > targets.length) throw new Error('invalidOrder');
  targets.splice(position, 0, id);
  if (parent !== previous) orderSiblings(next, previous, childrenOf(nodes, previous, variableScope(nodes[id])).map(([key]) => key).filter((key) => key !== id));
  orderSiblings(next, parent, targets);
  return next;
}
export function duplicateOperandSubtree(nodes, id) {
  if (!nodes[id]) throw new Error('missingOperand');
  if (isComputed(nodes[id])) { const result = addComputedNode(nodes, null, `${nodes[id].display_name} (\u526f\u672c)`); result.nodes[result.id] = { ...clearEngineKey(nodes[id]), display_name: result.nodes[result.id].display_name }; return result; }
  const ids = subtreeIds(nodes, id), mapping = new Map([...ids].map((key) => [key, crypto.randomUUID()]));
  const next = { ...nodes }, source = nodes[id];
  const names = new Set(childrenOf(nodes, source.parent_id, variableScope(source)).map(([, n]) => n.display_name.trim()));
  let name = `${source.display_name} (副本)`, number = 2;
  while (names.has(name)) name = `${source.display_name} (副本 ${number++})`;
  for (const key of ids) {
    const copied = { ...clearEngineKey(nodes[key]), parent_id: key === id ? source.parent_id : mapping.get(nodes[key].parent_id), ...(key === id ? { display_name: name } : {}) };
    if (isComputed(copied)) {
      const root = definitionRoot(copied, mapping.get(key));
      for (const ref of referencesIn(root.value)) if (mapping.has(ref.nodeId)) operandAt(root.value, ref.path.split('/').filter(Boolean)).reference_id = mapping.get(ref.nodeId);
    }
    next[mapping.get(key)] = copied;
  }
  const siblings = childrenOf(nodes, source.parent_id, variableScope(source)).map(([key]) => key);
  siblings.splice(siblings.indexOf(id) + 1, 0, mapping.get(id)); orderSiblings(next, source.parent_id, siblings);
  return { id: mapping.get(id), nodes: next };
}
export function deleteOperandNode(nodes, slots, id, sequences = [], tasks = []) {
  if (!nodes[id]) throw new Error('missingOperand');
  const ids = subtreeIds(nodes, id);
  if (nodeReferences(slots, ids, nodes, ids, sequences, tasks).length) throw new Error('nodeInUse');
  const next = { ...nodes };
  for (const key of ids) delete next[key];
  if (!isComputed(nodes[id])) orderSiblings(next, nodes[id].parent_id, childrenOf(next, nodes[id].parent_id, variableScope(nodes[id])).map(([key]) => key));
  return next;
}
export function changeOperandType(nodes, slots, id, type, tasks = [], sequences = []) {
  if (nodes[id]?.node_type !== 'value' || !['number', 'string', 'boolean'].includes(type)) throw new Error('missingOperand');
  if (isComputed(nodes[id])) throw new Error('invalidDefinition');
  const next = { ...nodes, [id]: { ...nodes[id], value_type: type, initial_value: type === nodes[id].value_type ? initialValue(nodes[id]) : defaultInitialValue(type) } };
  if (type !== 'number') { delete next[id].min_value; delete next[id].max_value; delete next[id].integer_only; }
  const affected = nodeReferences(slots, id, next, new Set(), sequences, tasks);
  const errors = [...computedErrors(next), ...slotUseErrors(slots, tasks, next, sequences), ...slots.flatMap((slot) => slot.branches.flatMap((branch, i) => conditionErrors(branch.condition, next, `/slots/${slot.id}/branches/${i}/condition`)))];
  const blocked = affected.filter((ref) => errors.some((e) => referenceAffected(ref, e)));
  return { nodes: blocked.length ? nodes : next, blocked };
}
