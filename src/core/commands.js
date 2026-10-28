import Ajv2020 from 'ajv/dist/2020.js';

// Explicit dispatch only. No eval, dotted-path invocation or platform I/O.
const definitions = new Map();
const ajv = new Ajv2020({ allErrors: true, strict: false, ownProperties: true });
const text = { type: 'string', minLength: 1 }, integer = { type: 'integer' };
const values = { type: 'object' }, array = { type: 'array' };
const nullableId = { anyOf: [text, { type: 'null' }] };
const target = { anyOf: [integer, { enum: ['dayStart', 'dayEnd'] }, { type: 'object', properties: { index: integer, edge: { enum: ['start', 'end'] } }, required: ['index', 'edge'], additionalProperties: false }] };
const weekday = { enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] };
function register(object, action, mutates, fields, required, run, description = `${object}.${action}`) {
  const namedTarget = fields.id && required.includes('id');
  if (namedTarget) fields = { ...fields, name: text };
  if (namedTarget) required = required.filter((key) => key !== 'id');
  const schema = { type: 'object', properties: { object: { const: object }, action: { const: action }, ...fields }, required: ['object', 'action', ...required], additionalProperties: false };
  if (namedTarget) schema.anyOf = [{ required: ['id'] }, { required: ['name'] }];
  definitions.set(`${object}.${action}`, { object, action, mutates, description, schema, validate: ajv.compile(schema), run });
}
const add = (object, action, mutates, fields, required, run, description) => register(object, action, mutates, fields, required, run, description);

for (const object of ['slots', 'days', 'weeks', 'sequences', 'tasks', 'taskMacros', 'variables', 'expressions', 'enums']) {
  add(object, 'list', false, { query: values }, [], (p, c) => p[object].list(c.query));
  for (const action of object === 'sequences' ? ['get'] : ['get', 'references']) add(object, action, false, { id: text }, ['id'], (p, c) => p[object][action](c.id));
  add(object, 'create', true, { values }, ['values'], (p, c) => p[object].create(c.values));
  add(object, 'update', true, { id: text, values }, ['id', 'values'], (p, c) => p[object].update(c.id, c.values));
  for (const action of ['duplicate', 'remove']) add(object, action, true, { id: text }, ['id'], (p, c) => p[object][action](c.id));
  if (['slots', 'days', 'weeks', 'sequences', 'tasks', 'taskMacros'].includes(object)) add(object, 'replace', true, { id: text, values }, ['id', 'values'], (p, c) => p[object].replace(c.id, c.values));
}
add('project', 'snapshot', false, {}, [], (p) => p.getSnapshot(), 'Editor working data, using core API field names.');
add('project', 'document', false, {}, [], (p) => p.toDocument(), 'Validated project save format.');
add('project', 'validate', false, {}, [], (p) => p.validate());
add('project', 'blueprint', false, {}, [], (p) => p.exportBlueprint(), 'Export a UUID-free YAML blueprint; includes errors if the project is incomplete.');
add('settings', 'get', false, {}, [], (p) => p.settings.get());
add('settings', 'update', true, { values }, ['values'], (p, c) => p.settings.update(c.values));
add('days', 'uses', false, { id: text }, [], (p, c) => p.days.uses(c.id));
add('days', 'assignSlot', true, { id: text, target, slotId: nullableId, editedSlot: values }, ['id', 'target', 'slotId'], (p, c) => p.days.assignSlot(c.id, c.target, c.slotId, c.editedSlot));
add('weeks', 'assignDay', true, { id: text, weekday, dayId: nullableId }, ['id', 'weekday', 'dayId'], (p, c) => p.weeks.assignDay(c.id, c.weekday, c.dayId));
add('weeks', 'assignSlot', true, { id: text, weekday, target, slotId: nullableId, editedSlot: values }, ['id', 'weekday', 'target', 'slotId'], (p, c) => p.weeks.assignSlot(c.id, c.weekday, c.target, c.slotId, c.editedSlot));
add('sequences', 'setRepeat', true, { id: text, rowId: text, count: { type: ['integer', 'null'], minimum: 1 } }, ['id', 'rowId', 'count'], (p, c) => p.sequences.setRepeat(c.id, c.rowId, c.count), 'Total week executions; null means infinite and is allowed only on the last row.');
for (const action of ['appendWeek', 'replaceWeek', 'moveWeek', 'duplicateWeek', 'removeWeek', 'setOverride', 'setBoundary']) {
  const extra = { appendWeek: ['weekId'], replaceWeek: ['rowId', 'weekId'], moveWeek: ['rowId', 'offset'], duplicateWeek: ['rowId'], removeWeek: ['rowId'], setOverride: ['rowId', 'weekday', 'dayId'], setBoundary: ['boundary', 'weekday'] }[action];
  const fields = { id: text, ...Object.fromEntries(extra.map((key) => [key, key === 'offset' ? integer : key === 'weekday' ? weekday : key === 'dayId' ? { anyOf: [nullableId, { const: 'inherit' }] } : key === 'boundary' ? { enum: ['start', 'end'] } : text])) };
  add('sequences', action, true, fields, ['id', ...extra], (p, c) => p.sequences[action](c.id, ...extra.map((key) => c[key])));
}
for (const action of ['list', 'get', 'references', 'create', 'update', 'replace', 'duplicate', 'remove', 'moveStart']) {
  const extra = { list: [], get: ['id'], references: ['id'], create: ['values'], update: ['id', 'values'], replace: ['groups'], duplicate: ['id'], remove: ['id'], moveStart: ['id', 'date'] }[action];
  const fields = { sequenceId: text, ...Object.fromEntries(extra.map((key) => [key, key === 'values' || key === 'date' ? values : key === 'groups' ? array : text])), ...(action === 'create' ? { position: { type: 'integer', minimum: 0 } } : {}) };
  add('events', action, !['list', 'get', 'references'].includes(action), fields, ['sequenceId', ...extra], (p, c) => p.sequences.events(c.sequenceId)[action](...extra.map((key) => c[key]), ...(action === 'create' ? [c.position ?? 0] : [])), `sequences.events(sequenceId).${action}; event values use core fields (dayId, kind, start, end, interval, executionMode).`);
}
for (const object of ['variables', 'expressions', 'enums']) add(object, 'move', true, { id: text, parentId: nullableId, position: { type: 'integer', minimum: 0 } }, ['id', 'parentId', 'position'], (p, c) => p[object].move(c.id, c.parentId, c.position));
for (const object of ['variables', 'expressions']) add(object, 'unset', true, { id: text, keys: { type: 'array', items: text } }, ['id', 'keys'], (p, c) => p[object].unset(c.id, c.keys));
add('variables', 'addProgress', true, {}, [], (p) => p.variables.addProgress());
add('expressions', 'setDefinition', true, { id: text, definition: values, valueType: { enum: ['number', 'boolean'] } }, ['id', 'definition', 'valueType'], (p, c) => p.expressions.setDefinition(c.id, c.definition, c.valueType));
for (const object of ['tasks.parameters', 'taskMacros.parameters']) {
  const owner = object.split('.')[0];
  for (const action of ['add', 'update', 'remove', 'move', 'references']) {
    const extra = { add: ['name'], update: ['id', 'values'], remove: ['id'], move: ['index', 'offset'], references: ['id'] }[action];
    const fields = { ownerId: text, ...Object.fromEntries(extra.map((key) => [key, key === 'values' ? values : ['index', 'offset'].includes(key) ? integer : key === 'name' ? { type: 'string' } : text])) };
    add(object, action, action !== 'references', fields, ['ownerId', ...extra], (p, c) => p[owner].parameters(c.ownerId)[action](...extra.map((key) => c[key])));
  }
}
add('tasks.builtins', 'list', false, {}, [], (p) => p.tasks.builtins.list());
add('tasks.builtins', 'update', true, { id: text, values }, ['id', 'values'], (p, c) => p.tasks.builtins.update(c.id, c.values));
add('taskMacros', 'setMode', true, { id: text, mode: { enum: ['sequence', 'branch', 'priority'] } }, ['id', 'mode'], (p, c) => p.taskMacros.setMode(c.id, c.mode));
add('taskMacros', 'moveEntry', true, { id: text, key: { enum: ['parameters', 'steps', 'branches', 'candidates'] }, index: integer, offset: integer }, ['id', 'key', 'index', 'offset'], (p, c) => p.taskMacros.moveEntry(c.id, c.key, c.index, c.offset));
add('taskMacros', 'addStep', true, { id: text }, ['id'], (p, c) => p.taskMacros.addStep(c.id));
add('taskMacros', 'duplicateStep', true, { id: text, index: integer }, ['id', 'index'], (p, c) => p.taskMacros.duplicateStep(c.id, c.index));
add('environment', 'previewImport', false, { data: values }, ['data'], (p, c) => p.environment.previewImport(c.data));
add('environment', 'import', true, { data: values }, ['data'], (p, c) => p.environment.import(c.data));

export const commandCatalog = () => structuredClone([...definitions.values()].map(({ run, validate, ...definition }) => definition));
export function inspectCommand(command) {
  const definition = command && definitions.get(`${command.object}.${command.action}`);
  if (!definition) return { ok: false, errors: [{ code: 'unknownCommand', path: '', message: 'Use the command catalog to choose an object and action.' }] };
  if (!definition.validate(command)) return { ok: false, errors: definition.validate.errors.map((error) => ({ code: 'invalidCommand', path: error.instancePath, message: error.message, params: error.params })) };
  return { ok: true, mutates: definition.mutates };
}
function compact(result) {
  const { ok, value, id, errors, warnings } = result;
  return { ok, value: value ?? null, ...(id === undefined ? {} : { id }), errors, warnings };
}
function invoke(project, command) {
  const definition = definitions.get(`${command.object}.${command.action}`);
  try {
    command = resolveCommand(project, command);
    const result = definition.run(project, command);
    const publicResult = publicValues(result);
    return definition.mutates ? compact(publicResult) : { ok: true, value: publicResult, errors: [], warnings: [] };
  } catch (error) { return { ok: false, value: null, errors: error.issues ?? [{ code: 'commandFailed', path: '', message: error.message }], warnings: [] }; }
}

function publicValues(value) {
  if (Array.isArray(value)) return value.map(publicValues);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_') && key !== 'symbol').map(([key, item]) => [key, publicValues(item)]));
  if (value.symbol !== undefined) { result.name = value.symbol; result.display_name = value._fallbackValue !== undefined ? '' : value.display_name ?? value.name ?? ''; }
  return result;
}

function resolveCommand(project, input) {
  const c = structuredClone(input), draft = project.getSnapshot();
  const groups = { variables: Object.entries(draft.operandNodes).filter(([, item]) => item.source !== 'computed').map(([id, item]) => ({ ...item, id })), expressions: Object.entries(draft.operandNodes).filter(([, item]) => item.source === 'computed').map(([id, item]) => ({ ...item, id })), enums: Object.entries(draft.enumNodes ?? {}).map(([id, item]) => ({ ...item, id })), taskMacros: draft.taskMacros, tasks: draft.tasks, slots: draft.slots, days: draft.days, weeks: draft.weeks, sequences: draft.sequences };
  function find(group, value) {
    if (value == null) return value;
    const items = Array.isArray(group) ? group : groups[group] ?? [];
    const direct = items.find((item) => item.id === value); if (direct) return direct.id;
    const matches = items.filter((item) => item.symbol === value);
    if (matches.length === 1) return matches[0].id;
    if (/^[0-9a-f]{8}-/.test(value)) return value;
    throw Object.assign(new Error(`Unknown or ambiguous name: ${value}`), { issues: [{ code: 'unknownName', path: '/command', message: `Cannot resolve ${value}.` }] });
  }
  if (c.sequenceId !== undefined) c.sequenceId = find('sequences', c.sequenceId);
  const events = draft.sequences.flatMap((sequence) => sequence.eventGroups ?? []);
  const ownerGroup = c.object.split('.')[0];
  if (c.ownerId !== undefined) c.ownerId = find(ownerGroup, c.ownerId);
  const owner = groups[ownerGroup]?.find((item) => item.id === c.ownerId);
  if (c.id !== undefined || c.name !== undefined && c.action !== 'create' && !(c.object.endsWith('.parameters') && c.action === 'add')) {
    const target = c.object === 'events' ? draft.sequences.find((item) => item.id === c.sequenceId)?.eventGroups ?? [] : c.object === 'tasks.builtins' ? project.tasks.builtins.list() : c.object.endsWith('.parameters') ? owner?.parameters ?? [] : c.object;
    if (c.id !== undefined && c.name !== undefined && find(target, c.id) !== find(target, c.name)) throw new Error('id and name refer to different objects');
    c.id = find(target, c.id ?? c.name);
    delete c.name;
  }
  for (const [field, group] of Object.entries({ dayId: 'days', slotId: 'slots', weekId: 'weeks', parentId: c.object === 'enums' ? 'enums' : 'variables' })) if (c[field] !== undefined && !(field === 'dayId' && c.action === 'setOverride' && c[field] === 'inherit')) c[field] = find(group, c[field]);
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    const refs = { reference_id: 'variables', expression_macro_id: 'expressions', target_variable_id: 'variables', task_id: 'tasks', task_macro_id: 'taskMacros', enum_id: 'enums', day_schedule_id: 'days', event_group_id: events, dayId: 'days', weekId: 'weeks', dayStartId: 'slots', dayEndId: 'slots', startId: 'slots', endId: 'slots', parent_id: c.object === 'enums' ? 'enums' : 'variables' };
    for (const [key, group] of Object.entries(refs)) if (value[key] != null) value[key] = find(group, value[key]);
    if (value.slotIds) value.slotIds = value.slotIds.map((id) => find('slots', id));
    if (value.days && !Array.isArray(value.days)) value.days = Object.fromEntries(Object.entries(value.days).map(([key, id]) => [key, find('days', id)]));
    if (value.arguments && (value.task_id || value.task_macro_id)) {
      const target = [...draft.tasks, ...draft.taskMacros].find((item) => item.id === (value.task_id ?? value.task_macro_id));
      value.arguments = Object.fromEntries(Object.entries(value.arguments).map(([key, arg]) => [find(target?.parameters ?? [], key), arg]));
    }
    if (value.type === 'parameter_reference') { const parameters = owner?.parameters ?? groups.taskMacros.find((item) => item.id === c.id)?.parameters ?? c.values?.parameters ?? []; value.parameter_id = find(parameters, value.parameter_id); }
    for (const child of Object.values(value)) walk(child);
  }
  if (c.values) {
    if (c.values.name !== undefined) { c.values.symbol = c.values.name; delete c.values.name; }
    if (c.values.parameters) c.values.parameters = c.values.parameters.map((item) => { const next = { ...item, symbol: item.name ?? item.symbol }; delete next.name; return next; });
    walk(c.values);
  }
  return c;
}
export function executeCommand(project, command) {
  const checked = inspectCommand(command);
  return checked.ok ? invoke(project, command) : checked;
}
export function executeBatch(project, commands) {
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 1000) return { ok: false, errors: [{ code: 'invalidBatch', path: '/commands', message: 'Supply 1–1000 mutation commands.' }] };
  for (const [index, command] of commands.entries()) {
    const checked = inspectCommand(command);
    if (!checked.ok) return { ...checked, errors: checked.errors.map((error) => ({ ...error, path: `/commands/${index}${error.path}` })) };
    if (!checked.mutates) return { ok: false, errors: [{ code: 'readInBatch', path: `/commands/${index}`, message: 'Atomic batches contain mutation commands only.' }] };
  }
  return compact(project.transaction((tx) => commands.map((command) => {
    const result = invoke(tx, command);
    if (!result.ok) { const error = new Error('batchCommandFailed'); error.issues = result.errors; throw error; }
    return result;
  })));
}
