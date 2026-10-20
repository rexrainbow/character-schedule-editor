import { macroEntries, slotEntries } from './operandModel.js';
import { translator } from '../i18n/index.js';
import { addProgressDefinitions } from './progressEnvironment.js';
import { isBuiltinVariableTask } from './builtinTaskModel.js';
import { referenceContractAccepts } from './parameterModel.js';
import { enumScope, enumReferences } from './enumDefinitions.js';
import { enumAccepts, resolveEnumParameter } from './enumParameters.js';
import { eventContractAccepts } from './eventReferences.js';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schemas/environment.schema.json' with { type: 'json' };
import { createProject, compileProject, validateDocument } from './model.js';
import { scopedVariables, isComputed, variableScope, nodeScope, documentNodes, serializeNodes } from './operandModel.js';

const validate = new Ajv2020({ allErrors: true, strict: false, ownProperties: true }).compile(schema);
export const createEnvironmentInfo = (name = 'New environment') => ({ id: crypto.randomUUID(), display_name: name, version: 'dev' });
const keyOf = (item) => typeof item?.engine_key === 'string' ? item.engine_key.trim() : '';

export const environmentNodes = (data) => documentNodes({ operand_nodes: data.operand_nodes, expression_macros: Object.fromEntries(Object.entries(data.expression_macros ?? {}).map(([id, macro]) => [id, { ...macro, scope: 'environment' }])) });

export function validateEnvironment(data) {
  validate(data);
  const errors = (validate.errors ?? []).map((error) => ({ path: error.instancePath || '/', key: `schema_${error.keyword}`, field: error.params.missingProperty ?? error.params.additionalProperty ?? '' }));
  if (errors.length) return errors;
  for (const id of Object.keys(data.expression_macros ?? {})) if (Object.hasOwn(data.operand_nodes, id)) errors.push({ path: `/expression_macros/${id}`, key: 'duplicateId' });
  if (errors.length) return errors;
  for (const [id, node] of Object.entries(data.operand_nodes)) if (variableScope(node) !== 'environment') errors.push({ path: `/operand_nodes/${id}/scope`, key: 'environmentOnly' });
  errors.push(...validateDocument({ project: { ...createProject().project, settings: data.settings }, slots: {}, day_schedules: {}, ...serializeNodes(environmentNodes(data)), tasks: data.tasks, enum_definitions: data.enum_definitions ?? {}, ...(data.builtin_tasks === undefined ? {} : { builtin_tasks: data.builtin_tasks }) }));
  return errors;
}

export function compileEnvironment(draft) {
  const enumNodes = Object.fromEntries(Object.entries(draft.enumNodes ?? {}).filter(([, node]) => enumScope(node) === 'environment'));
  const data = { ...(Object.keys(enumNodes).length ? { enum_definitions: structuredClone(enumNodes) } : {}), format_version: 1, environment: structuredClone(draft.environment), settings: structuredClone(draft.project.settings), ...serializeNodes(Object.fromEntries(Object.entries(draft.operandNodes).filter(([, node]) => nodeScope(node) === 'environment'))), tasks: Object.fromEntries(draft.tasks.map(({ id, ...task }) => [id, structuredClone(task)])), ...(draft.builtinTasks === undefined ? {} : { builtin_tasks: structuredClone(draft.builtinTasks) }) };
  const errors = validateEnvironment(data);
  return { data: errors.length ? null : data, errors };
}

export function createProjectWithEnvironment(name, count, environment, info = createEnvironmentInfo(), t = translator('en')) {
  const base = createProject();
  if (!environment) return { ...base, project: { ...base.project, name, settings: { slots_per_day: count } }, environment: info, operandNodes: addProgressDefinitions({}, count, t) };
  const errors = validateEnvironment(environment);
  if (errors.length) return { errors };
  return { ...base, environment: structuredClone(environment.environment), enumNodes: structuredClone(environment.enum_definitions ?? {}), project: { ...base.project, name, settings: structuredClone(environment.settings) }, operandNodes: environmentNodes(environment), tasks: Object.entries(environment.tasks).map(([id, task]) => ({ ...structuredClone(task), id })), ...(environment.builtin_tasks === undefined ? {} : { builtinTasks: structuredClone(environment.builtin_tasks) }) };
}

// Build a candidate in isolation. Never mutate the currently edited project.
export function prepareEnvironmentImport(draft, environment) {
  const errors = validateEnvironment(environment), stats = { variables: 0, tasks: 0, expressions: 0 };
  if (errors.length) return { draft: null, errors, stats };
  if (draft.days.length && draft.project.settings.slots_per_day !== environment.settings.slots_per_day) errors.push({ path: '/settings/slots_per_day', key: 'environmentCellCountMismatch' });
  const next = structuredClone(draft);
  const application = Object.fromEntries(Object.entries(next.operandNodes).filter(([, node]) => nodeScope(node) === 'application'));
  for (const id of Object.keys(environmentNodes(environment))) if (Object.hasOwn(application, id)) errors.push({ path: `/operand_nodes/${id}`, key: 'duplicateId' });
  if (errors.length) return { draft: null, errors, stats };
  const oldNodes = draft.operandNodes, newNodes = environmentNodes(environment);
  const newTasks = Object.entries(environment.tasks).map(([id, task]) => ({ ...structuredClone(task), id }));
  const sameIdentity = !draft.environment || draft.environment.id === environment.environment.id;
  const variableMap = new Map(), taskMap = new Map(), enumMap = new Map();
  const oldEnums = draft.enumNodes ?? {}, importedEnums = environment.enum_definitions ?? {};
  const applicationEnums = Object.fromEntries(Object.entries(oldEnums).filter(([, node]) => enumScope(node) === 'application'));
  for (const id of Object.keys(importedEnums)) if (Object.hasOwn(applicationEnums, id)) errors.push({ path: `/enum_definitions/${id}`, key: 'duplicateId' });
  function match(old, id, candidates, path) {
    const direct = sameIdentity ? candidates.find((item) => item.id === id) : null;
    if (direct) return direct;
    const matches = keyOf(old) ? candidates.filter((item) => keyOf(item) === keyOf(old)) : [];
    if (matches.length !== 1) { errors.push({ path, key: matches.length ? 'environmentAmbiguousReference' : 'environmentMissingReference', field: old?.display_name ?? id }); return null; }
    return matches[0];
  }
  function variable(id, path, write = false) {
    const old = oldNodes[id];
    if (!old || nodeScope(old) === 'application') return id;
    let target = variableMap.get(id);
    if (!variableMap.has(id)) {
      target = match(old, id, Object.entries(newNodes).filter(([, node]) => node.node_type === 'value' && isComputed(node) === isComputed(old)).map(([id, node]) => ({ ...node, id })), path);
      variableMap.set(id, target);
    }
    if (!target) return id;
    if (target.value_type !== old.value_type || write && target.read_only) { errors.push({ path, key: 'environmentIncompatibleReference', field: old.display_name }); return id; }
    return target.id;
  }
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'expression_macro_reference') value.expression_macro_id = variable(value.expression_macro_id, `${path}/expression_macro_id`);
    if (value.type === 'reference' || value.type === 'variable_reference') value.reference_id = variable(value.reference_id, `${path}/reference_id`);
    // Reconnect every fixed variable operation, including target-only calls.
    if (isBuiltinVariableTask(value)) value.target_variable_id = variable(value.target_variable_id, `${path}/target_variable_id`, true);
    if (value.task_id !== undefined) {
      const old = draft.tasks.find((item) => item.id === value.task_id);
      if (old) {
        if (!taskMap.has(old.id)) taskMap.set(old.id, match(old, old.id, newTasks, `${path}/task_id`));
        const target = taskMap.get(old.id);
        if (target) {
          const compatible = target.parameters.length === old.parameters.length;
          const bindings = old.parameters.map((p, index) => ({ old: p, next: sameIdentity && target.id === old.id ? target.parameters.find((candidate) => candidate.id === p.id) ?? target.parameters[index] : target.parameters[index] }));
          if (!compatible || bindings.some((pair) => pair.old.type !== pair.next?.type || pair.old.type === 'variable_reference' && !referenceContractAccepts(pair.next, pair.old) || pair.old.type === 'event_reference' && !eventContractAccepts(pair.next, pair.old) || pair.old.type === 'enum' && !enumAccepts(resolveEnumParameter(pair.next, importedEnums), resolveEnumParameter(pair.old, oldEnums))) || new Set(bindings.map((pair) => pair.next?.id)).size !== bindings.length) errors.push({ path: `${path}/arguments`, key: 'environmentIncompatibleReference', field: old.display_name });
          else { value.task_id = target.id; value.arguments = Object.fromEntries(bindings.map((pair) => [pair.next.id, value.arguments?.[pair.old.id]])); }
        }
      }
    }
    for (const [key, child] of Object.entries(value)) walk(child, `${path}/${key}`);
  }
  for (const slot of next.slots) for (const { entry, path } of slotEntries(slot)) { walk(entry.condition, `${path}/condition`); walk(entry.task, `${path}/task`); }
  for (const macro of next.taskMacros) {
    walk(macro.eligibility, `/task_macros/${macro.id}/eligibility`);
    for (const { entry, path } of macroEntries(macro)) { walk(entry.condition, `${path}/condition`); walk(entry.task, `${path}/task`); }
  }
  for (const day of next.days) walk(day.slotReleases, `/day_schedules/${day.id}/slot_releases`);
  for (const [id, node] of Object.entries(application)) if (isComputed(node)) walk(node.definition, `/expression_macros/${id}/definition`);
  for (const reference of enumReferences(next).filter((item) => item.scope === 'application')) {
    const old = oldEnums[reference.id];
    if (!old || enumScope(old) !== 'environment') continue;
    if (!enumMap.has(reference.id)) enumMap.set(reference.id, match(old, reference.id, Object.entries(importedEnums).filter(([, node]) => node.node_type === 'enum').map(([id, node]) => ({ ...node, id })), reference.path));
    const target = enumMap.get(reference.id);
    if (!target) continue;
    if (!enumAccepts({ type: 'enum', options: target.options }, { type: 'enum', options: old.options })) errors.push({ path: reference.path, key: 'environmentIncompatibleReference', field: old.display_name });
    else reference.parameter.enum_id = target.id;
  }
  next.enumNodes = { ...structuredClone(applicationEnums), ...structuredClone(importedEnums) };
  stats.variables = [...variableMap.values()].filter((node) => node && !isComputed(node)).length; stats.expressions = [...variableMap.values()].filter((node) => node && isComputed(node)).length; stats.tasks = [...taskMap.values()].filter(Boolean).length;
  if (errors.length) return { draft: null, errors, stats };
  next.operandNodes = { ...application, ...structuredClone(newNodes) };
  next.tasks = newTasks; next.environment = structuredClone(environment.environment);
  next.project.settings = structuredClone(environment.settings);
  if (environment.builtin_tasks === undefined) delete next.builtinTasks; else next.builtinTasks = structuredClone(environment.builtin_tasks);
  errors.push(...compileProject(next).errors);
  return { draft: errors.length ? null : next, errors, stats };
}
