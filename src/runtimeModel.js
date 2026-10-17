import { builtinVariableDefinition, isBuiltinVariableTask } from './builtinTasks.js';
import { translator } from './i18n.js';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './runtime.schema.json' with { type: 'json' };
import { compileProject } from './model.js';
import { initialValue, variableScope, isComputed, childrenOf } from './operandModel.js';
import { engineKeyEntries, engineKeyConflicts } from './engineKeyModel.js';
import { WEEKDAYS } from './scheduleConstants.js';

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const keyOf = (item) => item.engine_key?.trim() ?? '';
const metadata = (item) => ({ display_name: item.display_name ?? item.name, ...(keyOf(item) ? { engine_key: keyOf(item) } : {}) });
export function validateRuntimeDocument(data) {
  validate(data);
  return (validate.errors ?? []).map((error) => ({ path: error.instancePath || '/', key: `schema_${error.keyword}`, field: error.params.missingProperty ?? error.params.additionalProperty ?? '' }));
}

export function compileRuntime(draft, t = translator('en')) {
  const project = compileProject(draft);
  if (project.errors.length) return { data: null, errors: project.errors };
  const errors = [], nodes = draft.operandNodes, requirements = new Map(), tasks = new Map();
  const entries = engineKeyEntries(draft);
  const projectCollections = { builtinTasks: 'builtin_tasks', operands: 'operand_nodes', expressions: 'expression_macros', taskMacros: 'task_macros', days: 'day_schedules', weeks: 'week_schedules', sequences: 'week_sequences' };
  for (const entry of entries) if (engineKeyConflicts(entries, entry.kind, entry.id, entry.key).length) errors.push({ path: `/${projectCollections[entry.kind] ?? entry.kind}/${entry.id}/engine_key`, key: 'runtimeDuplicateKey' });

  function variable(id, access = 'read') {
    const node = nodes[id];
    if (variableScope(node) === 'application') return { type: 'reference', reference_id: id };
    const engine_key = keyOf(node);
    // All environment leaf keys are checked once, including unused definitions.
    const previous = requirements.get(id);
    requirements.set(id, { ...metadata(node), engine_key, value_type: node.value_type, read_only: node.read_only ?? false, access: previous && previous.access !== access ? 'read_write' : access });
    return { type: 'environment_reference', engine_key };
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
    return { type: 'variable_reference', ...(reference.engine_key ? { engine_key: reference.engine_key } : { reference_id: reference.reference_id }) };
  }
  const contract = (p) => ({ ...(p.type === 'variable_reference' ? { value_type: p.value_type, access: p.access } : {}) });
  function task(value) {
    if (isBuiltinVariableTask(value)) {
      const definition = builtinVariableDefinition(value.builtin, draft.builtinTasks, t), engine_key = keyOf(definition);
      if (!engine_key) errors.push({ path: `/builtin_tasks/${value.builtin}/engine_key`, key: 'runtimeMissingKey' });
      tasks.set(definition.id, { ...metadata(definition), engine_key, parameters: definition.parameters.map((p) => ({ display_name: p.display_name, type: p.type, ...contract(p) })) });
      return { task_key: engine_key, target: variable(value.target_variable_id, definition.parameters[0].access), ...(definition.parameters.length === 2 ? { value: operand(value.value) } : {}) };
    }
    if (value.task_macro_id) { const definition = draft.taskMacros.find((item) => item.id === value.task_macro_id); return { task_macro_id: value.task_macro_id, arguments: Object.fromEntries(definition.parameters.map((p) => [p.id, argument(value.arguments[p.id], p)])) }; }
    const definition = draft.tasks.find((item) => item.id === value.task_id), engine_key = keyOf(definition);
    if (!engine_key) errors.push({ path: `/tasks/${definition.id}/engine_key`, key: 'runtimeMissingKey' });
    // Environment parameters bind by declared position, independently of editor UUIDs.
    tasks.set(definition.id, { ...metadata(definition), engine_key, parameters: definition.parameters.map((p) => ({ display_name: p.display_name, type: p.type, ...contract(p) })) });
    return { task_key: engine_key, arguments: definition.parameters.map((p) => argument(value.arguments[p.id], p)) };
  }
  const branches = (items) => items.map((item) => ({ condition: condition(item.condition), task: task(item.task) }));
  function tree(parent = null, scope = 'application') {
    return childrenOf(nodes, parent, scope).map(([id, node]) => ({ id, ...metadata(node), ...(node.node_type === 'group' ? { kind: 'group', children: tree(id, scope) } : { kind: 'value', value_type: node.value_type, read_only: node.read_only ?? false, initial_value: initialValue(node) }) }));
  }
  for (const [id, node] of Object.entries(nodes)) if (!isComputed(node) && node.node_type === 'value' && variableScope(node) === 'environment' && !keyOf(node)) errors.push({ path: `/operand_nodes/${id}/engine_key`, key: 'runtimeMissingKey' });
  const day = (item) => ({ ...metadata(item), slot_ids: [...item.slotIds] });
  const data = {
    format_version: 1, display_name: draft.project.name,
    settings: { slots_per_day: draft.project.settings.slots_per_day },
    environment_requirements: { variables: [], tasks: [] },
    environment_variables: tree(null, 'environment'),
    application_variables: tree(),
    expression_macros: Object.fromEntries(Object.entries(nodes).filter(([, node]) => isComputed(node)).map(([id, node]) => [id, { ...metadata(node), value_type: node.value_type, definition: computedDefinition(node.definition) }])),
    task_macros: Object.fromEntries(draft.taskMacros.map((macro) => [macro.id, { ...metadata(macro), parameters: macro.parameters.map((p) => ({ id: p.id, display_name: p.display_name, type: p.type, ...contract(p) })), mode: macro.mode, ...(macro.mode === 'sequence' ? { steps: macro.steps.map((step) => task(step.task)) } : { branches: branches(macro.branches) }) }])),
    slots: Object.fromEntries(draft.slots.map((slot) => [slot.id, { ...metadata(slot), branches: branches(slot.branches) }])),
    days: Object.fromEntries(draft.days.filter((item) => item.scope !== 'week_private').map((item) => [item.id, day(item)])),
    weeks: Object.fromEntries(draft.weeks.map((week) => [week.id, { ...metadata(week), days: Object.fromEntries(WEEKDAYS.map((weekday) => {
      const id = week.days[weekday], item = draft.days.find((item) => item.id === id);
      return [weekday, item?.scope === 'week_private' ? day(item) : id];
    })) }])),
    sequences: Object.fromEntries(draft.sequences.map((sequence) => [sequence.id, { ...metadata(sequence), entries: sequence.rows.map((row) => ({ week_id: row.weekId, day_overrides: { ...row.overrides } })) }])),
    exports: {},
  };
  data.environment_requirements = { variables: [...requirements.values()], tasks: [...tasks.values()], ...(draft.environment ? { environment: structuredClone(draft.environment) } : {}) };
  const exportEntries = [];
  for (const entry of entries) {
    if (!keyOf({ engine_key: entry.key })) continue;
    if (entry.kind === 'builtinTasks' || entry.kind === 'tasks' || entry.kind === 'operands' && variableScope(nodes[entry.id]) !== 'application') continue;
    if (entry.kind === 'days' && draft.days.find((day) => day.id === entry.id)?.scope === 'week_private') continue;
    exportEntries.push([entry.key.trim(), { kind: entry.kind, id: entry.id }]);
  }
  data.exports = Object.fromEntries(exportEntries);
  if (!errors.length) errors.push(...validateRuntimeDocument(data));
  return { data: errors.length ? null : data, errors };
}
