import { test, expect } from '@playwright/test';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileRuntime } from '../../src/core/runtimeModel.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
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

test('help keeps guidance off the page and supports keyboard focus, Escape and Chinese mobile layout', async ({ page }) => {
  await page.goto('/runtime-demo/');
  const help = page.getByRole('button', { name: 'Help', exact: true });
  await expect(page.getByText(/Each click runs one day/)).not.toBeVisible();
  await help.click();
  const dialog = page.getByRole('dialog', { name: 'Help', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Export → Runtime data');
  await expect(dialog).toContainText('Each click runs one day');
  await expect(dialog).toContainText('External tasks are recorded');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('.help-body')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(help).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  expect(await page.locator('.demo-header').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(100);
  await page.getByRole('button', { name: '使用說明', exact: true }).click();
  const chinese = page.getByRole('dialog', { name: '使用說明', exact: true });
  await expect(chinese).toContainText('重設會清除紀錄並還原初始狀態');
  expect(await chinese.evaluate((element) => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/runtime-demo-help-mobile-zh.png', fullPage: true });
  await chinese.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('button', { name: '使用說明', exact: true })).toBeFocused();
  await expect(page.getByText(/每次點擊執行一天/)).not.toBeVisible();
});

test('standalone host runs one day per click, retains state, stops at the end and explicitly resets', async ({ page }) => {
  await page.goto('/runtime-demo/');
  await expect(page.getByRole('button', { name: 'Run first day', exact: true })).toBeDisabled();
  await load(page);
  await expect(page.locator('#variables tr[data-ref="n"] td')).toHaveText('0');
  await page.evaluate(() => { document.querySelector('#run').click(); document.querySelector('#run').click(); });
  await expect(page.getByRole('status')).toHaveText('Day 1 completed · 2 tasks');
  await expect(page.locator('.day-entry')).toHaveCount(1);
  await expect(page.locator('#log')).toContainText('First visit');
  await expect(page.locator('#log')).toContainText('Recorded only');
  await expect(page.locator('#variables tr[data-ref="n"] td')).toHaveText('1');
  const increment = page.locator('#log li').filter({ hasText: 'increment_variable' }).first();
  await expect(increment.locator('.task-data').first()).toContainText('random_amplitude');
  await expect(increment.locator('.task-data').last()).toContainText('random_offset');
  await expect(increment.locator('.task-data').last()).toContainText('after');
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
  await expect(page.locator('#variables tr[data-ref="n"] td')).toHaveText('0');
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

test('variable space paginates read-only values, preserves imported types and can collapse on mobile', async ({ page }) => {
  const input = data();
  for (let index = 0; index < 12; index++) input.variables[`v${index}`] = { ...input.variables.n, name: `v${index}`, display_name: `Value ${index}`, initial_value: index, scope: 'environment' };
  input.variables.v0 = { ...input.variables.v0, value_type: 'boolean', initial_value: true };
  input.variables.v1 = { ...input.variables.v1, value_type: 'string', initial_value: '<script>not executed</script>' };
  await page.goto('/runtime-demo/'); await load(page, input);
  await expect(page.locator('#variables tbody tr')).toHaveCount(10);
  await expect(page.locator('#variables tr[data-ref="v0"] td')).toHaveText('true');
  await expect(page.locator('#variables tr[data-ref="v1"] td')).toHaveText('"<script>not executed</script>"');
  await expect(page.locator('#variables input, #variables script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next variables', exact: true }).click();
  await expect(page.locator('#variables tbody tr')).toHaveCount(3);
  await expect(page.locator('#variables tr[data-ref="v11"] td')).toHaveText('11');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('button', { name: '上一頁變數', exact: true }).click();
  await expect(page.locator('#variables tr[data-ref="v0"] td')).toHaveText('true');
  const summary = page.locator('.variables-panel > summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#variables')).not.toBeVisible();
  await page.keyboard.press('Enter'); await expect(page.locator('#variables')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
    await expect(page.locator('#variables tr[data-ref="n"] td')).toHaveText('1');
    await expect(page.locator('#log .task-data')).toContainText(['Arguments', 'Result']);
    expect(errors).toEqual([]);
  } finally { await new Promise((resolve) => { server.httpServer.close(resolve); server.httpServer.closeAllConnections(); }); }
});

test('classic build opens through file URLs after moving its three files to a different folder', async ({ page }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'runtime-demo/vite.config.js'], { cwd: root });
  const files = ['index.html', 'app.js', 'app.css'];
  expect((await readdir(join(root, 'dist-runtime-demo'))).sort()).toEqual([...files].sort());
  const folder = await mkdtemp(join(tmpdir(), 'runtime-demo-offline-測試 '));
  const errors = [], remote = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(request.url()));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  try {
    for (const file of files) await copyFile(join(root, 'dist-runtime-demo', file), join(folder, file));
    await page.goto(pathToFileURL(join(folder, 'index.html')).href);
    await expect(page.locator('script[type="module"], link[crossorigin]')).toHaveCount(0);
    expect(await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(16, 18, 24)');
    await load(page);
    await page.getByRole('button', { name: 'Run first day', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Day 1 completed · 2 tasks');
    await page.getByRole('button', { name: 'Run next day', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Sequence finished');
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
    await expect(page.getByRole('status')).toHaveText('行程已結束');
    await page.getByRole('button', { name: '使用說明', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('外部任務僅記錄呼叫');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '使用說明', exact: true })).toBeFocused();
    await page.screenshot({ path: 'test-results/runtime-demo-file-zh.png', fullPage: true });
    expect(remote).toEqual([]); expect(errors).toEqual([]);
  } finally {
    expect(dirname(folder)).toBe(resolve(tmpdir()));
    expect(folder.startsWith(join(tmpdir(), 'runtime-demo-offline-'))).toBe(true);
    await page.goto('about:blank'); await rm(folder, { recursive: true, force: true });
  }
});
