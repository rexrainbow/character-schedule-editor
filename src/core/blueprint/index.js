import { parseDocument, stringify } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { compileProject, projectToDraft, validateDocument } from '../model.js';
import { blueprintSchema } from './schema.js';
import { BlueprintError, parseExpression, formatExpression } from './expression.js';

export { blueprintSchema, parseExpression, formatExpression };
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(blueprintSchema);
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const entries = (value) => Object.entries(value ?? {});
const map = (value, fn) => Object.fromEntries(entries(value).map(([key, item], index) => [key, fn(item, key, index)]));
const present = (values) => Object.fromEntries(entries(values).filter(([, value]) => value !== undefined));
const metadataIn = (value, key) => present({ name: key, display_name: value.display_name ?? '', icon: value.icon, description: value.description });
const metadataOut = (value) => present({ display_name: value.display_name, icon: value.icon?.trim() ? value.icon : undefined, description: value.description?.trim() ? value.description : undefined });
const failed = (error) => ({ data: null, errors: error.issues ?? [{ code: error.code ?? 'invalidBlueprint', path: error.path ?? '', message: error.message }] });
function reject(message, path = '') { throw new BlueprintError(message, path); }

/** Parse YAML, compile a fresh project, and validate without mutating a session. */
export function importBlueprint(text) {
  try {
    if (typeof text !== 'string' || text.length > 4_000_000) reject('Blueprint must be YAML text no larger than 4 MB.');
    const yaml = parseDocument(text, { version: '1.2', uniqueKeys: true, customTags: [] });
    if (yaml.errors.length || yaml.warnings.length) reject([...yaml.errors, ...yaml.warnings].map((error) => error.message).join('\n'));
    const input = yaml.toJS({ maxAliasCount: 0 });
    if (!validate(input)) return { data: null, errors: validate.errors.map((error) => ({ code: 'blueprintSchema', path: error.instancePath, message: error.message, params: error.params })) };
    const ids = Object.fromEntries(['vars', 'expr', 'tasks', 'macros', 'slots', 'days', 'weeks', 'sequences', 'enums', 'events'].map((key) => [key, new Map()]));
    const groups = { variables: 'vars', expressions: 'expr', tasks: 'tasks', task_macros: 'macros', slots: 'slots', days: 'days', weeks: 'weeks', sequences: 'sequences', enums: 'enums' };
    for (const [key, group] of entries(groups)) for (const [symbol] of entries(input[key])) ids[group].set(symbol, crypto.randomUUID());
    for (const [sequence, item] of entries(input.sequences)) for (const [symbol] of entries(item.events)) {
      if (ids.events.has(symbol)) reject('Event symbols must be unique across sequences.', `/sequences/${sequence}/events/${symbol}`);
      ids.events.set(symbol, crypto.randomUUID());
    }
    function resolve(group, key, path = '', params = new Map()) {
      const id = (group === 'params' ? params : ids[group])?.get(key);
      if (!id) reject(`Unknown ${group} symbol: ${key}.`, path);
      return id;
    }
    const parameterIds = new Map();
    for (const group of ['tasks', 'task_macros']) for (const [key, item] of entries(input[group])) parameterIds.set(`${group}:${key}`, new Map(entries(item.parameters).map(([name]) => [name, crypto.randomUUID()])));
    function diagnostics(errors) {
      const roots = { operand_nodes: ['variables', 'vars'], expression_macros: ['expressions', 'expr'], tasks: ['tasks', 'tasks'], task_macros: ['task_macros', 'macros'], slots: ['slots', 'slots'], day_schedules: ['days', 'days'], week_schedules: ['weeks', 'weeks'], week_sequences: ['sequences', 'sequences'], enum_definitions: ['enums', 'enums'] };
      return errors.map((error) => {
        const parts = (error.path ?? '').split('/'), definition = roots[parts[1]];
        let path = error.path ?? '';
        if (definition) {
          const [root, group] = definition, key = [...ids[group]].find(([, id]) => id === parts[2])?.[0];
          if (key) {
            parts[1] = root; parts[2] = key;
            if (root === 'sequences' && parts[3] === 'event_groups') { parts[3] = 'events'; parts[4] = Object.keys(input.sequences[key].events ?? {})[Number(parts[4])] ?? parts[4]; }
            if (['tasks', 'task_macros'].includes(root) && parts[3] === 'parameters') parts[4] = Object.keys(input[root][key].parameters ?? {})[Number(parts[4])] ?? parts[4];
            const fields = { display_name: 'name', initial_value: 'initial', min_value: 'min', max_value: 'max', integer_only: 'integer', slot_ids: 'slots', day_start_slot_id: 'start', day_end_slot_id: 'end', slot_events: 'hooks', slot_releases: 'releases', interval_days: 'every', probability_percent: 'probability', execution_mode: 'execution', count_filter: 'count' };
            path = parts.map((part) => fields[part] ?? part).join('/');
          }
        }
        return { ...error, code: error.code ?? error.key ?? 'invalidBlueprint', path, message: error.message ?? `Compiled blueprint: ${error.key ?? 'invalid data'}` };
      });
    }
    function operand(value, path, params, condition = false) { return parseExpression(value, (group, key) => resolve(group, key, path, params), { path, condition }); }
    function eventRef(value, path, params) {
      if (value.event) return { type: 'event_reference', event_group_id: resolve('events', value.event, path) };
      if (value.parameter) return { type: 'parameter_reference', parameter_id: resolve('params', value.parameter, path, params) };
      return { type: 'current_event_reference' };
    }
    function argument(value, path, params) {
      if (typeof value === 'string') return operand(value, path, params);
      if (value.variable) return { type: 'variable_reference', reference_id: resolve('vars', value.variable, path) };
      return eventRef(value, path, params);
    }
    function source(value, path) {
      if (!value) return undefined;
      if (value.mode === 'sequential' && value.candidates.some((item) => item.weight !== undefined)) reject('Sequential candidates do not have weights.', path);
      return { mode: value.mode, candidates: value.candidates.map((item) => present({ day_schedule_id: resolve('days', item.day, path), weight: value.mode === 'random' ? item.weight ?? 1 : undefined })) };
    }
    function action(value, path, params) {
      if (value.task || value.macro) {
        const isMacro = !!value.macro, group = isMacro ? 'task_macros' : 'tasks', name = value.macro ?? value.task;
        const targetParams = parameterIds.get(`${group}:${name}`);
        const arguments_ = Object.fromEntries(entries(value.arguments).map(([key, arg]) => {
          if (!targetParams?.has(key)) reject(`Unknown parameter ${key} on ${name}.`, path);
          return [targetParams.get(key), argument(arg, `${path}/arguments/${key}`, params)];
        }));
        return { [isMacro ? 'task_macro_id' : 'task_id']: resolve(isMacro ? 'macros' : 'tasks', name, path), arguments: arguments_ };
      }
      if (value.builtin === 'schedule_event') return present({ builtin: value.builtin, display_name: value.display_name ?? '', ...(value.icon === undefined ? {} : { icon: value.icon }), date: { ...value.date, offset: operand(value.date.offset, `${path}/date/offset`, params) }, day_schedule_id: value.day ? resolve('days', value.day, path) : undefined, day_source: source(value.source, path), execution_mode: value.execution ?? 'overlay', priority: value.priority ?? 0 });
      if (value.builtin === 'adjust_probability_event') return { builtin: value.builtin, event: eventRef(value.event, path, params), property: typeof value.property === 'string' ? value.property : argument(value.property, path, params), operation: typeof value.operation === 'string' ? value.operation : argument(value.operation, path, params), value: operand(value.value, `${path}/value`, params) };
      return present({ builtin: value.builtin, target_variable_id: resolve('vars', value.target, `${path}/target`), value: value.value === undefined ? undefined : operand(value.value, `${path}/value`, params), random_amplitude: value.random_amplitude === undefined ? undefined : operand(value.random_amplitude, `${path}/random_amplitude`, params) });
    }
    function parameters(value, group, key) {
      const params = parameterIds.get(`${group}:${key}`);
      return entries(value.parameters).map(([name, item]) => present({ ...metadataIn(item, name), id: params.get(name), type: item.type, value_type: item.value_type, access: item.access, event_kind: item.event_kind, options: item.options?.map((option) => present({ display_name: option.display_name ?? option.value, icon: option.icon, value: option.value })), enum_id: item.enum ? resolve('enums', item.enum, `/${group}/${key}/parameters/${name}`) : undefined }));
    }
    const branches = (items, path, params) => (items ?? []).map((item, index) => ({ ...(item.description === undefined ? {} : { description: item.description }), condition: item.when === null ? null : operand(item.when, `${path}/${index}/when`, params, true), task: action(item.run, `${path}/${index}/run`, params) }));
    const doc = {
      project: { schema_version: 'dev', name: input.project?.name ?? 'Character Schedule', settings: { slots_per_day: input.project?.slots_per_day ?? 3 } },
      operand_nodes: {}, expression_macros: {}, tasks: {}, task_macros: {}, slots: {}, day_schedules: {}, week_schedules: {}, week_sequences: {},
    };
    for (const [key, item] of entries(input.variables)) if (item.kind === 'group' && ['type', 'initial', 'min', 'max', 'integer', 'read_only'].some((field) => item[field] !== undefined)) reject('Variable groups cannot have value attributes.', `/variables/${key}`);
    if (input.environment) doc.environment = { id: crypto.randomUUID(), display_name: input.environment.name ?? 'Environment', ...(input.environment.icon === undefined ? {} : { icon: input.environment.icon }), version: input.environment.version ?? 'dev' };
    doc.operand_nodes = Object.fromEntries(entries(input.variables).map(([key, item], index) => [resolve('vars', key), present({ ...metadataIn(item, key), node_type: item.kind ?? 'value', scope: item.scope ?? 'application', parent_id: item.parent ? resolve('vars', item.parent, `/variables/${key}/parent`) : null, order: item.order ?? index, ...(item.kind === 'group' ? {} : { value_type: item.type ?? 'number', read_only: item.read_only ?? false, initial_value: item.initial ?? (item.type === 'string' ? '' : item.type === 'boolean' ? false : 0), min_value: item.min, max_value: item.max, integer_only: item.integer }) })]));
    if (input.enums) doc.enum_definitions = Object.fromEntries(entries(input.enums).map(([key, item], index) => [resolve('enums', key), present({ ...metadataIn(item, key), node_type: item.kind ?? 'enum', scope: item.scope ?? 'application', parent_id: item.parent ? resolve('enums', item.parent, `/enums/${key}/parent`) : null, order: item.order ?? index, options: item.options?.map((option) => present({ display_name: option.display_name ?? option.value, icon: option.icon, value: option.value })) })]));
    doc.expression_macros = Object.fromEntries(entries(input.expressions).map(([key, item]) => {
      const path = `/expressions/${key}`, result = (value, location) => item.type === 'number' ? { kind: 'number', expression: operand(value, location) } : { kind: 'boolean', condition: operand(value, location, undefined, true) };
      if ((item.value !== undefined) === (item.branches !== undefined)) reject('Specify exactly one of value or branches.', path);
      const definition = item.branches ? { kind: 'branch', branches: item.branches.map((branch, index) => ({ ...(branch.description === undefined ? {} : { description: branch.description }), condition: branch.when === null ? null : operand(branch.when, `${path}/branches/${index}/when`, undefined, true), result: result(branch.value, `${path}/branches/${index}/value`) })) } : result(item.value, `${path}/value`);
      return [resolve('expr', key), { ...metadataIn(item, key), scope: item.scope ?? 'application', value_type: item.type, definition }];
    }));
    doc.tasks = Object.fromEntries(entries(input.tasks).map(([key, item]) => [resolve('tasks', key), { ...metadataIn(item, key), parameters: parameters(item, 'tasks', key) }]));
    doc.task_macros = Object.fromEntries(entries(input.task_macros).map(([key, item]) => {
      const path = `/task_macros/${key}`, params = parameterIds.get(`task_macros:${key}`), mode = item.mode ?? 'sequence';
      for (const field of ['steps', 'branches', 'candidates']) if (item[field] !== undefined && field !== ({ sequence: 'steps', branch: 'branches', priority: 'candidates', random: 'candidates' })[mode]) reject(`Field ${field} conflicts with mode ${mode}.`, path);
      if (item.fallback !== undefined && mode !== 'random') reject('Fallback is only supported in random macros.', path);
      return [resolve('macros', key), present({ ...metadataIn(item, key), mode, parameters: parameters(item, 'task_macros', key), eligibility: item.eligibility == null ? item.eligibility : operand(item.eligibility, `${path}/eligibility`, params, true), ...(mode === 'sequence' ? { steps: (item.steps ?? []).map((step, index) => ({ id: crypto.randomUUID(), ...(step.description === undefined ? {} : { description: step.description }), task: action(step, `${path}/steps/${index}`, params) })) } : mode === 'branch' ? { branches: branches(item.branches, `${path}/branches`, params) } : { candidates: (item.candidates ?? []).map((call, index) => ({ id: crypto.randomUUID(), ...(call.description === undefined ? {} : { description: call.description }), task: action(call, `${path}/candidates/${index}`, params), ...(mode === 'random' ? { weight: operand(call.weight ?? '1', `${path}/candidates/${index}/weight`, params) } : {}) })), ...(mode === 'random' ? { fallback: item.fallback ? { task: action(item.fallback, `${path}/fallback`, params), ...(item.fallback.description === undefined ? {} : { description: item.fallback.description }) } : null } : {}) }) })];
    }));
    doc.slots = Object.fromEntries(entries(input.slots).map(([key, item]) => {
      if (item.mode === 'priority' ? item.branches !== undefined : item.candidates !== undefined) reject('Slot branches and priority candidates are mutually exclusive.', `/slots/${key}`);
      return [resolve('slots', key), { ...metadataIn(item, key), icon: item.icon ?? '', ...(item.mode === 'priority' ? { mode: 'priority', candidates: (item.candidates ?? []).map((call, index) => ({ id: crypto.randomUUID(), ...(call.description === undefined ? {} : { description: call.description }), task: action(call, `/slots/${key}/candidates/${index}`) })) } : { branches: branches(item.branches, `/slots/${key}/branches`) }) }];
    }));
    const slotRef = (key, path) => key == null ? null : resolve('slots', key, path);
    doc.day_schedules = Object.fromEntries(entries(input.days).map(([key, item]) => [resolve('days', key), present({ ...metadataIn(item, key), slot_ids: (item.slots ?? Array(doc.project.settings.slots_per_day).fill(null)).map((slot) => slotRef(slot, `/days/${key}/slots`)), scope: item.scope, owner: item.owner ? { week_schedule_id: resolve('weeks', item.owner.week, `/days/${key}/owner`), weekday: item.owner.weekday } : undefined, day_start_slot_id: item.start === undefined ? undefined : slotRef(item.start, `/days/${key}/start`), day_end_slot_id: item.end === undefined ? undefined : slotRef(item.end, `/days/${key}/end`), slot_events: item.hooks?.map((hook) => ({ start_slot_id: slotRef(hook.start, `/days/${key}/hooks`), end_slot_id: slotRef(hook.end, `/days/${key}/hooks`) })), slot_releases: item.releases?.map((release, index) => release === null ? null : { builtin: 'release_slot', condition: release.when == null ? null : operand(release.when, `/days/${key}/releases/${index}/when`, undefined, true) }), tags: item.tags, purposes: item.purposes })]));
    doc.week_schedules = Object.fromEntries(entries(input.weeks).map(([key, item]) => [resolve('weeks', key), { ...metadataIn(item, key), days: Object.fromEntries(weekdays.map((day) => [day, item.days?.[day] == null ? null : resolve('days', item.days[day], `/weeks/${key}/days/${day}`)])) }]));
    const dateIn = (value) => ({ week_number: value.week, weekday: value.weekday });
    doc.week_sequences = Object.fromEntries(entries(input.sequences).map(([key, item]) => [resolve('sequences', key), present({ ...metadataIn(item, key), week_schedule_ids: (item.weeks ?? []).map((week) => resolve('weeks', typeof week === 'string' ? week : week.week, `/sequences/${key}/weeks`)), week_repeat_counts: (item.weeks ?? []).map((week) => typeof week === 'string' ? 1 : week.repeat), day_overrides: (item.overrides ?? []).map((override) => ({ ...dateIn(override), day_schedule_id: override.day === null ? null : resolve('days', override.day, `/sequences/${key}/overrides`) })), start_weekday: item.start_weekday, end_weekday: item.end_weekday, event_groups: item.events === undefined ? undefined : entries(item.events).map(([name, event]) => present({ ...metadataIn(event, name), id: resolve('events', name), kind: event.kind, start: dateIn(event.start), end: event.end ? dateIn(event.end) : undefined, day_schedule_id: event.day ? resolve('days', event.day, `/sequences/${key}/events/${name}/day`) : undefined, day_source: source(event.source, `/sequences/${key}/events/${name}/source`), interval_days: event.every, probability_percent: event.probability, cooldown_days: event.cooldown_days, count_filter: event.count ? present({ kind: event.count.kind, day_schedule_id: event.count.day ? resolve('days', event.count.day) : undefined, tag: event.count.tag }) : undefined, execution_mode: event.execution ?? 'overlay', priority: event.priority ?? 0 })) })]));
    if (input.builtins) doc.builtin_tasks = map(input.builtins, (item, key) => present({ description: item.description, icon: item.icon, display_name: item.display_name, name: item.name ?? key, parameters: item.parameter_names || item.parameter_symbols || item.parameter_descriptions || item.parameter_icons || item.parameter_option_icons ? Object.fromEntries([...new Set([...Object.keys(item.parameter_names ?? {}), ...Object.keys(item.parameter_symbols ?? {}), ...Object.keys(item.parameter_descriptions ?? {}), ...Object.keys(item.parameter_icons ?? {}), ...Object.keys(item.parameter_option_icons ?? {})])].map((role) => [role, present({ display_name: item.parameter_names?.[role], icon: item.parameter_icons?.[role], option_icons: item.parameter_option_icons?.[role], name: item.parameter_symbols?.[role], description: item.parameter_descriptions?.[role] })])) : undefined }));
    const errors = validateDocument(doc);
    if (errors.length) return { data: null, errors: diagnostics(errors) };
    const draft = projectToDraft(doc), compiled = compileProject(draft);
    if (compiled.errors.length) return { data: null, errors: diagnostics(compiled.errors) };
    return { data: compiled.data, draft, errors: [] };
  } catch (error) { return failed(error); }
}

/** Export all definitions and sharing relationships; no project UUIDs; optional display icons are preserved. */
export function exportBlueprint(draft) {
  try {
    const compiled = compileProject(draft); if (compiled.errors.length) return { data: null, errors: compiled.errors };
    const doc = compiled.data, symbols = {}, paramsByOwner = new Map();
    function allocate(group, items) {
      const result = new Map(), used = new Set();
      for (const [id, item] of items) {
        const base = item.name?.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || `${group}_${used.size + 1}`;
        let key = /^[A-Za-z_]/.test(base) ? base : `_${base}`, suffix = 2, stem = key;
        while (used.has(key)) key = `${stem}_${suffix++}`;
        used.add(key); result.set(id, key);
      }
      return result;
    }
    const groups = { vars: 'operand_nodes', expr: 'expression_macros', tasks: 'tasks', macros: 'task_macros', slots: 'slots', days: 'day_schedules', weeks: 'week_schedules', sequences: 'week_sequences', enums: 'enum_definitions' };
    for (const [group, key] of entries(groups)) symbols[group] = allocate(group, entries(doc[key]));
    symbols.events = allocate('event', Object.values(doc.week_sequences ?? {}).flatMap((sequence) => (sequence.event_groups ?? []).map((event) => [event.id, event])));
    for (const key of ['tasks', 'task_macros']) for (const [id, item] of entries(doc[key])) paramsByOwner.set(id, allocate('param', item.parameters.map((parameter) => [parameter.id, parameter])));
    function symbol(group, id, params) { const value = (group === 'params' ? params : symbols[group])?.get(id); if (!value) reject(`Cannot resolve ${group} reference.`); return value; }
    const operand = (value, params) => formatExpression(value, (group, id) => symbol(group, id, params));
    function eventRef(value, params) {
      return value.type === 'current_event_reference' ? { current_event: true } : value.type === 'parameter_reference' ? { parameter: symbol('params', value.parameter_id, params) } : { event: symbol('events', value.event_group_id) };
    }
    function argument(value, params) {
      if (value.type === 'variable_reference') return { variable: symbol('vars', value.reference_id) };
      if (['event_reference', 'current_event_reference'].includes(value.type)) return eventRef(value, params);
      return operand(value, params);
    }
    function source(value) { return value ? { mode: value.mode, candidates: value.candidates.map((item) => present({ day: symbol('days', item.day_schedule_id), weight: item.weight })) } : undefined; }
    function action(value, params) {
      if (value.task_id || value.task_macro_id) {
        const isMacro = !!value.task_macro_id, id = value.task_macro_id ?? value.task_id, targetParams = paramsByOwner.get(id);
        return { [isMacro ? 'macro' : 'task']: symbol(isMacro ? 'macros' : 'tasks', id), arguments: Object.fromEntries(entries(value.arguments).map(([parameter, arg]) => [symbol('params', parameter, targetParams), argument(arg, params)])) };
      }
      if (value.builtin === 'schedule_event') return present({ builtin: value.builtin, display_name: value.display_name, icon: value.icon, date: { ...value.date, offset: operand(value.date.offset, params) }, day: value.day_schedule_id ? symbol('days', value.day_schedule_id) : undefined, source: source(value.day_source), execution: value.execution_mode, priority: value.priority });
      if (value.builtin === 'adjust_probability_event') return { builtin: value.builtin, event: eventRef(value.event, params), property: typeof value.property === 'string' ? value.property : { parameter: symbol('params', value.property.parameter_id, params) }, operation: typeof value.operation === 'string' ? value.operation : { parameter: symbol('params', value.operation.parameter_id, params) }, value: operand(value.value, params) };
      return present({ builtin: value.builtin, target: symbol('vars', value.target_variable_id), value: value.value === undefined ? undefined : operand(value.value, params), random_amplitude: value.random_amplitude === undefined ? undefined : operand(value.random_amplitude, params) });
    }
    function parameters(item, id) { return Object.fromEntries(item.parameters.map((parameter) => [symbol('params', parameter.id, paramsByOwner.get(id)), present({ ...metadataOut(parameter), type: parameter.type, value_type: parameter.value_type, access: parameter.access, event_kind: parameter.event_kind, enum: parameter.enum_id ? symbol('enums', parameter.enum_id) : undefined, options: parameter.options?.map((option) => present({ display_name: option.display_name, icon: option.icon?.trim() ? option.icon : undefined, value: option.value })) })])); }
    const branches = (items, params) => items.map((item) => ({ ...(item.description?.trim() ? { description: item.description } : {}), when: item.condition === null ? null : operand(item.condition, params), run: action(item.task, params) }));
    const collection = (group, fn) => Object.fromEntries(entries(doc[groups[group]]).map(([id, item]) => [symbol(group, id), fn(item, id)]));
    const output = {
      project: { name: doc.project.name, slots_per_day: doc.project.settings.slots_per_day },
      ...present({ environment: doc.environment ? { name: doc.environment.display_name, version: doc.environment.version, ...(doc.environment.icon === undefined ? {} : { icon: doc.environment.icon }) } : undefined }),
      variables: collection('vars', (item) => present({ ...metadataOut(item), scope: item.scope ?? 'environment', kind: item.node_type, parent: item.parent_id ? symbol('vars', item.parent_id) : null, order: item.order, type: item.value_type, initial: item.node_type === 'value' ? item.initial_value ?? (item.value_type === 'string' ? '' : item.value_type === 'boolean' ? false : 0) : undefined, min: item.min_value, max: item.max_value, integer: item.integer_only, read_only: item.read_only })),
      expressions: collection('expr', (item) => {
        const result = (definition) => operand(definition.kind === 'number' ? definition.expression : definition.condition);
        return { ...metadataOut(item), scope: item.scope ?? 'application', type: item.value_type, ...(item.definition.kind === 'branch' ? { branches: item.definition.branches.map((branch) => ({ ...(branch.description?.trim() ? { description: branch.description } : {}), when: branch.condition === null ? null : operand(branch.condition), value: result(branch.result) })) } : { value: result(item.definition) }) };
      }),
      tasks: collection('tasks', (item, id) => ({ ...metadataOut(item), parameters: parameters(item, id) })),
      task_macros: collection('macros', (item, id) => {
        const params = paramsByOwner.get(id);
        return present({ ...metadataOut(item), mode: item.mode, parameters: parameters(item, id), eligibility: item.eligibility == null ? item.eligibility : operand(item.eligibility, params), ...(item.mode === 'sequence' ? { steps: item.steps.map((step) => present({ ...action(step.task, params), description: step.description?.trim() ? step.description : undefined })) } : item.mode === 'branch' ? { branches: branches(item.branches, params) } : { candidates: item.candidates.map((call) => present({ ...action(call.task, params), ...(item.mode === 'random' ? { weight: operand(call.weight, params) } : {}), description: call.description?.trim() ? call.description : undefined })), ...(item.mode === 'random' ? { fallback: item.fallback ? present({ ...action(item.fallback.task, params), description: item.fallback.description?.trim() ? item.fallback.description : undefined }) : null } : {}) }) });
      }),
      slots: collection('slots', (item) => ({ ...metadataOut(item), ...(item.mode === 'priority' ? { mode: 'priority', candidates: item.candidates.map((call) => present({ ...action(call.task), description: call.description?.trim() ? call.description : undefined })) } : { branches: branches(item.branches) }) })),
      days: collection('days', (item) => present({ ...metadataOut(item), slots: item.slot_ids.map((id) => id === null ? null : symbol('slots', id)), scope: item.scope, owner: item.owner ? { week: symbol('weeks', item.owner.week_schedule_id), weekday: item.owner.weekday } : undefined, start: item.day_start_slot_id == null ? item.day_start_slot_id : symbol('slots', item.day_start_slot_id), end: item.day_end_slot_id == null ? item.day_end_slot_id : symbol('slots', item.day_end_slot_id), hooks: item.slot_events?.map((hook) => ({ start: hook.start_slot_id === null ? null : symbol('slots', hook.start_slot_id), end: hook.end_slot_id === null ? null : symbol('slots', hook.end_slot_id) })), releases: item.slot_releases?.map((release) => release === null ? null : { when: release.condition == null ? null : operand(release.condition) }), tags: item.tags, purposes: item.purposes })),
      weeks: collection('weeks', (item) => ({ ...metadataOut(item), days: map(item.days, (id) => id === null ? null : symbol('days', id)) })),
      sequences: collection('sequences', (item) => present({ ...metadataOut(item), weeks: item.week_schedule_ids.map((id, index) => item.week_repeat_counts?.[index] === undefined || item.week_repeat_counts[index] === 1 ? symbol('weeks', id) : { week: symbol('weeks', id), repeat: item.week_repeat_counts[index] }), overrides: item.day_overrides.map((override) => ({ week: override.week_number, weekday: override.weekday, day: override.day_schedule_id === null ? null : symbol('days', override.day_schedule_id) })), start_weekday: item.start_weekday, end_weekday: item.end_weekday, events: Object.fromEntries((item.event_groups ?? []).map((event) => [symbol('events', event.id), present({ ...metadataOut(event), kind: event.kind, start: { week: event.start.week_number, weekday: event.start.weekday }, end: event.end ? { week: event.end.week_number, weekday: event.end.weekday } : undefined, day: event.day_schedule_id ? symbol('days', event.day_schedule_id) : undefined, source: source(event.day_source), every: event.interval_days, probability: event.probability_percent, cooldown_days: event.cooldown_days, count: event.count_filter ? present({ kind: event.count_filter.kind, day: event.count_filter.day_schedule_id ? symbol('days', event.count_filter.day_schedule_id) : undefined, tag: event.count_filter.tag }) : undefined, execution: event.execution_mode, priority: event.priority })])) })),
      enums: collection('enums', (item) => present({ ...metadataOut(item), scope: item.scope, kind: item.node_type, parent: item.parent_id ? symbol('enums', item.parent_id) : null, order: item.order, options: item.options?.map((option) => present({ display_name: option.display_name, icon: option.icon?.trim() ? option.icon : undefined, value: option.value })) })),
      ...present({ builtins: doc.builtin_tasks ? map(doc.builtin_tasks, (item) => present({ name: item.name, ...metadataOut(item), parameter_icons: item.parameters ? Object.fromEntries(entries(item.parameters).filter(([, p]) => p.icon !== undefined).map(([id, p]) => [id, p.icon])) : undefined, parameter_option_icons: item.parameters ? Object.fromEntries(entries(item.parameters).filter(([, p]) => p.option_icons !== undefined).map(([id, p]) => [id, p.option_icons])) : undefined, parameter_names: item.parameters ? Object.fromEntries(entries(item.parameters).filter(([, parameter]) => parameter.display_name !== undefined).map(([role, parameter]) => [role, parameter.display_name])) : undefined, parameter_descriptions: item.parameters ? Object.fromEntries(entries(item.parameters).filter(([, parameter]) => parameter.description?.trim()).map(([role, parameter]) => [role, parameter.description])) : undefined, parameter_symbols: item.parameters ? Object.fromEntries(entries(item.parameters).filter(([, parameter]) => parameter.name !== undefined).map(([role, parameter]) => [role, parameter.name])) : undefined })) : undefined }),
    };
    if (!validate(output)) return { data: null, errors: validate.errors.map((error) => ({ code: 'blueprintExport', path: error.instancePath, message: error.message })) };
    return { data: stringify(output, { lineWidth: 100, aliasDuplicateObjects: false }), errors: [] };
  } catch (error) { return failed(error); }
}
