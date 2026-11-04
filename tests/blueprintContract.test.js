import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { blueprintSchema, importBlueprint } from '../src/core/blueprint/index.js';
import { scheduledPosition } from '../src/core/scheduledEvents.js';
import { Program, Runtime } from '../src/runtime/index.js';

const validate = new Ajv2020({ strict: false }).compile(blueprintSchema);
const imported = (value) => importBlueprint(JSON.stringify(value));
function invalid(value) {
  assert.equal(validate(value), false, JSON.stringify(value));
  assert.ok(imported(value).errors.length, 'Importer must reject the same invalid structure');
}
const call = { macro: 'm' }, daySource = { mode: 'random', candidates: [{ day: 'd' }] };
const event = { kind: 'once', start: { week: 1, weekday: 'mon' }, day: 'd' };
const reserve = { builtin: 'schedule_event', date: { mode: 'days', offset: '1' }, day: 'd' };
const action = (run) => ({ days: { d: {} }, slots: { s: { branches: [{ when: null, run }] } } });

test('priority candidates call macros exclusively; weighted random retains tasks and builtins', () => {
  for (const candidate of [{ task: 't' }, { builtin: 'reset_variable', target: 'n' }, { ...call, weight: '1' }]) {
    invalid({ slots: { s: { mode: 'priority', candidates: [candidate] } } });
    invalid({ task_macros: { m: { mode: 'priority', candidates: [candidate] } } });
  }
  for (const candidate of [{ task: 't', weight: '1' }, { builtin: 'reset_variable', target: 'n', weight: '2' }, call]) {
    assert.equal(validate({ task_macros: { m: { mode: 'random', candidates: [candidate] } } }), true);
  }
});

test('mode-specific fields reject contradictory content even when arrays are empty', () => {
  const fields = ['steps', 'branches', 'candidates', 'fallback'];
  const allowed = { sequence: ['steps'], branch: ['branches'], priority: ['candidates'], random: ['candidates', 'fallback'] };
  for (const mode of [undefined, ...Object.keys(allowed)]) for (const field of fields) {
    const definition = { ...(mode ? { mode } : {}), [field]: field === 'fallback' ? null : [] };
    if (allowed[mode ?? 'sequence'].includes(field)) assert.equal(validate({ task_macros: { m: definition } }), true);
    else invalid({ task_macros: { m: definition } });
  }
  invalid({ slots: { s: { candidates: [] } } });
  invalid({ slots: { s: { mode: 'branch', candidates: [] } } });
  invalid({ slots: { s: { mode: 'priority', branches: [] } } });
});

test('computed definitions require exactly one body and groups reject value attributes', () => {
  const bodies = { value: '1', branches: [{ when: null, value: '2' }], builtin: 'randomRange' };
  for (const selection of [[], ['value', 'branches'], ['value', 'builtin'], ['branches', 'builtin'], Object.keys(bodies)]) {
    invalid({ expressions: { e: { type: 'number', ...Object.fromEntries(selection.map((key) => [key, bodies[key]])) } } });
  }
  for (const [key, value] of Object.entries({ type: 'number', initial: 1, min: 0, max: 10, integer: true, read_only: false })) invalid({ variables: { g: { kind: 'group', [key]: value } } });
  invalid({ enums: { g: { kind: 'group', options: [{ value: 'a' }] } } });
  invalid({ enums: { e: {} } }); invalid({ enums: { e: { options: [] } } });
  assert.equal(validate({ variables: { g: { kind: 'group' }, v: {} }, enums: { g: { kind: 'group' }, e: { options: [{ value: 'a' }] } } }), true);
});

test('events and reservations require one source; reservation sources and dates are constrained', () => {
  for (const sources of [{}, { day: 'd', source: daySource }]) {
    const { day, ...base } = event;
    invalid({ sequences: { s: { events: { e: { ...base, ...sources } } } } });
    const { day: ignored, ...booking } = reserve;
    invalid(action({ ...booking, ...sources }));
  }
  invalid(action({ ...reserve, day: undefined, source: { ...daySource, mode: 'sequential' } }));
  invalid(action({ ...reserve, date: { mode: 'weeks_weekday', offset: '1' } }));
  invalid(action({ ...reserve, date: { ...reserve.date, weekday: 'thu' } }));
  const sequential = { ...event, source: { mode: 'sequential', candidates: [{ day: 'd', weight: 1 }] } }; delete sequential.day;
  invalid({ sequences: { s: { events: { e: sequential } } } });
  for (const kind of ['periodic', 'probability']) invalid({ sequences: { s: { events: { e: { ...event, kind } } } } });
  invalid({ sequences: { s: { events: { e: { ...event, every: 7 } } } } });
  invalid(action({ builtin: 'release_slot' }));
});

test('documented defaults preserve valid empty content and overlay reservations', () => {
  const result = imported({ variables: { n: {}, b: { type: 'boolean' }, s: { type: 'string' } }, task_macros: { m: {} }, slots: { s: {} }, days: { d: {} } });
  assert.deepEqual(result.errors, []);
  assert.equal(result.data.project.settings.slots_per_day, 3);
  assert.deepEqual(Object.values(result.data.day_schedules)[0].slot_ids, [null, null, null]);
  assert.deepEqual(Object.values(result.data.task_macros)[0].steps, []);
  assert.deepEqual(Object.values(result.data.operand_nodes).map((node) => [node.scope, node.initial_value]), [['application', 0], ['application', false], ['application', '']]);
  const booking = imported(action(reserve)); assert.deepEqual(booking.errors, []);
  const use = Object.values(booking.data.slots)[0].branches[0].task;
  assert.equal(use.execution_mode, 'overlay'); assert.equal(use.priority, 0);
  assert.deepEqual(scheduledPosition({ mode: 'weeks_weekday', weekday: 'thu' }, 0, 2), { position: 3 });
  assert.deepEqual(scheduledPosition({ mode: 'weeks_weekday', weekday: 'thu' }, 1, 2), { position: 10 });
  assert.equal(scheduledPosition({ mode: 'weeks_weekday', weekday: 'mon' }, 0, 2).error, 'scheduleFutureRequired');
});

test('scalar strings and cross-reference constraints remain parser and semantic responsibilities', () => {
  const input = { variables: { n: {} }, tasks: { t: { parameters: { enabled: { type: 'boolean' } } } }, slots: { s: { branches: [{ when: null, run: { task: 't', arguments: { enabled: 'vars.n >= 1' } } }] } } };
  assert.equal(validate(input), true); assert.match(imported(input).errors[0].message, /scalar operand/);
  input.expressions = { ready: { type: 'boolean', value: 'vars.n >= 1' } };
  input.slots.s.branches[0].run.arguments.enabled = 'expr.ready'; assert.deepEqual(imported(input).errors, []);
  for (const input of [
    { variables: { a: { kind: 'group', parent: 'b' }, b: { kind: 'group', parent: 'a' } } },
    { variables: { g: { kind: 'group', scope: 'environment' }, n: { parent: 'g' } } },
    { enums: { g: { kind: 'group', scope: 'environment' }, e: { parent: 'g', options: [{ value: 'a' }] } } },
    { variables: { n: {} }, expressions: { e: { scope: 'environment', type: 'number', value: 'vars.n' } } },
  ]) { assert.equal(validate(input), true); assert.ok(imported(input).errors.length, JSON.stringify(input)); }
});

test('set_variable rejects random amplitude in every action position; increment still accepts it', () => {
  for (const placement of [
    (use) => action(use),
    (use) => ({ task_macros: { m: { steps: [use] } } }),
    (use) => ({ task_macros: { m: { mode: 'random', candidates: [{ ...use, weight: '1' }] } } }),
  ]) {
    invalid(placement({ builtin: 'set_variable', target: 'n', value: '1', random_amplitude: '2' }));
    assert.equal(validate(placement({ builtin: 'increment_variable', target: 'n', value: '1', random_amplitude: '2' })), true);
  }
  invalid(action({ builtin: 'set_variable', target: { parameter: 'target' }, value: '1' }));
});

test('parameter types own exclusive field sets and reference contracts have no Blueprint defaults', () => {
  const definition = (parameter) => ({ tasks: { t: { parameters: { p: parameter } } } });
  for (const type of ['number', 'string', 'boolean']) for (const [key, value] of Object.entries({ value_type: 'any', access: 'write', event_kind: 'any', enum: 'colors', options: [{ value: 'red' }] })) invalid(definition({ type, [key]: value }));
  for (const parameter of [
    { type: 'variable_reference' }, { type: 'variable_reference', value_type: 'number' }, { type: 'variable_reference', access: 'write' },
    { type: 'event_reference' }, { type: 'event_reference', event_kind: 'any', access: 'read' },
    { type: 'enum' }, { type: 'enum', enum: 'colors', options: [{ value: 'red' }] }, { type: 'enum', options: [] },
  ]) invalid(definition(parameter));
  for (const parameter of [{ type: 'variable_reference', value_type: 'any', access: 'read' }, { type: 'event_reference', event_kind: 'any' }, { type: 'enum', options: [{ value: 'red' }] }]) {
    const input = definition(parameter); assert.equal(validate(input), true); assert.deepEqual(imported(input).errors, []);
  }
});

test('expression any and variadic signatures are reserved for environment randomItem', () => {
  for (const expression of [
    { type: 'any', value: '10' }, { type: 'number', value: '1', parameters: { x: { type: 'any' } } },
    { type: 'number', value: '1', parameters: { x: { type: 'number', variadic: true } } },
    { type: 'any', builtin: 'randomItem', scope: 'application', parameters: { items: { type: 'any', variadic: true } } },
    { type: 'number', builtin: 'randomItem', scope: 'environment', parameters: { items: { type: 'any', variadic: true } } },
    { type: 'any', builtin: 'randomItem', scope: 'environment', parameters: { items: { type: 'any' } } },
    { type: 'number', builtin: 'randomRange', scope: 'environment', parameters: { lo: { type: 'string' }, hi: { type: 'number' } } },
  ]) invalid({ expressions: { e: expression } });
  const good = imported({ expressions: {
    randomItem: { type: 'any', builtin: 'randomItem', scope: 'environment', parameters: { items: { type: 'any', variadic: true } } },
    numeric: { type: 'number', value: 'expr.randomItem(1, 2) + 10' },
    text: { type: 'string', value: 'expr.randomItem("a", "b")' },
  } }); assert.deepEqual(good.errors, []);
  assert.ok(imported({ expressions: { e: { type: 'number', value: 'expr.randomItem("a", "b") + 10' } } }).errors.length);
});

test('nonempty branches require one ELSE while ELSE position remains a semantic check', () => {
  for (const place of [
    (branches) => ({ slots: { s: { branches } } }),
    (branches) => ({ task_macros: { m: { mode: 'branch', branches } } }),
  ]) {
    assert.equal(validate(place([])), true);
    invalid(place([{ when: 'true', run: call }]));
    invalid(place([{ when: null, run: call }, { when: null, run: call }]));
    const wrongOrder = place([{ when: null, run: call }, { when: 'true', run: call }]);
    wrongOrder.task_macros ??= {}; wrongOrder.task_macros.m ??= {};
    assert.equal(validate(wrongOrder), true); assert.ok(imported(wrongOrder).errors.length);
  }
  invalid({ expressions: { e: { type: 'number', branches: [{ when: 'true', value: '1' }] } } });
  invalid({ expressions: { e: { type: 'number', branches: [] } } });
  assert.deepEqual(imported({ task_macros: { m: {} }, slots: { s: { branches: [{ when: null, run: call }] } } }).errors, []);
});

test('private day ownership, event count fields and interruption priority match their modes', () => {
  invalid({ days: { d: { scope: 'week_private' } } });
  for (const scope of [undefined, 'shared']) invalid({ days: { d: { ...(scope ? { scope } : {}), owner: { week: 'w', weekday: 'tue' } } } });
  const periodic = { ...event, kind: 'periodic', end: { week: 1, weekday: 'sun' }, every: 1 };
  for (const count of [{ kind: 'day' }, { kind: 'tag' }, { kind: 'all', day: 'd' }, { kind: 'all', tag: 'x' }, { kind: 'day', day: 'd', tag: 'x' }, { kind: 'tag', tag: 'x', day: 'd' }]) invalid({ sequences: { s: { events: { e: { ...periodic, count } } } } });
  for (const execution of ['interrupt_main', 'interrupt_lower']) {
    invalid({ sequences: { s: { events: { e: { ...event, execution, priority: -1 } } } } });
    invalid(action({ ...reserve, execution, priority: -1 }));
    assert.equal(validate({ sequences: { s: { events: { e: { ...event, execution } } } } }), true);
    const booking = imported(action({ ...reserve, execution })); assert.deepEqual(booking.errors, []);
  }
  assert.equal(validate({ sequences: { s: { events: { e: { ...event, priority: -1 } } } } }), true);
  const privateWrongOwner = { days: { d: { scope: 'week_private', owner: { week: 'w', weekday: 'tue' } } }, weeks: { w: { days: { mon: 'd' } } } };
  assert.equal(validate(privateWrongOwner), true); assert.ok(imported(privateWrongOwner).errors.length);
});

test('infinite repeat final position remains semantic and multiple infinite rows fail structurally', () => {
  invalid({ sequences: { s: { weeks: [{ week: 'w', repeat: null }, { week: 'w', repeat: null }] } } });
  const misplaced = { weeks: { w: {} }, sequences: { s: { weeks: [{ week: 'w', repeat: null }, 'w'] } } };
  assert.equal(validate(misplaced), true); assert.ok(imported(misplaced).errors.length);
  assert.deepEqual(imported({ weeks: { w: {} }, sequences: { s: { weeks: ['w', { week: 'w', repeat: null }] } } }).errors, []);
});

test('sequence entry points are explicit and share values only when using the same Runtime', async () => {
  const source = imported({ variables: { n: {} }, ...action({ builtin: 'increment_variable', target: 'n', value: '1' }), days: { d: { slots: ['s', null, null] } }, weeks: { w: { days: { mon: 'd' } } }, sequences: { first: { weeks: ['w'] }, second: { weeks: ['w'] } } });
  assert.deepEqual(source.errors, []);
  const program = Program.fromProject(source.draft, { referenceMode: 'name' }), runtime = new Runtime({ program });
  assert.equal(runtime.getVariable('n'), 0);
  await assert.rejects(runtime.runDay({}), /unknownName/);
  await runtime.runDay({ sequence: 'first' }); assert.equal(runtime.getVariable('n'), 1);
  await runtime.runDay({ sequence: 'second' }); assert.equal(runtime.getVariable('n'), 2);
  assert.equal(new Runtime({ program }).getVariable('n'), 0);
});

test('variable value types constrain initial values and numeric-only attributes', () => {
  for (const type of ['string', 'boolean']) for (const [key, value] of Object.entries({ min: 0, max: 100, integer: false })) invalid({ variables: { n: { type, [key]: value } } });
  for (const definition of [{ initial: 'hello' }, { type: 'number', initial: false }, { type: 'string', initial: 2 }, { type: 'boolean', initial: 'true' }]) invalid({ variables: { n: definition } });
  const valid = { variables: { n: { initial: 5, min: 0, max: 10, integer: true }, text: { type: 'string', initial: 'hello' }, flag: { type: 'boolean', initial: true } } };
  assert.equal(validate(valid), true); assert.deepEqual(imported(valid).errors, []);
  const inverted = { variables: { n: { min: 10, max: 0 } } }; assert.equal(validate(inverted), true); assert.ok(imported(inverted).errors.length);
  for (const [key, value] of Object.entries({ initial: 1.5, min: 0.5, max: 1.5 })) invalid({ variables: { n: { integer: true, initial: 1, [key]: value } } });
  assert.deepEqual(imported({ variables: { n: { initial: 1, min: 0.5, max: 1.5 } } }).errors, []);
});

test('event adjustment constrains literal options while preserving enum-parameter forwarding', () => {
  const change = { builtin: 'adjust_probability_event', event: { event: 'cold' }, property: 'probability_percent', operation: 'set', value: '10' };
  for (const use of [{ ...change, property: 'invalid_property' }, { ...change, operation: 'multiply' }]) for (const input of [action(use), { task_macros: { m: { steps: [use] } } }, { task_macros: { m: { mode: 'random', candidates: [{ ...use, weight: '1' }] } } }]) invalid(input);
  const input = { days: { d: {} }, weeks: { w: {} }, sequences: { s: { weeks: ['w'], events: { cold: { kind: 'probability', start: { week: 1, weekday: 'mon' }, end: { week: 1, weekday: 'sun' }, day: 'd', probability: 10, cooldown_days: 3 } } } }, task_macros: { m: {
    parameters: { property: { type: 'enum', options: [{ value: 'probability_percent' }, { value: 'cooldown_days' }] }, operation: { type: 'enum', options: [{ value: 'set' }, { value: 'increase' }] } },
    steps: [{ ...change, property: { parameter: 'property' }, operation: { parameter: 'operation' } }],
  } } };
  assert.equal(validate(input), true); assert.deepEqual(imported(input).errors, []);
});

test('reference forwarding can narrow capabilities and event kinds but cannot widen the declared contract', () => {
  const forwarded = (supplied, required) => imported({ task_macros: {
    outer: { parameters: { target: supplied }, steps: [{ macro: 'inner', arguments: { target: { parameter: 'target' } } }] },
    inner: { parameters: { target: required } },
  } });
  for (const supplied of ['read', 'write', 'read_write']) for (const required of ['read', 'write', 'read_write']) {
    const result = forwarded({ type: 'variable_reference', value_type: 'number', access: supplied }, { type: 'variable_reference', value_type: 'number', access: required });
    assert.equal(result.errors.length === 0, supplied === 'read_write' || supplied === required, `${supplied} -> ${required}`);
  }
  for (const [supplied, required, accepted] of [['number', 'any', true], ['any', 'number', false], ['string', 'number', false], ['any', 'any', true]]) {
    const result = forwarded({ type: 'variable_reference', value_type: supplied, access: 'read_write' }, { type: 'variable_reference', value_type: required, access: 'read' });
    assert.equal(result.errors.length === 0, accepted, `${supplied} -> ${required}`);
  }
  for (const supplied of ['any', 'probability']) for (const required of ['any', 'probability']) {
    const result = forwarded({ type: 'event_reference', event_kind: supplied }, { type: 'event_reference', event_kind: required });
    assert.equal(result.errors.length === 0, required === 'any' || supplied === required, `${supplied} -> ${required}`);
  }
});
