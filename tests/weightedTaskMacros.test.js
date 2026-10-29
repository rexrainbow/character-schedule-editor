import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint, exportBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { compileProject, projectToDraft } from '../src/core/model.js';
import { duplicateTaskMacro, macroParameterReferences, macroUses } from '../src/core/taskMacroModel.js';
import { nodeReferences } from '../src/core/operandModel.js';
import { taskMacroLogicText } from '../src/core/logicOverviewModel.js';
import { translator } from '../src/i18n/index.js';
import { simulateSlot } from '../src/simulation/index.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { executeCommand } from '../src/core/commands.js';

const good = (result) => { assert.deepEqual(result.errors, []); return result; };
const load = (content) => good(importBlueprint(content)).draft;
const slot = '\nslots: {s: {branches: [{when: null, run: {macro: choose}}]}}\n';
const run = (draft, options = {}) => new Runtime({ program: Program.fromProject(draft, { referenceMode: 'name' }), ...options });

test('weighted: qualify every call before evaluating weights; excluded weights and unused fallback stay lazy', async () => {
  const draft = load(`variables: {n: {initial: 0}}
task_macros:
  closed: {eligibility: "false", steps: []}
  open: {parameters: {amount: {type: number}}, eligibility: params.amount > 0, steps: [{builtin: increment_variable, target: n, value: params.amount}]}
  choose:
    mode: random
    candidates:
      - {macro: closed, weight: "1 / 0"}
      - {macro: open, arguments: {amount: "2"}, weight: "1"}
    fallback: {builtin: set_variable, target: n, value: "1 / vars.n"}
` + slot);
  for (const referenceMode of ['name', 'uuid']) {
    const records = [], runtime = new Runtime({ program: Program.fromProject(draft, { referenceMode }), diagnostics: true });
    runtime.on('diagnostic', (record) => records.push(record));
    await runtime.runSlot({ slot: 's' }); assert.equal(runtime.getVariable('n'), 2);
    assert.equal(records.find((record) => record.kind === 'weightedSelection').index, 2);
    const guard = records.filter((record) => record.type === 'enter' && record.kind === 'condition' && record.path.endsWith('/eligibility'));
    assert.equal(guard.length, 2); // The selected macro is not checked twice.
    assert.ok(records.findIndex((record) => record.kind === 'weight') > records.findLastIndex((record) => record.kind === 'argument'));
  }
});

test('weighted: zero weights and empty pools use a lazy fallback without consuming a draw', async () => {
  for (const candidates of ['[]', '[{macro: closed, weight: "1 / 0"}]', '[{builtin: set_variable, target: n, value: "100", weight: "0"}]']) {
    const draft = load(`variables: {n: {initial: 0}}
task_macros:
  closed: {eligibility: "false", steps: []}
  choose: {mode: random, candidates: ${candidates}, fallback: {builtin: set_variable, target: n, value: "9"}}
` + slot);
    const runtime = run(draft), initialRandom = runtime.getState().randomState;
    await runtime.runSlot({ slot: 's' }); assert.equal(runtime.getVariable('n'), 9); assert.equal(runtime.getState().randomState, initialRandom);
    draft.taskMacros.find((macro) => macro.symbol === 'choose').fallback = null;
    const empty = run(draft); await empty.runSlot({ slot: 's' }); assert.equal(empty.getVariable('n'), 0);
  }
});

test('weighted: seeded positive weights reproduce choices; very large weights do not overflow', async () => {
  const draft = load(`variables: {n: {initial: 0}}
task_macros:
  choose: {mode: random, candidates: [{builtin: set_variable, target: n, value: "1", weight: "1e308"}, {builtin: set_variable, target: n, value: "2", weight: "1e308 / 3"}]}
` + slot);
  const a = run(draft, { seed: 'weighted-seed', diagnostics: true }), b = run(draft, { seed: 'weighted-seed' });
  let first = 0;
  for (let index = 0; index < 80; index++) { await a.runSlot({ slot: 's' }); await b.runSlot({ slot: 's' }); assert.equal(a.getVariable('n'), b.getVariable('n')); if (a.getVariable('n') === 1) first++; }
  assert.ok(first > 40 && first < 76, String(first));
  assert.equal(a.getState().randomState, b.getState().randomState);
});

test('weighted: evaluated invalid inputs fail rather than running fallback, and preparation failures retain RNG state', async () => {
  for (const [weight, code] of [['vars.n', 'invalidRandomWeight'], ['1 / vars.zero', 'divisionByZero'], ['1e308 * 2', 'finiteNumber']]) {
    const draft = load(`variables: {n: {initial: -1}, zero: {initial: 0}}
task_macros:
  choose: {mode: random, candidates: [{builtin: set_variable, target: n, value: "1", weight: "${weight}"}], fallback: {builtin: set_variable, target: n, value: "9"}}
` + slot);
    const runtime = run(draft), before = runtime.getState().randomState;
    await assert.rejects(runtime.runSlot({ slot: 's' }), (error) => error.code === code);
    assert.equal(runtime.getVariable('n'), -1); assert.equal(runtime.getState().randomState, before);
  }
  const draft = load(`variables: {n: {initial: 0}}
task_macros:
  closed: {parameters: {a: {type: number}}, eligibility: "false", steps: []}
  choose: {mode: random, candidates: [{macro: closed, arguments: {a: "1 / vars.n"}, weight: "0"}]}
` + slot);
  await assert.rejects(run(draft).runSlot({ slot: 's' }), { code: 'divisionByZero' });
});

test('weighted: restoring a pending selected task reuses the draw and frozen arguments', async () => {
  const draft = load(`variables: {n: {initial: 2}}
tasks: {wait: {parameters: {amount: {type: number}}}}
task_macros:
  choose: {mode: random, candidates: [{task: wait, arguments: {amount: vars.n}, weight: "1"}], fallback: {builtin: set_variable, target: n, value: "100"}}
` + slot);
  const runtime = run(draft, { taskHandlers: { wait: () => { throw new Error('paused externally'); } } });
  await assert.rejects(runtime.runSlot({ slot: 's' }));
  const checkpoint = JSON.parse(JSON.stringify(runtime.snapshot())), randomState = checkpoint.state.randomState;
  const records = [], restored = Runtime.restore({ program: runtime.program, checkpoint, diagnostics: true, taskHandlers: { wait: ({ amount }, context) => { assert.equal(amount, 2); context.setVariable('n', 7); } } });
  restored.on('diagnostic', (record) => records.push(record));
  await restored.setVariable('n', 42); await restored.resume();
  assert.equal(restored.getVariable('n'), 7); assert.equal(restored.getState().randomState, randomState);
  assert.ok(!records.some((record) => record.kind === 'weightedSelection'));
});

test('weighted: persistence, runtime export, references, duplication and named commands cover weights and fallback', () => {
  const draft = load(`variables: {n: {initial: 1, scope: environment}}
task_macros:
  other: {steps: []}
  choose:
    mode: random
    description: choice notes
    parameters: {chance: {type: number}}
    candidates: [{macro: other, weight: "params.chance + vars.n", description: weight notes}]
    fallback: {builtin: increment_variable, target: n, value: params.chance, description: fallback notes}
` + slot.replace('macro: choose', 'macro: choose, arguments: {chance: "1"}'));
  const chosen = draft.taskMacros.find((macro) => macro.symbol === 'choose'), param = chosen.parameters[0].id;
  assert.equal(macroParameterReferences(chosen, param).length, 2);
  const variable = Object.keys(draft.operandNodes)[0];
  assert.ok(nodeReferences(draft.slots, new Set([variable]), draft.operandNodes, new Set(), draft.taskMacros, draft.tasks).some((ref) => ref.path.includes('/weight')));
  assert.ok(macroUses([], draft.taskMacros[0].id, draft.taskMacros).length);
  const duplicate = duplicateTaskMacro(chosen);
  assert.notEqual(duplicate.parameters[0].id, param); assert.notEqual(duplicate.candidates[0].id, chosen.candidates[0].id);
  assert.equal(macroParameterReferences(duplicate, param).length, 0); assert.equal(macroParameterReferences(duplicate, duplicate.parameters[0].id).length, 2);
  assert.equal(duplicate.fallback.id, undefined);
  const yaml = good(exportBlueprint(draft)).data;
  assert.match(yaml, /weight: \(params.chance \+ vars.n\)/); assert.match(yaml, /fallback notes/);
  assert.equal(good(exportBlueprint(good(importBlueprint(yaml)).draft)).data, yaml);
  good(compileProject(projectToDraft(good(compileProject(draft)).data)));
  const runtime = good(compileRuntime(draft)).data;
  assert.equal(runtime.task_macros[chosen.id].mode, 'random');
  assert.equal(runtime.task_macros[chosen.id].candidates[0].weight.operand_b.name, 'n');
  assert.ok(runtime.environment_requirements.variables.some((item) => item.name === 'n'));
  const session = createProjectSession(draft);
  assert.equal(executeCommand(session, { object: 'taskMacros', action: 'setMode', name: 'other', mode: 'random' }).ok, true);
});

test('weighted: simulator diagnostics and logic summaries expose selection, weights and fallback', async () => {
  const draft = load(`variables: {n: {initial: 0}}
task_macros:
  choose: {mode: random, candidates: [{builtin: increment_variable, target: n, value: "2", weight: "1"}], fallback: {builtin: set_variable, target: n, value: "9"}}
` + slot);
  const result = await simulateSlot(draft, draft.slots[0].id);
  assert.deepEqual(result.errors, []); assert.match(JSON.stringify(result.trace), /Selected candidate 1/); assert.match(JSON.stringify(result.trace), /Eligible positive weights/);
  const logic = taskMacroLogicText(draft.taskMacros[0], { nodes: draft.operandNodes, tasks: [], macros: draft.taskMacros, t: translator('en'), depth: 'all' });
  assert.match(logic, /Random weight \(1\)/); assert.match(logic, /Fallback action/);
});

test('weighted: empty selected macros do not trigger fallback; fallback guards and cycles retain normal call rules', async () => {
  const draft = load(`variables: {n: {initial: 0}}
task_macros:
  empty: {steps: []}
  closed: {eligibility: "false", steps: [{builtin: set_variable, target: n, value: "9"}]}
  choose: {mode: random, candidates: [{macro: empty, weight: "1"}], fallback: {builtin: set_variable, target: n, value: "100"}}
` + slot);
  const selected = run(draft); await selected.runSlot({ slot: 's' }); assert.equal(selected.getVariable('n'), 0);
  const macro = draft.taskMacros.find((item) => item.symbol === 'choose');
  macro.candidates = []; macro.fallback = { task: { task_macro_id: draft.taskMacros.find((item) => item.symbol === 'closed').id, arguments: {} } };
  const skipped = run(draft); await skipped.runSlot({ slot: 's' }); assert.equal(skipped.getVariable('n'), 0);
  assert.ok(macroUses([], macro.fallback.task.task_macro_id, draft.taskMacros).some((ref) => ref.path.endsWith('/fallback/task')));
  macro.fallback.task.task_macro_id = macro.id;
  assert.ok(compileProject(draft).errors.some((error) => error.key === 'taskMacroCycle'));
});
