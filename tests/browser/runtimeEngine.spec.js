import { test, expect } from '@playwright/test';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { Program } from '../../src/runtime/index.js';

test('standalone runtime runs in the browser and restores a paused async task from JSON', async ({ page }) => {
  const imported = importBlueprint(`variables: {n: {initial: 1}}
tasks: {wait: {parameters: {amount: {type: number}}}}
task_macros:
  work:
    steps:
      - {builtin: increment_variable, target: n, value: "1"}
      - {task: wait, arguments: {amount: vars.n}}
      - {builtin: increment_variable, target: n, value: "3"}
slots: {s: {branches: [{when: null, run: {macro: work}}]}}
`);
  expect(imported.errors).toEqual([]);
  const program = Program.fromProject(imported.draft, { referenceMode: 'name' }).toJSON();
  await page.goto('/');
  const result = await page.evaluate(async (data) => {
    const { Program, Runtime } = await import('/src/runtime/index.js');
    const program = Program.fromJSON(data), runtime = new Runtime({ program });
    runtime.registerTask('wait', async (_, context) => { context.setVariable('n', 99); await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true })); });
    let taskId; const reached = new Promise((resolve) => runtime.on('task.start', (event) => { if (event.name === 'wait') { taskId = event.invocationId; resolve(); } }));
    const running = runtime.runSlot({ slot: 's' }); await reached; await runtime.pause(); await running;
    const pausedValue = runtime.getVariable('n'), checkpoint = JSON.parse(JSON.stringify(runtime.snapshot()));
    const restored = Runtime.restore({ program: Program.fromJSON(JSON.parse(JSON.stringify(data))), checkpoint });
    let restoredId;
    restored.registerTask('wait', (args, context) => { restoredId = context.invocationId; context.setVariable('n', context.getVariable('n') + args.amount); });
    await restored.resume();
    return { pausedValue, finalValue: restored.getVariable('n'), status: restored.status, sameCall: taskId === restoredId };
  }, program);
  expect(result).toEqual({ pausedValue: 2, finalValue: 7, status: 'completed', sameCall: true });
});
