import { test, expect } from '@playwright/test';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileRuntime } from '../../src/core/runtimeModel.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const yaml = `project: {name: Daily runner, slots_per_day: 1}
variables: {n: {initial: 0}}
tasks:
  greet: {display_name: First visit, parameters: {}}
  return_visit: {display_name: Return visit, parameters: {}}
task_macros:
  first:
    steps:
      - {task: greet}
      - {builtin: increment_variable, target: n, value: "1"}
slots:
  work:
    branches:
      - {when: vars.n == 0, run: {macro: first}}
      - {when: null, run: {task: return_visit}}
days: {normal: {slots: [work]}}
weeks: {normal: {days: {mon: normal, tue: normal}}}
sequences:
  life: {display_name: Daily life, weeks: [normal], end_weekday: tue}
  empty: {display_name: Empty sequence, weeks: []}
`;
function data() {
  const source = importBlueprint(yaml); expect(source.errors).toEqual([]);
  const result = compileRuntime(source.draft); expect(result.errors).toEqual([]); return result.data;
}
async function load(page, input = data()) {
  await page.locator('#file').setInputFiles({ name: 'schedule.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.getByRole('status')).toHaveText('Ready to run');
}

test('standalone host runs one day per click, retains state, stops at the end and explicitly resets', async ({ page }) => {
  await page.goto('/runtime-demo/');
  await expect(page.getByRole('button', { name: 'Run first day', exact: true })).toBeDisabled();
  await load(page);
  await page.evaluate(() => { document.querySelector('#run').click(); document.querySelector('#run').click(); });
  await expect(page.getByRole('status')).toHaveText('Day 1 completed · 2 tasks');
  await expect(page.locator('.day-entry')).toHaveCount(1);
  await expect(page.locator('#log')).toContainText('First visit');
  await expect(page.locator('#log')).toContainText('Recorded only');
  await expect(page.locator('#seed')).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Week sequence', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Run next day', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Sequence finished');
  await expect(page.locator('.day-entry')).toHaveCount(2);
  await expect(page.locator('.day-entry').last()).toContainText('Return visit');
  await expect(page.getByRole('button', { name: 'Sequence finished', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/runtime-demo-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset run', exact: true }).click();
  await expect(page.locator('.day-entry')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run first day', exact: true }).click();
  await expect(page.locator('#log')).toContainText('First visit');
});

test('invalid files preserve the current run; empty sequences and failed execution cannot advance', async ({ page }) => {
  await page.goto('/runtime-demo/'); await load(page);
  await page.getByRole('button', { name: 'Run first day', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Day 1 completed');
  await page.locator('#file').setInputFiles({ name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from('{"project":{}}') });
  await expect(page.getByRole('alert')).toContainText('Could not load');
  await expect(page.locator('.day-entry')).toHaveCount(1);
  await page.getByRole('button', { name: 'Run next day', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Sequence finished');
  await page.getByRole('button', { name: 'Reset run', exact: true }).click();
  await page.getByRole('combobox', { name: 'Week sequence', exact: true }).selectOption('empty');
  await expect(page.getByRole('status')).toContainText('no executable days');
  await expect(page.locator('#run')).toBeDisabled();
  const broken = data();
  broken.slots.work.branches[0].task = { builtin: 'increment_variable', target_variable_id: 'n', value: { type: 'expression', operator: '/', operand_a: { type: 'constant', value: 1 }, operand_b: { type: 'reference', reference_id: 'n' } } };
  await load(page, broken);
  await page.getByRole('button', { name: 'Run first day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('divisionByZero');
  await expect(page.getByRole('status')).toHaveText('Execution stopped');
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset run', exact: true })).toBeEnabled();
});

test('Chinese narrow layout, keyboard disclosures and empty imports remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/runtime-demo/'); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('button', { name: '執行第一天', exact: true }).click();
  await expect(page.locator('#log')).toContainText('增加數值');
  const summary = page.locator('.day-entry summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.day-entry')).not.toHaveAttribute('open');
  await page.keyboard.press('Enter'); await expect(page.locator('.day-entry')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/runtime-demo-mobile-zh.png', fullPage: true });
  const input = data(); input.sequences = {};
  await page.locator('#file').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.getByRole('status')).toHaveText('此檔案沒有周序列。');
  await expect(page.locator('#run')).toBeDisabled();
});

test('independently built HTML loads its bundled assets and runs without the editor server', async ({ page }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'runtime-demo/vite.config.js'], { cwd: root });
  const server = await preview({ configFile: `${root}/runtime-demo/vite.config.js`, preview: { host: '127.0.0.1', port: 0, open: false } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url()));
  try {
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await load(page);
    await page.getByRole('button', { name: 'Run first day', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Day 1 completed · 2 tasks');
    expect(errors).toEqual([]);
  } finally { await new Promise((resolve) => { server.httpServer.close(resolve); server.httpServer.closeAllConnections(); }); }
});
