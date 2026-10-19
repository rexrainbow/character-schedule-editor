import fs from 'node:fs';
const source = JSON.parse(fs.readFileSync(new URL('../src/schemas/slots.schema.json', import.meta.url), 'utf8'));
const defs = structuredClone(source.$defs);
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const arr = (items) => ({ type: 'array', items });
const dictionary = (name) => ({ type: 'object', propertyNames: ref('uuid'), additionalProperties: ref(name) });
const text = { type: 'string' }, key = { type: 'string', minLength: 1, pattern: '\\S' };
const metadata = { display_name: text, engine_key: key };
const entity = (properties, required) => obj({ ...metadata, ...properties }, ['display_name', ...required]);
defs.environment_reference = obj({ type: { const: 'environment_reference' }, engine_key: key });
for (const name of ['operand', 'numeric_operand', 'scoped_operand', 'scoped_numeric_operand']) {
  if (!defs[name]) throw new Error(`Missing shared expression definition ${name}`);
  defs[name].oneOf.push(ref('environment_reference'));
}
defs.runtime_variable_reference = { oneOf: [obj({ type: { const: 'variable_reference' }, reference_id: ref('uuid') }), obj({ type: { const: 'variable_reference' }, engine_key: key })] };
defs.runtime_argument = { oneOf: [ref('scoped_operand'), ref('runtime_variable_reference'), ref('event_reference'), ref('current_event_reference')] };
defs.scoped_task_macro_use.properties.arguments.additionalProperties = ref('runtime_argument');
defs.runtime_task = obj({ task_key: key, arguments: arr(ref('runtime_argument')) });
defs.runtime_assignment = obj({ task_key: key, target: { oneOf: [ref('reference_operand'), ref('environment_reference')] }, value: ref('scoped_operand'), random_amplitude: structuredClone(defs.scoped_set_variable.properties.random_amplitude) }, ['task_key', 'target', 'value']);
defs.runtime_target_operation = obj({ task_key: key, target: { oneOf: [ref('reference_operand'), ref('environment_reference')] } });
defs.runtime_flow_control = obj({ task_key: key, flow_control: { const: 'takeover' }, condition: ref('scoped_condition'), scope: { enum: ['slot', 'day'] }, target: { enum: ['main', 'lower_priority'] } });
defs.runtime_event_adjustment = obj({ task_key: key, event_operation: { const: 'adjust_probability' }, event: ref('event_argument'), property: structuredClone(defs.adjust_probability_event.properties.property), operation: structuredClone(defs.adjust_probability_event.properties.operation), value: ref('scoped_numeric_operand') });
defs.runtime_action = { oneOf: [ref('runtime_task'), ref('runtime_assignment'), ref('runtime_target_operation'), ref('runtime_flow_control'), ref('runtime_event_adjustment'), ref('scoped_task_macro_use')] };
defs.runtime_step = { oneOf: [ref('runtime_task'), ref('runtime_assignment'), ref('runtime_target_operation'), ref('runtime_flow_control'), ref('runtime_event_adjustment'), ref('scoped_task_macro_use')] };
defs.runtime_branch = obj({ condition: { oneOf: [ref('scoped_condition'), { type: 'null' }] }, task: ref('runtime_action') });
defs.runtime_slot = { oneOf: [entity({ branches: arr(ref('runtime_branch')) }, ['branches']), entity({ mode: { const: 'priority' }, candidates: arr(ref('scoped_task_macro_use')) }, ['mode', 'candidates'])] };
defs.runtime_expression = entity({ value_type: { enum: ['number', 'boolean'] }, definition: ref('computed_definition') }, ['value_type', 'definition']);
defs.runtime_expression.allOf = structuredClone(defs.expression_macro.allOf);
defs.runtime_macro = { oneOf: [
  entity({ parameters: arr(ref('task_parameter')), mode: { const: 'sequence' }, steps: arr(ref('runtime_step')) }, ['parameters', 'mode', 'steps']),
  entity({ parameters: arr(ref('task_parameter')), mode: { const: 'branch' }, branches: arr(ref('runtime_branch')) }, ['parameters', 'mode', 'branches']),
  entity({ parameters: arr(ref('task_parameter')), mode: { const: 'priority' }, candidates: arr(ref('scoped_task_macro_use')) }, ['parameters', 'mode', 'candidates']),
] };
for (const variant of defs.runtime_macro.oneOf) variant.properties.eligibility = { oneOf: [ref('scoped_condition'), { type: 'null' }] };
defs.variable_tree = { oneOf: [
  entity({ id: ref('uuid'), kind: { const: 'group' }, children: arr(ref('variable_tree')) }, ['id', 'kind', 'children']),
  entity({ id: ref('uuid'), kind: { const: 'value' }, value_type: { enum: ['number', 'string', 'boolean'] }, read_only: { type: 'boolean' }, initial_value: { type: ['number', 'string', 'boolean'] }, min_value: { type: 'number' }, max_value: { type: 'number' }, integer_only: { type: 'boolean' } }, ['id', 'kind', 'value_type', 'read_only', 'initial_value']),
] };
defs.variable_tree.oneOf[1].allOf = structuredClone(defs.value_node.allOf);
defs.environment_variable_tree = structuredClone(defs.variable_tree);
defs.environment_variable_tree.oneOf[0].properties.children = arr(ref('environment_variable_tree'));
defs.environment_variable_tree.oneOf[1].required.push('engine_key');

defs.runtime_day = entity({ slot_ids: arr({ oneOf: [ref('uuid'), { type: 'null' }] }) }, ['slot_ids']);
defs.runtime_day.properties.tags = structuredClone(source.$defs.day_schedule.properties.tags);
for (const name of ['day_start_slot_id', 'day_end_slot_id', 'slot_events']) defs.runtime_day.properties[name] = structuredClone(source.$defs.day_schedule.properties[name]);
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
defs.runtime_week = entity({ days: obj(Object.fromEntries(weekdays.map((day) => [day, { oneOf: [ref('uuid'), { type: 'null' }, ref('runtime_day')] }]))) }, ['days']);
defs.runtime_sequence = entity({ start_weekday: { enum: weekdays }, end_weekday: { enum: weekdays }, entries: arr(obj({ week_id: ref('uuid'), day_overrides: obj(Object.fromEntries(weekdays.map((day) => [day, { oneOf: [ref('uuid'), { type: 'null' }] }])), []) })) }, ['start_weekday', 'end_weekday', 'entries']);
defs.runtime_sequence.properties.event_groups = structuredClone(source.$defs.week_sequence.properties.event_groups);
for (const variant of defs.sequence_event_group.oneOf) {
  variant.required.push('display_name'); variant.properties.display_name.minLength = 1; variant.properties.engine_key = key; delete variant.properties.icon;
}
defs.variable_requirement = obj({ ...metadata, value_type: { enum: ['number', 'string', 'boolean'] }, read_only: { type: 'boolean' }, access: { enum: ['read', 'write', 'read_write'] } });
defs.variable_requirement.properties.integer_only = { type: 'boolean' };
defs.variable_requirement.allOf = [{ if: { properties: { value_type: { const: 'number' } } }, else: { not: { required: ['integer_only'] } } }];

defs.runtime_parameter_requirement = structuredClone(defs.task_parameter);
delete defs.runtime_parameter_requirement.properties.id;
defs.runtime_parameter_requirement.required = defs.runtime_parameter_requirement.required.filter((key) => key !== 'id');
defs.runtime_parameter_requirement.properties.type.enum.push('expression');
defs.task_requirement = obj({ ...metadata, parameters: arr(ref('runtime_parameter_requirement')) });
const schema = { $schema: source.$schema, title: 'Character Schedule Runtime Data Schema', description: 'Runtime data v1. References, types, dependency contracts, ELSE ordering, scopes and cell counts also require compiler validation.', ...obj({
  format_version: { const: 1 }, display_name: text, settings: obj({ slots_per_day: { type: 'integer', minimum: 1 } }),
  environment_requirements: obj({ variables: arr(ref('variable_requirement')), tasks: arr(ref('task_requirement')), environment: ref('environment_info') }, ['variables', 'tasks']),
  environment_variables: arr(ref('environment_variable_tree')), application_variables: arr(ref('variable_tree')), expression_macros: dictionary('runtime_expression'), task_macros: dictionary('runtime_macro'),
  slots: dictionary('runtime_slot'), days: dictionary('runtime_day'), weeks: dictionary('runtime_week'), sequences: dictionary('runtime_sequence'),
  enum_definitions: { type: 'object', propertyNames: ref('uuid'), additionalProperties: entity({ scope: { enum: ['environment', 'application'] }, options: structuredClone(defs.task_parameter.properties.options) }, ['scope', 'options']) },
  exports: { type: 'object', propertyNames: key, additionalProperties: obj({ kind: { enum: ['operands', 'expressions', 'taskMacros', 'slots', 'days', 'weeks', 'sequences', 'enums'] }, id: ref('uuid') }) },
}) };
// Keep this standalone schema limited to definitions actually used by runtime data.
schema.properties.exports.additionalProperties.properties.kind.enum.push('eventGroups');
schema.properties.exports.additionalProperties.properties.sequence_id = ref('uuid');
schema.properties.exports.additionalProperties.allOf = [{ if: { properties: { kind: { const: 'eventGroups' } } }, then: { required: ['sequence_id'] } }];
const used = new Set();
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref?.startsWith('#/$defs/')) {
    const name = value.$ref.slice(8);
    if (!used.has(name)) { if (!defs[name]) throw new Error(`Missing ${name}`); used.add(name); visit(defs[name]); }
  }
  for (const child of Object.values(value)) visit(child);
}
visit(schema); schema.$defs = Object.fromEntries([...used].map((name) => [name, defs[name]]));
fs.writeFileSync(new URL('../src/schemas/runtime.schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');
