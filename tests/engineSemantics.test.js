import test from 'node:test';
import assert from 'node:assert/strict';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program, Runtime } from '../src/runtime/index.js';

function runtime(yaml, options = {}) {
  const imported = importBlueprint(yaml);
  assert.deepEqual(imported.errors, []);
  return new Runtime({ program: Program.fromProject(imported.draft, { referenceMode: 'name' }), ...options });
}

test('contract: empty qualified candidates win, skipped selected branches do not fall back, parent sequences continue', async () => {
  const run = runtime(`variables: {n: {initial: 0}}
task_macros:
  empty: {steps: []}
  closed: {eligibility: "false", steps: [{builtin: increment_variable, target: n, value: "100"}]}
  fallback: {steps: [{builtin: increment_variable, target: n, value: "1"}]}
  parent: {steps: [{macro: closed}, {macro: fallback}]}
slots:
  candidates: {mode: priority, candidates: [{macro: empty}, {macro: fallback}]}
  branch: {branches: [{when: "true", run: {macro: closed}}, {when: null, run: {macro: fallback}}]}
  sequence: {branches: [{when: null, run: {macro: parent}}]}
`);
  await run.runSlot({ slot: 'candidates' }); assert.equal(run.getVariable('n'), 0);
  await run.runSlot({ slot: 'branch' }); assert.equal(run.getVariable('n'), 0);
  await run.runSlot({ slot: 'sequence' }); assert.equal(run.getVariable('n'), 1);
});

test('contract: a visited candidate evaluates arguments before eligibility; unvisited candidate arguments stay lazy', async () => {
  const run = runtime(`variables: {zero: {initial: 0}}
task_macros:
  empty: {steps: []}
  closed: {parameters: {amount: {type: number}}, eligibility: "false", steps: []}
slots:
  lazy: {mode: priority, candidates: [{macro: empty}, {macro: closed, arguments: {amount: "1 / vars.zero"}}]}
  error: {mode: priority, candidates: [{macro: closed, arguments: {amount: "1 / vars.zero"}}, {macro: empty}]}
`);
  await run.runSlot({ slot: 'lazy' }); assert.equal(run.status, 'completed');
  await assert.rejects(run.runSlot({ slot: 'error' }), { code: 'divisionByZero' });
});

test('contract: ALL/ANY short circuit and an evaluated error is not false or ELSE', async () => {
  const run = runtime(`variables: {n: {initial: 0}, zero: {initial: 0}}
slots:
  lazy: {branches: [{when: "ANY(true, 1 / vars.zero > 0)", run: {builtin: increment_variable, target: n, value: "1"}}, {when: null, run: {builtin: set_variable, target: n, value: "100"}}]}
  error: {branches: [{when: "ALL(true, 1 / vars.zero > 0)", run: {builtin: set_variable, target: n, value: "100"}}, {when: null, run: {builtin: set_variable, target: n, value: "200"}}]}
`);
  await run.runSlot({ slot: 'lazy' }); assert.equal(run.getVariable('n'), 1);
  await assert.rejects(run.runSlot({ slot: 'error' }), { code: 'divisionByZero' });
  assert.equal(run.getVariable('n'), 1);
});

test('contract: clamp each committed write, truncate toward zero, and reset to the declared baseline rather than test input', async () => {
  const yaml = `variables: {n: {initial: 8, integer: true, max: 10}}
task_macros:
  updates: {steps: [{builtin: increment_variable, target: n, value: "5"}, {builtin: increment_variable, target: n, value: "-5"}]}
slots:
  updates: {branches: [{when: null, run: {macro: updates}}]}
  negative: {branches: [{when: null, run: {builtin: set_variable, target: n, value: "-2.8"}}]}
  reset: {branches: [{when: null, run: {builtin: reset_variable, target: n}}]}
`;
  const run = runtime(yaml);
  await run.runSlot({ slot: 'updates' }); assert.equal(run.getVariable('n'), 5);
  await run.runSlot({ slot: 'negative' }); assert.equal(run.getVariable('n'), -2);
  const testInput = runtime(yaml, { initialState: { n: 3 } });
  await testInput.runSlot({ slot: 'reset' }); assert.equal(testInput.getVariable('n'), 8);
});
