// Domain input contract, intentionally separate from project persistence schemas.
const string = { type: 'string' }, number = { type: 'number' }, boolean = { type: 'boolean' };
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const array = (items) => ({ type: 'array', items });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const choice = (...schemas) => ({ oneOf: schemas });
const enumeration = (...values) => ({ enum: values });
const symbol = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$', description: 'Persistent name, unique within its object type. Blueprint references and engine contracts use this name; never a UUID.' };
const catalog = (items) => ({ type: 'object', propertyNames: symbol, additionalProperties: items });
const metadata = { description: string, display_name: { type: 'string', description: 'Optional human label. Blank displays the catalog key (persistent name).' } };
const scope = enumeration('application', 'environment');
const expr = { type: 'string', minLength: 1, maxLength: 16000, description: 'Restricted expression: vars.symbol, expr.symbol, params.symbol, literals, + - * /, comparisons, and/or, ALL/ANY. Double-quote string literals inside this expression.' };
const condition = { ...nullable(expr), description: 'null is unconditional. ALL/ANY short-circuit in order; evaluation errors are not false. See ENGINE_SEMANTICS.md sections 2-3.' };
const weekday = enumeration('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
const nonnegative = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const argument = choice(expr, object({ variable: symbol }, ['variable']), object({ event: symbol }, ['event']), object({ current_event: { const: true } }, ['current_event']), object({ parameter: symbol }, ['parameter']));
const invocation = choice(object({ task: symbol, arguments: catalog(argument) }, ['task']), object({ macro: symbol, arguments: catalog(argument) }, ['macro']));
const eventArgument = choice(object({ event: symbol }, ['event']), object({ current_event: { const: true } }, ['current_event']), object({ parameter: symbol }, ['parameter']));
const enumArgument = choice(string, object({ parameter: symbol }, ['parameter']));
const source = object({ mode: enumeration('random', 'sequential'), candidates: { ...array(object({ day: symbol, weight: { type: 'number', exclusiveMinimum: 0 } }, ['day'])), minItems: 1 } }, ['mode', 'candidates']);
const execution = enumeration('overlay', 'interrupt_main', 'interrupt_lower');
const date = object({ week: { type: 'integer', minimum: 1 }, weekday }, ['week', 'weekday']);
const builtin = choice(
  object({ builtin: enumeration('set_variable', 'increment_variable'), target: symbol, value: expr, random_amplitude: expr }, ['builtin', 'target', 'value']),
  object({ builtin: enumeration('toggle_variable', 'reset_variable'), target: symbol }, ['builtin', 'target']),
  object({ builtin: { const: 'adjust_probability_event' }, event: eventArgument, property: enumArgument, operation: enumArgument, value: expr }, ['builtin', 'event', 'property', 'operation', 'value']),
  object({ builtin: { const: 'schedule_event' }, display_name: string, date: object({ mode: enumeration('days', 'weeks_weekday'), offset: expr, weekday }, ['mode', 'offset']), day: symbol, source, execution, priority: { type: 'integer' } }, ['builtin', 'date'])
);
const described = (schema) => schema.oneOf ? { ...schema, oneOf: schema.oneOf.map(described) } : { ...schema, properties: { ...schema.properties, description: string } };
const branch = object({ description: string, when: condition, run: ref('action') }, ['when', 'run']);
const commonLogic = { ...metadata, mode: enumeration('sequence', 'branch', 'priority'), parameters: catalog(ref('parameter')), eligibility: condition, steps: array(ref('step')), branches: array(branch), candidates: array(ref('candidate')) };
const defs = {
  expression: expr, action: choice(invocation, builtin), invocation, step: described(choice(invocation, builtin)), candidate: described(invocation),
  parameter: object({ ...metadata, type: enumeration('number', 'string', 'boolean', 'variable_reference', 'event_reference', 'enum'), value_type: enumeration('number', 'string', 'boolean', 'any'), access: enumeration('read', 'write', 'read_write'), event_kind: enumeration('any', 'probability'), options: array(object({ display_name: string, value: string }, ['value'])), enum: symbol }, ['type']),
  variable: object({ ...metadata, scope, kind: enumeration('group', 'value'), parent: nullable(symbol), order: nonnegative, type: enumeration('number', 'string', 'boolean'), initial: { type: ['number', 'string', 'boolean'] }, min: number, max: number, integer: boolean, read_only: boolean }),
  enum: object({ ...metadata, scope, kind: enumeration('group', 'enum'), parent: nullable(symbol), order: nonnegative, options: array(object({ display_name: string, value: string }, ['value'])) }),
  computed: object({ ...metadata, scope, type: enumeration('number', 'boolean'), value: expr, branches: { ...array(object({ description: string, when: condition, value: expr }, ['when', 'value'])), minItems: 1 } }, ['type']),
  macro: object(commonLogic),
  slot: object({ ...metadata, mode: enumeration('branch', 'priority'), branches: array(branch), candidates: array(ref('candidate')) }),
  day: object({ ...metadata, scope: enumeration('shared', 'week_private'), owner: object({ week: symbol, weekday }, ['week', 'weekday']), slots: array(nullable(symbol)), start: nullable(symbol), end: nullable(symbol), hooks: array(object({ start: nullable(symbol), end: nullable(symbol) })), releases: array(nullable(object({ when: condition }))), tags: array(string), purposes: array(enumeration('main', 'overlay', 'interrupt')) }),
  week: object({ ...metadata, days: object(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, nullable(symbol)]))) }),
  event: object({ ...metadata, kind: enumeration('once', 'periodic', 'probability'), day: symbol, source, start: date, end: date, every: { type: 'integer', minimum: 1 }, probability: { type: 'number', minimum: 0, maximum: 100 }, cooldown_days: nonnegative, count: object({ kind: enumeration('all', 'day', 'tag'), day: symbol, tag: string }, ['kind']), execution, priority: { type: 'integer' } }, ['kind', 'start']),
  sequence: object({ ...metadata, weeks: array({ oneOf: [symbol, object({ week: symbol, repeat: { type: ['integer', 'null'], minimum: 1 } }, ['week', 'repeat'])] }), overrides: array(object({ week: { type: 'integer', minimum: 1 }, weekday, day: nullable(symbol) }, ['week', 'weekday', 'day'])), start_weekday: weekday, end_weekday: weekday, events: catalog(ref('event')) }),
};
// Syntax annotations point to one canonical execution contract; they do not replace semantic validation.
source.description = 'Choose one day per event occurrence, before day execution. Random uses relative positive weights; sequential advances on occurrence even if later blocked. See ENGINE_SEMANTICS.md section 6.';
execution.description = 'Per-slot behavior: overlay, interrupt_main, or interrupt_lower (strictly lower event priority plus main). Daily start/end are not blocked. See ENGINE_SEMANTICS.md sections 7-8.';
branch.description = 'Select the first matching branch. A selected action whose macro eligibility is false does not fall through to ELSE.';
defs.candidate.description = 'Priority candidates must call macros. Evaluate arguments then eligibility; first qualified candidate wins, including an empty macro. Later candidates are not evaluated.';
defs.macro.description = 'Sequence, branch or priority macro; eligibility is checked after argument evaluation. Empty content is valid. See ENGINE_SEMANTICS.md section 3.';
defs.computed.description = 'Evaluated against current state on every reference. Branches return only the first matching result; no state storage or implicit accumulation.';
defs.variable.properties.initial.description = 'Constant validated before runtime creation. Default reset baseline comes from Program initial values; simulation input overrides do not redefine it.';
defs.variable.properties.integer = { ...boolean, description: 'Writes truncate toward zero, then clamp to optional min/max. Intermediate arithmetic is not truncated. Initial values must already satisfy integer constraints.' };
defs.variable.properties.min = { ...number, description: 'Optional inclusive lower bound applied on every successful write, not once at macro/day end.' };
defs.variable.properties.max = { ...number, description: 'Optional inclusive upper bound applied on every successful write, after integer truncation.' };
defs.event.properties.priority.description = 'Execution order is descending; nonnegative events precede the main day, negatives follow. Ties retain declaration order. Interruption targets are defined by execution, not priority alone.';
defs.event.properties.cooldown_days = { ...nonnegative, description: 'After occurrence, skip this many subsequent eligible dates. Ineligible dates do not consume cooldown; changes to this setting do not rewrite remaining cooldown.' };
export const blueprintSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Character Schedule Blueprint',
  description: 'Declarative rebuild input/output without UUIDs or icons. Omitted collections are empty. Import creates a new project, not a merge. Expressions require parser and semantic validation. Execution contract: ../../docs/ENGINE_SEMANTICS.md or MCP schedule://guide/engine-semantics.',
  $comment: 'This Schema specifies structure, not the complete engine. Read ENGINE_SEMANTICS.md for selection, evaluation, priority, writes, interruption, reset and checkpoint behavior.',
  ...object({ project: object({ name: string, slots_per_day: { type: 'integer', minimum: 1, default: 3 } }), environment: object({ name: string, version: string }), variables: catalog(ref('variable')), expressions: catalog(ref('computed')), tasks: catalog(object({ ...metadata, parameters: catalog(ref('parameter')) })), task_macros: catalog(ref('macro')), slots: catalog(ref('slot')), days: catalog(ref('day')), weeks: catalog(ref('week')), sequences: catalog(ref('sequence')), enums: catalog(ref('enum')), builtins: object(Object.fromEntries(['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable', 'release_slot', 'adjust_probability_event', 'schedule_event'].map((key) => [key, object({ ...metadata, name: symbol, parameter_names: { type: 'object', additionalProperties: string }, parameter_descriptions: { type: 'object', additionalProperties: string }, parameter_symbols: { type: 'object', additionalProperties: symbol } })]))) }),
  $defs: defs,
};
