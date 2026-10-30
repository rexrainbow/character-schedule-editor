import source from '../schemas/slots.schema.json' with { type: 'json' };

const defs = structuredClone(source.$defs);
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items) => ({ type: 'array', items });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const text = { type: 'string' }, name = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' };
const token = { type: 'string', minLength: 1 };
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekday = { enum: weekdays };
const metadata = { name, display_name: text };
const entity = (properties, required) => object({ ...metadata, ...properties }, ['name', ...required]);
const dictionary = (schema) => ({ type: 'object', propertyNames: token, additionalProperties: schema });

// Shared ASTs use Program-local name/UUID tokens rather than project-only UUIDs.
defs.uuid = token;
function stripEditorFields(value) {
  if (!value || typeof value !== 'object') return;
  if (value.properties) for (const field of ['icon', 'description', 'uid']) delete value.properties[field];
  if (value.required) value.required = value.required.filter((field) => !['icon', 'description', 'uid'].includes(field));
  Object.values(value).forEach(stripEditorFields);
}
stripEditorFields(defs);
function renameFields(value, names) {
  if (!value || typeof value !== 'object') return;
  if (value.properties) value.properties = Object.fromEntries(Object.entries(value.properties).map(([key, item]) => [names[key] ?? key, item]));
  if (value.required) value.required = value.required.map((key) => names[key] ?? key);
  Object.values(value).forEach((child) => renameFields(child, names));
}
renameFields(defs.day_schedule, { slot_ids: 'slotIds', day_start_slot_id: 'dayStartId', day_end_slot_id: 'dayEndId', slot_events: 'slotEvents', start_slot_id: 'startId', end_slot_id: 'endId', slot_releases: 'slotReleases' });
defs.day_schedule.properties.tags.description = 'Tags preserved in executable days and used by event count filters.';
renameFields(defs.sequence_event_date, { week_number: 'week' });
// Resolved enum parameters carry both their enum reference and concrete options.
defs.task_parameter.allOf = defs.task_parameter.allOf.filter((rule) => rule.if?.properties?.type?.const !== 'enum');
defs.task_parameter.allOf.push({ if: { properties: { type: { const: 'enum' } } }, then: { required: ['options'] }, else: { not: { anyOf: [{ required: ['options'] }, { required: ['enum_id'] }] } } });
defs.runtime_count = { oneOf: [object({ kind: { const: 'all' } }), object({ kind: { const: 'day' }, day_schedule_id: token }), object({ kind: { const: 'tag' }, tag: { type: 'string', minLength: 1 } })] };
defs.runtime_event = entity({
  id: token, kind: { enum: ['once', 'periodic', 'probability'] }, dayId: text,
  start: ref('sequence_event_date'), end: ref('sequence_event_date'), interval: { type: 'integer', minimum: 0 },
  priority: { type: 'integer' }, executionMode: { enum: ['overlay', 'interrupt_main', 'interrupt_lower'] },
  sourceMode: { enum: ['fixed', 'random', 'sequential'] },
  dayCandidates: { ...array(object({ dayId: token, weight: { type: 'number', exclusiveMinimum: 0 } }, ['dayId'])), minItems: 1 },
  countFilter: ref('runtime_count'), probability_percent: { type: 'number', minimum: 0, maximum: 100 }, cooldown_days: { type: 'integer', minimum: 0 },
}, ['id', 'kind', 'start', 'priority']);
defs.runtime_event.allOf = [
  { if: { properties: { sourceMode: { enum: ['random', 'sequential'] } }, required: ['sourceMode'] }, then: { required: ['dayCandidates'] }, else: { required: ['dayId'], properties: { dayId: token } } },
  { if: { properties: { kind: { const: 'periodic' } } }, then: { required: ['end', 'interval'], properties: { interval: { minimum: 1 } } } },
  { if: { properties: { kind: { const: 'probability' } } }, then: { required: ['end', 'probability_percent', 'cooldown_days'] } },
];
defs.runtime_row = object({ weekId: token, repeatCount: { type: ['integer', 'null'], minimum: 1 }, overrides: object(Object.fromEntries(weekdays.map((day) => [day, nullable(token)])), []) });
defs.runtime_sequence = entity({ rows: array(ref('runtime_row')), startWeekday: weekday, endWeekday: weekday, eventGroups: array(ref('runtime_event')) }, ['rows', 'eventGroups']);
const builtin = object({ symbol: name, display_name: text, parameters: { type: 'object', additionalProperties: object({ symbol: name, display_name: text }, []) } }, []);
const schema = {
  $schema: source.$schema, title: 'Character Schedule Runtime Program',
  description: 'Executable Program JSON for Program.fromJSON(), shared by GUI/API/MCP exports and runtime hosts. Semantic references, types and execution constraints also require Program validation.',
  ...object({ format: { const: 'schedule-runtime-program' }, referenceMode: { enum: ['name', 'uuid'] }, display_name: text,
    settings: ref('project_settings'), builtins: object(Object.fromEntries(['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable', 'release_slot', 'adjust_probability_event', 'schedule_event'].map((key) => [key, builtin])), []),
    variables: dictionary(ref('operand_node')), expressions: dictionary(ref('expression_macro')), enums: dictionary(ref('enum_definition_node')),
    tasks: dictionary(ref('task_definition')), macros: dictionary(ref('task_macro')), slots: dictionary(ref('slot')),
    days: dictionary(ref('day_schedule')), weeks: dictionary(ref('week_schedule')), sequences: dictionary(ref('runtime_sequence')),
  }, ['format', 'referenceMode', 'settings', 'builtins', 'variables', 'expressions', 'enums', 'tasks', 'macros', 'slots', 'days', 'weeks', 'sequences']),
};
const used = new Set();
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref?.startsWith('#/$defs/')) {
    const key = value.$ref.slice(8);
    if (!used.has(key)) { used.add(key); if (!defs[key]) throw new Error(`Missing definition: ${key}`); visit(defs[key]); }
  }
  Object.values(value).forEach(visit);
}
visit(schema); schema.$defs = Object.fromEntries([...used].map((key) => [key, defs[key]]));
export const runtimeProgramSchema = schema;
