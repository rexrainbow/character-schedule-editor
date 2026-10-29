import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from 'yaml';
import { expressionFunctionYaml } from './expressionFunctionFixture.js';
import { importBlueprint, exportBlueprint } from '../src/core/blueprint/index.js';
import { compileProject, projectToDraft, createProject } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { compileEnvironment, prepareEnvironmentImport, createProjectWithEnvironment } from '../src/core/environmentModel.js';
import { duplicateOperandSubtree } from '../src/core/operandModel.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { executeCommand } from '../src/core/commands.js';

const good = (result) => { assert.deepEqual(result.errors, []); return result; };
const draft = () => good(importBlueprint(expressionFunctionYaml)).draft;
const values = (runtime) => ['n', 'text', 'flag'].map((name) => runtime.getVariable(name));
const slot = (program) => program.entries('slots').find(([, node]) => node.name === 'demo')[0];

test('parameterized string/number/branch definitions and environment functions rebuild through every data format', () => {
  const initial = draft(), project = good(compileProject(initial)).data;
  assert.deepEqual(good(compileProject(projectToDraft(project))).data, project);
  const yaml = good(exportBlueprint(initial)).data;
  assert.equal(good(exportBlueprint(good(importBlueprint(yaml)).draft)).data, yaml);
  assert.match(yaml, /expr\.twice\(expr\.randomRange\(1, 3\)\)/);
  assert.match(yaml, /builtin: randomItem/);
  good(compileRuntime(initial));
  const environment = good(compileEnvironment(initial)).data;
  assert.equal(Object.keys(environment.expression_macros).length, 2);
  const source = Object.entries(initial.operandNodes).find(([, node]) => node.symbol === 'twice');
  const copy = duplicateOperandSubtree(initial.operandNodes, source[0]);
  assert.notEqual(copy.nodes[copy.id].parameters[0].id, source[1].parameters[0].id);
  good(compileProject({ ...initial, operandNodes: copy.nodes }));
});

test('seeded calls evaluate arguments once and diagnostics never change random draws, in UUID and name programs', async () => {
  const initial = draft(), results = [];
  for (const referenceMode of ['uuid', 'name']) for (const diagnostics of [false, true]) {
    const program = Program.fromProject(initial, { referenceMode }), runtime = new Runtime({ program, seed: 'functions', diagnostics });
    const records = []; runtime.on('diagnostic', (record) => records.push(record));
    await runtime.runSlot({ slot: slot(program) });
    const result = values(runtime); assert.ok(result[0] >= 2 && result[0] < 6); assert.ok(['A', 'B', 'C'].includes(result[1])); assert.equal(typeof result[2], 'boolean');
    if (diagnostics) assert.equal(records.filter((record) => record.kind === 'expression.random').length, 3);
    else assert.deepEqual(records, []);
    results.push(result);
  }
  results.forEach((result) => assert.deepEqual(result, results[0]));
});

test('nested same-function arguments, string branches and equal bounds use the proper local scope', async () => {
  const yaml = parse(expressionFunctionYaml);
  yaml.task_macros.update.steps = [
    { builtin: 'set_variable', target: 'n', value: 'expr.twice(expr.twice(2))' },
    { builtin: 'set_variable', target: 'text', value: 'expr.label(-1)' },
    { builtin: 'set_variable', target: 'flag', value: 'expr.randomItem(true)' },
  ];
  const program = Program.fromProject(good(importBlueprint(stringify(yaml))).draft, { referenceMode: 'name' }), runtime = new Runtime({ program });
  await runtime.runSlot({ slot: 'demo' }); assert.deepEqual(values(runtime), [8, 'Negative', true]);
  yaml.task_macros.update.steps = [{ builtin: 'set_variable', target: 'n', value: 'expr.randomRange(7, 7)' }];
  const second = new Runtime({ program: Program.fromProject(good(importBlueprint(stringify(yaml))).draft, { referenceMode: 'name' }) });
  const before = second.snapshot().state.randomState; await second.runSlot({ slot: 'demo' });
  assert.equal(second.getVariable('n'), 7); assert.equal(second.snapshot().state.randomState, before);
});

test('invalid calls, mixed candidates, missing parameters, cycles and environment-to-application dependencies are rejected', () => {
  for (const expression of ['expr.twice()', 'expr.twice(1, 2)', 'expr.twice', 'expr.twice("x")', 'expr.randomItem()', 'expr.randomItem(1, "x")']) {
    const yaml = parse(expressionFunctionYaml); yaml.task_macros.update.steps[0].value = expression;
    assert.ok(importBlueprint(stringify(yaml)).errors.length, expression);
  }
  const missing = parse(expressionFunctionYaml); missing.expressions.twice.value = 'params.missing';
  assert.ok(importBlueprint(stringify(missing)).errors.length);
  const cycle = parse(expressionFunctionYaml); cycle.expressions.twice.value = 'expr.twice(params.x)';
  assert.ok(importBlueprint(stringify(cycle)).errors.some((error) => error.key === 'computedCycle'));
  const layer = parse(expressionFunctionYaml); layer.expressions.greeting.scope = 'environment'; layer.expressions.greeting.value = 'expr.label(1)';
  assert.ok(importBlueprint(stringify(layer)).errors.some((error) => error.key === 'environmentExpressionDependency'));
  layer.expressions.greeting.value = 'expr.randomItem(vars.text, "B")';
  assert.ok(importBlueprint(stringify(layer)).errors.some((error) => error.key === 'environmentExpressionDependency'));
});

test('invalid range stops execution instead of silently swapping the bounds', async () => {
  const yaml = parse(expressionFunctionYaml); yaml.task_macros.update.steps[0].value = 'expr.randomRange(10, 1)';
  const runtime = new Runtime({ program: Program.fromProject(good(importBlueprint(stringify(yaml))).draft, { referenceMode: 'name' }) });
  await assert.rejects(runtime.runSlot({ slot: 'demo' }), /invalidRandomRange/);
  assert.equal(runtime.getVariable('n'), 0);
});

test('environment replacement reconnects expression argument UUIDs by parameter name', () => {
  const initial = draft(), environment = good(compileEnvironment(draft())).data;
  const range = Object.values(environment.expression_macros).find((node) => node.definition?.builtin === 'randomRange');
  [range.parameters[0].name, range.parameters[1].name] = [range.parameters[1].name, range.parameters[0].name];
  const replaced = good(prepareEnvironmentImport(initial, environment));
  good(compileProject(replaced.draft));
  const first = parse(good(exportBlueprint(initial)).data), second = parse(good(exportBlueprint(replaced.draft)).data);
  assert.deepEqual(first.task_macros, second.task_macros);
});

test('paused external calls restore their frozen random arguments without redrawing', async () => {
  const yaml = parse(expressionFunctionYaml); yaml.tasks = { wait: { parameters: { amount: { type: 'number' } } } };
  yaml.slots.demo.branches[0].run = { task: 'wait', arguments: { amount: 'expr.randomRange(1, 10)' } };
  const program = Program.fromProject(good(importBlueprint(stringify(yaml))).draft, { referenceMode: 'name' });
  const runtime = new Runtime({ program, seed: 'checkpoint' });
  let enter; const entered = new Promise((resolve) => { enter = resolve; });
  runtime.registerTask('wait', async () => { enter(); await new Promise(() => {}); });
  const running = runtime.runSlot({ slot: 'demo' }); await entered; await runtime.pause(); await running;
  const checkpoint = JSON.parse(JSON.stringify(runtime.snapshot())), value = checkpoint.state.execution.pending.arguments.amount;
  const restored = new Runtime({ program: Program.fromJSON(program.toJSON()), checkpoint });
  restored.registerTask('wait', (args) => assert.equal(args.amount, value));
  await restored.resume(); assert.equal(restored.snapshot().state.randomState, checkpoint.state.randomState);
});

test('API preserves builtin signatures, resolves named local parameters and cleans obsolete caller arguments', () => {
  const initial = draft(), session = createProjectSession(initial, { mode: 'all' });
  const [id, range] = Object.entries(initial.operandNodes).find(([, node]) => node.symbol === 'randomRange');
  assert.equal(session.expressions.update(id, { parameters: [...range.parameters].reverse() }).ok, false);
  assert.equal(session.expressions.update(id, { parameters: range.parameters.map((p) => ({ ...p, icon: 'blue' })) }).ok, true);
  assert.equal(executeCommand(session, { object: 'expressions', action: 'setDefinition', id: 'twice', valueType: 'number', definition: { kind: 'number', expression: { type: 'parameter_reference', parameter_id: 'x' } } }).ok, true);
  const source = good(importBlueprint(`environment: {name: Contract}
expressions:
  source:
    scope: environment
    type: number
    parameters: {x: {type: number}, unused: {type: number}}
    value: params.x
  caller: {type: number, value: 'expr.source(1, 2)'}
`)).draft;
  const api = createProjectSession(source, { mode: 'environment' }), [sourceId, definition] = Object.entries(source.operandNodes).find(([, node]) => node.symbol === 'source');
  assert.equal(api.expressions.update(sourceId, { parameters: definition.parameters.slice(0, 1) }).ok, true);
  good(compileProject(api.getSnapshot()));
  const caller = Object.values(api.getSnapshot().operandNodes).find((node) => node.symbol === 'caller');
  assert.deepEqual(Object.keys(caller.definition.expression.arguments), [definition.parameters[0].id]);
});

test('short-circuited conditions never consume function randomness', async () => {
  const source = parse(expressionFunctionYaml);
  source.slots.demo.branches = [{ when: 'ALL(false, expr.randomRange(1, 3) > 1)', run: { macro: 'update' } }, { when: null, run: { builtin: 'reset_variable', target: 'n' } }];
  const runtime = new Runtime({ program: Program.fromProject(good(importBlueprint(stringify(source))).draft, { referenceMode: 'name' }), diagnostics: true });
  const before = runtime.snapshot().state.randomState; await runtime.runSlot({ slot: 'demo' });
  assert.equal(runtime.snapshot().state.randomState, before);
});

test('application sessions install random functions on load/reset and preserve existing metadata through environment imports', () => {
  const api = createProjectSession(draft(), { mode: 'all', includeExpressionFunctions: true });
  const [id, range] = Object.entries(api.getSnapshot().operandNodes).find(([, node]) => node.definition?.builtin === 'randomRange');
  assert.equal(api.expressions.update(id, { symbol: 'roll_range', display_name: 'My RNG', icon: 'blue', parameters: range.parameters.map((p, index) => index ? p : { ...p, symbol: 'lower' }) }).ok, true);
  const saved = good(api.toDocument()).data;
  assert.equal(api.loadDocument(saved).ok, true);
  assert.equal(api.reset(api.getSnapshot()).ok, true);
  assert.deepEqual(good(api.toDocument()).data, saved);
  const environment = createProjectWithEnvironment('Import', 3, null);
  for (const [key, node] of Object.entries(environment.operandNodes)) if (node.definition?.kind === 'builtin') delete environment.operandNodes[key];
  const imported = good(compileEnvironment(environment)).data;
  assert.deepEqual(api.environment.previewImport(imported).errors, []);
  assert.equal(api.environment.import(imported).ok, true);
  const retained = api.getSnapshot().operandNodes[id];
  assert.equal(retained.symbol, 'roll_range'); assert.equal(retained.display_name, 'My RNG'); assert.equal(retained.parameters[0].symbol, 'lower');
  assert.equal(Object.values(api.getSnapshot().operandNodes).filter((node) => node.definition?.kind === 'builtin').length, 2);
  good(compileProject(api.getSnapshot()));
  assert.equal(api.loadDocument(good(compileProject(createProject())).data).ok, true);
  assert.equal(Object.values(api.getSnapshot().operandNodes).filter((node) => node.definition?.kind === 'builtin').length, 2);
});

test('automatic functions do not overwrite custom expressions with the default names', () => {
  const source = good(importBlueprint('expressions: {randomRange: {type: number, value: "5"}}')).draft;
  const [id] = Object.entries(source.operandNodes)[0];
  const api = createProjectSession(source, { includeExpressionFunctions: true });
  assert.equal(api.getSnapshot().operandNodes[id].definition.expression.value, 5);
  assert.ok(Object.values(api.getSnapshot().operandNodes).some((node) => node.symbol === 'randomRange_2' && node.definition?.builtin === 'randomRange'));
  good(compileProject(api.getSnapshot()));
});
