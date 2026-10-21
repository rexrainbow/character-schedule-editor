import { normalizeSymbols, namedData } from './symbols.js';
import { numberConstraints, variableBoundsErrors } from './variableBounds.js';
import { normalizeTaskMacro } from './taskMacroModel.js';
import { builtinVariableDefinition, builtinTaskDefinition, isBuiltinVariableTask, isBuiltinFlowTask } from './builtinTaskModel.js';
import { translator } from '../i18n/index.js';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schemas/runtime.schema.json' with { type: 'json' };
import { compileProject } from './model.js';
import { initialValue, variableScope, isComputed, childrenOf, isPrioritySlot } from './operandModel.js';
import { engineKeyEntries, engineKeyConflicts } from './engineKeyModel.js';
import { WEEKDAYS } from './scheduleConstants.js';
import { dayEventsToData } from './dayEvents.js';
import { eventGroupsToData } from './sequenceEvents.js';
import { resolveDraftEnums, enumDefinitionErrors } from './enumParameters.js';

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const keyOf = (item) => item.symbol?.trim() ?? '';
const metadata = (item) => ({ display_name: item.display_name ?? item.name, ...(keyOf(item) ? { symbol: keyOf(item) } : {}) });
export function validateRuntimeDocument(data) {
  validate(data);
  const errors = (validate.errors ?? []).map((error) => ({ path: error.instancePath || '/', key: `schema_${error.keyword}`, field: error.params.missingProperty ?? error.params.additionalProperty ?? '' }));
  if (errors.length) return errors;
  function visit(items, path) { items.forEach((node, index) => { const location = `${path}/${index}`; if (node.kind === 'group') visit(node.children, `${location}/children`); else errors.push(...variableBoundsErrors(node, location, node.initial_value)); }); }
  visit(data.environment_variables, '/environment_variables'); visit(data.application_variables, '/application_variables');
  for (const [id, definition] of Object.entries(data.enum_definitions)) errors.push(...enumDefinitionErrors({ type: 'enum', options: definition.options }, `/enum_definitions/${id}`));
  function checkEnums(value, path) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'enum') {
      if (value.enum_id !== undefined) {
        const definition = data.enum_definitions[value.enum_id];
        if (!definition) errors.push({ path: `${path}/enum_id`, key: 'missingEnumDefinition' });
        else if (path.startsWith('/environment_requirements/tasks/') && definition.scope !== 'environment') errors.push({ path: `${path}/enum_id`, key: 'enumEnvironmentOnly' });
      } else errors.push(...enumDefinitionErrors(value, path));
    }
    for (const [key, child] of Object.entries(value)) checkEnums(child, `${path}/${key}`);
  }
  checkEnums(data.task_macros, '/task_macros'); checkEnums(data.environment_requirements.tasks, '/environment_requirements/tasks');
  return errors;
}

export function compileRuntime(draft, t = translator('en')) {
  draft = normalizeSymbols(draft);
  const project = compileProject(draft);
  if (project.errors.length) return { data: null, errors: project.errors };
  draft = resolveDraftEnums(draft);
  const errors = [], nodes = draft.operandNodes, requirements = new Map(), tasks = new Map();
  const entries = engineKeyEntries(draft);
  const projectCollections = { builtinTasks: 'builtin_tasks', operands: 'operand_nodes', expressions: 'expression_macros', taskMacros: 'task_macros', days: 'day_schedules', weeks: 'week_schedules', sequences: 'week_sequences' };
  for (const entry of entries) if (engineKeyConflicts(entries, entry.kind, entry.id, entry.key).length) errors.push({ path: entry.path ?? `/${projectCollections[entry.kind] ?? entry.kind}/${entry.id}/symbol`, key: 'runtimeDuplicateKey' });

  function variable(id, access = 'read') {
    const node = nodes[id];
    if (variableScope(node) === 'application') return { type: 'reference', reference_id: id };
    const symbol = keyOf(node);
    // All environment leaf keys are checked once, including unused definitions.
    const previous = requirements.get(id);
    requirements.set(id, { ...metadata(node), symbol, value_type: node.value_type, read_only: node.read_only ?? false, ...(node.integer_only === undefined ? {} : { integer_only: node.integer_only }), access: previous && previous.access !== access ? 'read_write' : access });
    return { type: 'environment_reference', symbol };
  }
  function operand(value) {
    if (value.type === 'reference') return variable(value.reference_id);
    if (value.type === 'expression') return { type: 'expression', operator: value.operator, operand_a: operand(value.operand_a), operand_b: operand(value.operand_b) };
    return structuredClone(value);
  }
  function condition(value) {
    if (value === null) return null;
    return value.kind === 'group' ? { kind: 'group', mode: value.mode, items: value.items.map(condition) } : { kind: 'comparison', comparator: value.comparator, operand_a: operand(value.operand_a), operand_b: operand(value.operand_b) };
  }
  function computedDefinition(value) {
    if (value.kind === 'branch') return { kind: 'branch', branches: value.branches.map((branch) => ({ condition: condition(branch.condition), result: computedDefinition(branch.result) })) };
    return value.kind === 'number' ? { kind: 'number', expression: operand(value.expression) } : { kind: 'boolean', condition: condition(value.condition) };
  }
  function argument(value, parameter) {
    if (parameter?.type !== 'variable_reference' || value.type === 'parameter_reference') return operand(value);
    const reference = variable(value.reference_id, parameter.access);
    return { type: 'variable_reference', ...(reference.symbol ? { symbol: reference.symbol } : { reference_id: reference.reference_id }) };
  }
  const contract = (p) => ({ ...(p.type === 'variable_reference' ? { value_type: p.value_type, access: p.access } : p.type === 'event_reference' ? { event_kind: p.event_kind ?? 'any' } : p.type === 'enum' ? p.enum_id !== undefined ? { enum_id: p.enum_id } : { options: structuredClone(p.options) } : {}) });
  function task(value) {
    if (value.builtin === 'schedule_event') {
      const definition = builtinTaskDefinition(value.builtin, draft.builtinTasks, t), symbol = keyOf(definition);
      if (!symbol) errors.push({ path: '/builtin_tasks/schedule_event/symbol', key: 'runtimeMissingKey' });
      tasks.set(definition.id, { ...metadata(definition), symbol, parameters: definition.parameters.map((p) => ({ symbol: p.symbol ?? p.id, display_name: p.display_name, type: p.type, ...contract(p) })) });
      return { task_key: symbol, flow_control: 'schedule_event', display_name: value.display_name.trim() || draft.days.find((day) => day.id === (value.day_schedule_id ?? value.day_source?.candidates[0]?.day_schedule_id))?.name || '', date: { ...value.date, offset: operand(value.date.offset) }, ...(value.day_source ? { day_source: structuredClone(value.day_source) } : { day_schedule_id: value.day_schedule_id }), execution_mode: value.execution_mode, priority: value.priority };
    }
    if (value.builtin === 'adjust_probability_event') {
      const definition = builtinTaskDefinition(value.builtin, draft.builtinTasks, t), symbol = keyOf(definition);
      if (!symbol) errors.push({ path: `/builtin_tasks/${value.builtin}/symbol`, key: 'runtimeMissingKey' });
      tasks.set(definition.id, { ...metadata(definition), symbol, parameters: definition.parameters.map((p) => ({ symbol: p.symbol ?? p.id, display_name: p.display_name, type: p.type, ...contract(p) })) });
      return { task_key: symbol, event_operation: 'adjust_probability', event: structuredClone(value.event), property: value.property, operation: value.operation, value: operand(value.value) };
    }
    if (isBuiltinFlowTask(value)) {
      const definition = builtinTaskDefinition(value.builtin, draft.builtinTasks, t), symbol = keyOf(definition);
      if (!symbol) errors.push({ path: `/builtin_tasks/${value.builtin}/symbol`, key: 'runtimeMissingKey' });
      tasks.set(definition.id, { ...metadata(definition), symbol, parameters: definition.parameters.map((p) => ({ symbol: p.symbol ?? p.id, display_name: p.display_name, type: p.type })) });
      return { task_key: symbol, flow_control: 'release_slot', condition: condition(value.condition ?? null) };
    }
    if (isBuiltinVariableTask(value)) {
      const definition = builtinVariableDefinition(value.builtin, draft.builtinTasks, t), symbol = keyOf(definition);
      if (!symbol) errors.push({ path: `/builtin_tasks/${value.builtin}/symbol`, key: 'runtimeMissingKey' });
      tasks.set(definition.id, { ...metadata(definition), symbol, parameters: definition.parameters.map((p) => ({ symbol: p.symbol ?? p.id, display_name: p.display_name, type: p.type, ...contract(p) })) });
      return { task_key: symbol, target: variable(value.target_variable_id, definition.parameters[0].access), ...(definition.parameters.some((p) => p.id === 'value') ? { value: operand(value.value) } : {}), ...(value.builtin === 'increment_variable' && value.random_amplitude !== undefined ? { random_amplitude: operand(value.random_amplitude) } : {}) };
    }
    if (value.task_macro_id) { const definition = draft.taskMacros.find((item) => item.id === value.task_macro_id); return { task_macro_id: value.task_macro_id, arguments: Object.fromEntries(definition.parameters.map((p) => [p.id, argument(value.arguments[p.id], p)])) }; }
    const definition = draft.tasks.find((item) => item.id === value.task_id), symbol = keyOf(definition);
    if (!symbol) errors.push({ path: `/tasks/${definition.id}/symbol`, key: 'runtimeMissingKey' });
    // Environment parameters bind by declared position, independently of editor UUIDs.
    tasks.set(definition.id, { ...metadata(definition), symbol, parameters: definition.parameters.map((p) => ({ symbol: p.symbol ?? p.id, display_name: p.display_name, type: p.type, ...contract(p) })) });
    return { task_key: symbol, arguments: definition.parameters.map((p) => argument(value.arguments[p.id], p)) };
  }
  const branches = (items) => items.map((item) => ({ condition: condition(item.condition), task: task(item.task) }));
  function tree(parent = null, scope = 'application') {
    return childrenOf(nodes, parent, scope).map(([id, node]) => ({ id, ...metadata(node), ...(node.node_type === 'group' ? { kind: 'group', children: tree(id, scope) } : { kind: 'value', value_type: node.value_type, read_only: node.read_only ?? false, initial_value: initialValue(node), ...numberConstraints(node) }) }));
  }
  for (const [id, node] of Object.entries(nodes)) if (!isComputed(node) && node.node_type === 'value' && variableScope(node) === 'environment' && !keyOf(node)) errors.push({ path: `/operand_nodes/${id}/symbol`, key: 'runtimeMissingKey' });
  const day = (item) => ({ ...metadata(item), slot_ids: [...item.slotIds], tags: [...(item.tags ?? [])], ...dayEventsToData(item), ...(item.slotReleases === undefined ? {} : { slot_releases: item.slotReleases.map((value) => value ? task(value) : null) }) });
  let data = {
    enum_definitions: Object.fromEntries(Object.entries(draft.enumNodes ?? {}).filter(([, node]) => node.node_type === 'enum').map(([id, node]) => [id, { ...metadata(node), scope: node.scope, options: structuredClone(node.options) }])),
    format_version: 1, display_name: draft.project.name,
    settings: { slots_per_day: draft.project.settings.slots_per_day },
    environment_requirements: { variables: [], tasks: [] },
    environment_variables: tree(null, 'environment'),
    application_variables: tree(),
    expression_macros: Object.fromEntries(Object.entries(nodes).filter(([, node]) => isComputed(node)).map(([id, node]) => [id, { ...metadata(node), value_type: node.value_type, definition: computedDefinition(node.definition) }])),
    task_macros: Object.fromEntries(draft.taskMacros.map((value) => { const macro = normalizeTaskMacro(value); return [macro.id, { ...metadata(macro), parameters: macro.parameters.map((p) => ({ id: p.id, symbol: p.symbol ?? p.id, display_name: p.display_name, type: p.type, ...contract(p) })), mode: macro.mode, ...(macro.eligibility == null ? {} : { eligibility: condition(macro.eligibility) }), ...(macro.mode === 'sequence' ? { steps: macro.steps.map((step) => task(step.task)) } : macro.mode === 'branch' ? { branches: branches(macro.branches) } : { candidates: macro.candidates.map((entry) => task(entry.task)) }) }]; })),
    slots: Object.fromEntries(draft.slots.map((slot) => [slot.id, { ...metadata(slot), ...(isPrioritySlot(slot) ? { mode: 'priority', candidates: slot.candidates.map((entry) => task(entry.task)) } : { branches: branches(slot.branches) }) }])),
    days: Object.fromEntries(draft.days.filter((item) => item.scope !== 'week_private').map((item) => [item.id, day(item)])),
    weeks: Object.fromEntries(draft.weeks.map((week) => [week.id, { ...metadata(week), days: Object.fromEntries(WEEKDAYS.map((weekday) => {
      const id = week.days[weekday], item = draft.days.find((item) => item.id === id);
      return [weekday, item?.scope === 'week_private' ? day(item) : id];
    })) }])),
    sequences: Object.fromEntries(draft.sequences.map((sequence) => [sequence.id, { ...metadata(sequence), start_weekday: sequence.startWeekday ?? 'mon', end_weekday: sequence.endWeekday ?? 'sun', ...(sequence.eventGroups === undefined ? {} : { event_groups: eventGroupsToData(sequence.eventGroups, draft.days, true) }), entries: sequence.rows.map((row) => ({ week_id: row.weekId, day_overrides: { ...row.overrides } })) }])),
    exports: {},
  };
  data.environment_requirements = { variables: [...requirements.values()], tasks: [...tasks.values()], ...(draft.environment ? { environment: structuredClone(draft.environment) } : {}) };
  const exportEntries = [];
  for (const entry of entries) {
    if (!keyOf({ symbol: entry.key })) continue;
    if (entry.kind === 'enums' && draft.enumNodes[entry.id].node_type !== 'enum') continue;
    if (entry.kind === 'builtinTasks' || entry.kind === 'tasks' || entry.kind === 'operands' && variableScope(nodes[entry.id]) !== 'application') continue;
    if (entry.kind === 'days' && draft.days.find((day) => day.id === entry.id)?.scope === 'week_private') continue;
    exportEntries.push([`${entry.kind}.${entry.key.trim()}`, { kind: entry.kind, id: entry.id, ...(entry.kind === 'eventGroups' ? { sequence_id: entry.ownerId } : {}) }]);
  }
  data.exports = Object.fromEntries(exportEntries);
  data = namedData(data);
  const stripDescriptions = (value) => { if (value && typeof value === 'object') { delete value.description; Object.values(value).forEach(stripDescriptions); } };
  stripDescriptions(data);
  if (!errors.length) errors.push(...validateRuntimeDocument(data));
  return { data: errors.length ? null : data, errors };
}
