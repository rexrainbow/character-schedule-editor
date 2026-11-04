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
const icon = { type: 'string', description: 'Optional offline icon: tabler:name, tabler:name|blue, tabler:name|#RRGGBB, blue or #RRGGBB. Unknown identifiers are cosmetic warnings, not import errors.' };
const metadata = { icon, description: string, display_name: { type: 'string', description: 'Optional human label. Blank displays the catalog key (persistent name).' } };
const scope = enumeration('application', 'environment');
const expr = { type: 'string', minLength: 1, maxLength: 16000, description: 'Scalar expression: literals, vars.name, expr.name(arguments), params.name, numeric arithmetic and event properties. Comparisons and ALL/ANY cannot be passed directly here; reference a Boolean expression macro instead. Double-quote string literals inside the expression. Parser/type validation is required.' };
const conditionExpr = { ...expr, description: 'Condition expression: scalar Boolean values, comparisons, and/or, ALL/ANY, including nested groups. Parser/type validation is required; errors are not false.' };
const condition = { ...nullable(conditionExpr), description: 'null is unconditional. ALL/ANY short-circuit in order; evaluation errors are not false. See ENGINE_SEMANTICS.md sections 2-3.' };
const exactlyOne = (...fields) => fields.map((field) => ({ required: [field] }));
const modeIs = (mode, defaultMode) => {
  const explicit = { properties: { mode: { const: mode } }, required: ['mode'] };
  return mode === defaultMode ? { anyOf: [{ not: { required: ['mode'] } }, explicit] } : explicit;
};
const fixedTarget = { ...symbol, description: 'Fixed variable leaf name only. Builtin targets cannot be parameter references; variable_reference parameters can be forwarded only to task/macro calls.' };
const parameterOptions = { ...array(object({ display_name: string, icon, value: string }, ['value'])), minItems: 1 };
const plainExpressionParameter = object({ ...metadata, type: enumeration('number', 'string', 'boolean') }, ['type']);
const interruptionPriority = { if: { properties: { execution: enumeration('interrupt_main', 'interrupt_lower') }, required: ['execution'] }, then: { properties: { priority: { minimum: 0 } } } };
const elseBranches = (schema) => ({ ...schema, allOf: [{ if: { minItems: 1 }, then: { contains: { type: 'object', properties: { when: { type: 'null' } }, required: ['when'] }, minContains: 1, maxContains: 1 } }], description: 'An empty action branch list is valid. Every nonempty branch list requires exactly one when:null ELSE. ELSE must be last (checked semantically); expression branches cannot be empty.' });
const weekday = enumeration('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
const nonnegative = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const argument = choice(expr, object({ variable: symbol }, ['variable']), object({ event: symbol }, ['event']), object({ current_event: { const: true } }, ['current_event']), object({ parameter: symbol }, ['parameter']));
const invocation = choice(object({ task: symbol, arguments: catalog(argument) }, ['task']), object({ macro: symbol, arguments: catalog(argument) }, ['macro']));
const eventArgument = choice(object({ event: symbol }, ['event']), object({ current_event: { const: true } }, ['current_event']), object({ parameter: symbol }, ['parameter']));
const enumArgument = (...values) => choice(enumeration(...values), object({ parameter: symbol }, ['parameter']));
const source = object({ mode: enumeration('random', 'sequential'), candidates: { ...array(object({ day: symbol, weight: { type: 'number', exclusiveMinimum: 0 } }, ['day'])), minItems: 1 } }, ['mode', 'candidates']);
source.allOf = [{ if: modeIs('sequential'), then: { properties: { candidates: { items: { properties: { weight: false } } } } } }];
const reservationSource = { ...source, properties: { ...source.properties, mode: { const: 'random' } }, description: 'Reservations accept weighted random sources only; a fixed source uses day instead. Candidate selection happens on the reserved date.' };
const execution = enumeration('overlay', 'interrupt_main', 'interrupt_lower');
const date = object({ week: { type: 'integer', minimum: 1 }, weekday }, ['week', 'weekday']);
const builtin = choice(
  object({ builtin: { const: 'set_variable' }, target: fixedTarget, value: expr }, ['builtin', 'target', 'value']),
  object({ builtin: { const: 'increment_variable' }, target: fixedTarget, value: expr, random_amplitude: expr }, ['builtin', 'target', 'value']),
  object({ builtin: enumeration('toggle_variable', 'reset_variable'), target: fixedTarget }, ['builtin', 'target']),
  object({ builtin: { const: 'adjust_probability_event' }, event: eventArgument, property: enumArgument('probability_percent', 'cooldown_days'), operation: enumArgument('set', 'increase'), value: expr }, ['builtin', 'event', 'property', 'operation', 'value']),
  { ...object({ builtin: { const: 'schedule_event' }, display_name: string, icon, date: object({ mode: enumeration('days', 'weeks_weekday'), offset: expr, weekday }, ['mode', 'offset']), day: symbol, source: reservationSource, execution, priority: { type: 'integer' } }, ['builtin', 'date']), oneOf: exactlyOne('day', 'source'), allOf: [interruptionPriority] }
);
const described = (schema) => schema.type === 'object' ? { ...schema, properties: { ...schema.properties, description: string } } : { ...schema, oneOf: schema.oneOf.map(described) };
const branch = object({ description: string, when: condition, run: ref('action') }, ['when', 'run']);
const weightedCandidate = described(choice(invocation, builtin));
function addWeight(schema) { if (schema.type !== 'object') schema.oneOf.forEach(addWeight); else schema.properties.weight = expr; }
addWeight(weightedCandidate);
const commonLogic = { ...metadata, mode: enumeration('sequence', 'branch', 'priority', 'random'), parameters: catalog(ref('parameter')), eligibility: condition, steps: array(ref('step')), branches: elseBranches(array(branch)), candidates: array(ref('weightedCandidate')), fallback: nullable(ref('step')) };
const defs = {
  scalarExpression: expr, conditionExpression: conditionExpr, action: choice(invocation, builtin), invocation, step: described(choice(invocation, builtin)), candidate: described(invocation.oneOf[1]), weightedCandidate,
  parameter: choice(
    object({ ...metadata, type: enumeration('number', 'string', 'boolean') }, ['type']),
    object({ ...metadata, type: { const: 'variable_reference' }, value_type: enumeration('number', 'string', 'boolean', 'any'), access: enumeration('read', 'write', 'read_write') }, ['type', 'value_type', 'access']),
    object({ ...metadata, type: { const: 'event_reference' }, event_kind: enumeration('any', 'probability') }, ['type', 'event_kind']),
    { ...object({ ...metadata, type: { const: 'enum' }, enum: symbol, options: parameterOptions }, ['type']), oneOf: exactlyOne('enum', 'options') },
  ),
  expressionParameter: plainExpressionParameter,
  variable: object({ ...metadata, scope, kind: enumeration('group', 'value'), parent: nullable(symbol), order: nonnegative, type: enumeration('number', 'string', 'boolean'), initial: { type: ['number', 'string', 'boolean'] }, min: number, max: number, integer: boolean, read_only: boolean }),
  enum: object({ ...metadata, scope, kind: enumeration('group', 'enum'), parent: nullable(symbol), order: nonnegative, options: array(object({ display_name: string, icon, value: string }, ['value'])) }),
  computed: object({ ...metadata, scope, type: enumeration('number', 'string', 'boolean', 'any'), parameters: catalog(object({ ...metadata, type: enumeration('number', 'string', 'boolean', 'any'), variadic: boolean }, ['type'])), builtin: enumeration('randomRange', 'randomItem'), value: expr, branches: elseBranches({ ...array(object({ description: string, when: condition, value: expr }, ['when', 'value'])), minItems: 1 }) }, ['type']),
  macro: object(commonLogic),
  slot: object({ ...metadata, mode: enumeration('branch', 'priority'), branches: elseBranches(array(branch)), candidates: array(ref('candidate')) }),
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
defs.macro.description = 'Sequence, branch, priority or weighted random macro. Random evaluates arguments/eligibility, then eligible weights, then draws once; fallback runs only if the pool is empty. See ENGINE_SEMANTICS.md section 3.';
defs.macro.properties.mode.default = 'sequence';
defs.macro.allOf = ['sequence', 'branch', 'priority', 'random'].map((mode) => ({
  if: modeIs(mode, 'sequence'), then: { properties: {
    ...Object.fromEntries(['steps', 'branches', 'candidates', 'fallback'].filter((field) => !({ sequence: ['steps'], branch: ['branches'], priority: ['candidates'], random: ['candidates', 'fallback'] })[mode].includes(field)).map((field) => [field, false])),
    ...(mode === 'priority' ? { candidates: array(ref('candidate')) } : {}),
  } },
}));
defs.slot.allOf = [{ if: modeIs('priority'), then: { properties: { branches: false } }, else: { properties: { candidates: false } } }];
defs.computed.oneOf = exactlyOne('value', 'branches', 'builtin');
defs.computed.properties.value = { ...expr, description: 'Return expression: Boolean definitions use conditionExpression; number/string definitions use scalarExpression.' };
defs.computed.properties.branches.items.properties.value = defs.computed.properties.value;
defs.computed.allOf = [{ if: { properties: { type: { const: 'boolean' } }, required: ['type'] }, then: { properties: { value: conditionExpr, branches: { items: { properties: { value: conditionExpr } } } } } }];
defs.computed.allOf.push({
  if: { required: ['builtin'] }, then: {
    required: ['scope', 'parameters'], properties: { scope: { const: 'environment' } },
    allOf: [
      { if: { properties: { builtin: { const: 'randomItem' } } }, then: { properties: { type: { const: 'any' }, parameters: { ...catalog(object({ ...metadata, type: { const: 'any' }, variadic: { const: true } }, ['type', 'variadic'])), minProperties: 1, maxProperties: 1 } } } },
      { if: { properties: { builtin: { const: 'randomRange' } } }, then: { properties: { type: { const: 'number' }, parameters: { ...catalog(object({ ...metadata, type: { const: 'number' } }, ['type'])), minProperties: 2, maxProperties: 2 } } } },
    ],
  }, else: { properties: { type: enumeration('number', 'string', 'boolean'), parameters: catalog(ref('expressionParameter')) } },
});
defs.variable.allOf = [{ if: { properties: { kind: { const: 'group' } }, required: ['kind'] }, then: { properties: Object.fromEntries(['type', 'initial', 'min', 'max', 'integer', 'read_only'].map((field) => [field, false])) } }];
defs.variable.allOf.push(...['number', 'string', 'boolean'].map((type) => ({
  if: { properties: { type: { const: type } }, ...(type === 'number' ? {} : { required: ['type'] }) },
  then: { properties: { initial: { type }, ...(type === 'number' ? {} : { min: false, max: false, integer: false }) } },
})));
defs.variable.allOf.push({ if: { properties: { integer: { const: true } }, required: ['integer'] }, then: { properties: { initial: { type: 'integer' }, min: { type: 'integer' }, max: { type: 'integer' } } } });
defs.enum.allOf = [{ if: { properties: { kind: { const: 'group' } }, required: ['kind'] }, then: { properties: { options: false } }, else: { required: ['options'], properties: { options: { minItems: 1 } } } }];
defs.day.allOf = [{ if: { properties: { scope: { const: 'week_private' } }, required: ['scope'] }, then: { required: ['owner'] }, else: { properties: { owner: false } } }];
defs.event.oneOf = exactlyOne('day', 'source');
defs.event.properties.count = choice(
  object({ kind: { const: 'all' } }, ['kind']),
  object({ kind: { const: 'day' }, day: symbol }, ['kind', 'day']),
  object({ kind: { const: 'tag' }, tag: { type: 'string', minLength: 1 } }, ['kind', 'tag']),
);
defs.event.allOf = ['once', 'periodic', 'probability'].map((kind) => ({
  if: { properties: { kind: { const: kind } }, required: ['kind'] }, then: {
    ...(kind === 'once' ? {} : { required: kind === 'periodic' ? ['end', 'every'] : ['end', 'probability', 'cooldown_days'] }),
    properties: Object.fromEntries((kind === 'once' ? ['end', 'every', 'probability', 'cooldown_days', 'count'] : kind === 'periodic' ? ['probability', 'cooldown_days'] : ['every']).map((field) => [field, false])),
  },
}));
defs.event.allOf.push(interruptionPriority);
defs.sequence.properties.weeks.description = 'Ordered sequence entry points. repeat:null is infinite and may appear only on the last row; final-position validation is semantic. At most one infinite row is allowed.';
defs.sequence.properties.weeks.contains = { type: 'object', properties: { repeat: { type: 'null' } }, required: ['repeat'] };
defs.sequence.properties.weeks.minContains = 0;
defs.sequence.properties.weeks.maxContains = 1;
defs.sequence.properties.overrides.description = 'Within each sequence, (week, weekday) must be unique even if day values are identical. Duplicate positions are rejected semantically, never resolved by first/last entry wins.';
// A weekday is meaningful and required only in the week-relative reservation mode.
const reservationDate = builtin.oneOf.at(-1).properties.date;
reservationDate.allOf = [{ if: modeIs('weeks_weekday'), then: { required: ['weekday'] }, else: { properties: { weekday: false } } }];
reservationDate.properties.offset = { ...expr, description: 'Numeric expression evaluated to a finite safe integer, with no rounding/truncation. Minimum is 1 for days, 0 for weeks_weekday. Literal constraints are checked on import; computed offsets are checked at runtime. The resulting date must be strictly in the future and inside the executing sequence.' };
defs.computed.description = 'Parameterized number/string/Boolean expression with its own local parameters. Calls use expr.name(arguments), evaluate arguments once in declaration order, then evaluate only the selected result. Environment builtins randomRange/randomItem use seeded randomness. Parameter keys may be renamed: randomRange uses the first declared parameter as lower bound and second as upper bound, independent of their names. any/variadic are reserved for randomItem. See EXPRESSION_FUNCTIONS.md.';
defs.variable.properties.initial.description = 'Constant validated before runtime creation. Default reset baseline comes from Program initial values; simulation input overrides do not redefine it.';
defs.variable.properties.integer = { ...boolean, description: 'Writes truncate toward zero, then clamp to optional min/max. When true, initial and any min/max must already be integers; fractional bounds are invalid definitions. Intermediate arithmetic is not truncated.' };
defs.variable.properties.min = { ...number, description: 'Optional inclusive lower bound applied on every successful write, not once at macro/day end.' };
defs.variable.properties.max = { ...number, description: 'Optional inclusive upper bound applied on every successful write, after integer truncation.' };
defs.event.properties.priority.description = 'Execution order is descending; nonnegative events precede the main day, negatives follow. Ties retain declaration order. Interruption targets are defined by execution, not priority alone.';
defs.event.properties.cooldown_days = { ...nonnegative, description: 'After occurrence, skip this many subsequent eligible dates. Ineligible dates do not consume cooldown; changes to this setting do not rewrite remaining cooldown.' };
export const blueprintSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Character Schedule Blueprint',
  description: 'Declarative rebuild input/output without UUIDs, with optional display icons. Omitted collections are empty. Import rebuilds and replaces the entire project content in the current workspace, allocating new UUIDs; it does not merge or retain a separate old project. Expressions require parser and semantic validation. Execution contract: ../../docs/ENGINE_SEMANTICS.md or MCP schedule://guide/engine-semantics.',
  $comment: 'This Schema specifies structure, not the complete engine. Read ENGINE_SEMANTICS.md for selection, evaluation, priority, writes, interruption, reset and checkpoint behavior.',
  ...object({ project: object({ name: string, slots_per_day: { type: 'integer', minimum: 1, default: 3 } }), environment: object({ name: string, version: string, icon }), variables: catalog(ref('variable')), expressions: catalog(ref('computed')), tasks: catalog(object({ ...metadata, parameters: catalog(ref('parameter')) })), task_macros: catalog(ref('macro')), slots: catalog(ref('slot')), days: catalog(ref('day')), weeks: catalog(ref('week')), sequences: catalog(ref('sequence')), enums: catalog(ref('enum')), builtins: object(Object.fromEntries(['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable', 'release_slot', 'adjust_probability_event', 'schedule_event'].map((key) => [key, object({ ...metadata, name: symbol, parameter_names: { type: 'object', additionalProperties: string }, parameter_icons: { type: 'object', additionalProperties: icon }, parameter_option_icons: { type: 'object', additionalProperties: { type: 'object', additionalProperties: icon } }, parameter_descriptions: { type: 'object', additionalProperties: string }, parameter_symbols: { type: 'object', additionalProperties: symbol } })]))) }),
  $defs: defs,
};
