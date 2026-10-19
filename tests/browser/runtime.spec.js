import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/state-example.json' with { type: 'json' };
import { validateRuntimeDocument } from '../../src/core/runtimeModel.js';
import { exportProject, switchMode } from './navigation.js';

async function load(page, contracts = true) {
  const data = structuredClone(example);
  if (contracts) {
    data.builtin_tasks = { set_variable: { engine_key: 'variable_assignment' } };
    for (const [id, node] of Object.entries(data.operand_nodes)) node.engine_key = 'variable_' + id;
    for (const [id, task] of Object.entries(data.tasks)) task.engine_key = 'task_' + id;
  }
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
async function download(page, action) {
  const wait = page.waitForEvent('download'); await action(); const file = await wait;
  return { name: file.suggestedFilename(), data: JSON.parse(await readFile(await file.path(), 'utf8')) };
}
const dirty = (page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

test('project I/O lives in system menu; runtime export keeps debug names and does not mark the project saved', async ({ page }) => {
  await load(page);
  await expect(page.getByRole('button', { name: 'Export project', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Day name', exact: true }).fill('Debug day');
  const runtime = await download(page, () => page.getByRole('button', { name: 'Export runtime data', exact: true }).click());
  expect(runtime.name).toBe('character-schedule-runtime.json');
  expect(validateRuntimeDocument(runtime.data)).toEqual([]);
  expect(Object.values(runtime.data.days).some((day) => day.display_name === 'Debug day')).toBe(true);
  expect(await dirty(page)).toBe(true);
  const project = await download(page, () => exportProject(page));
  expect(project.data.project).toBeDefined(); expect(project.data.slots[Object.keys(project.data.slots)[0]].icon).toBeDefined();
  expect(await dirty(page)).toBe(false);
  await switchMode(page, 'environment');
  await expect(page.getByRole('button', { name: 'Export runtime data', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Import project', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Export project', exact: true })).toBeVisible();
});

test('missing engine contracts block runtime download with locations, while project save still succeeds', async ({ page }) => {
  await load(page, false);
  await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Unable to export runtime data');
  await expect(page.locator('.issues')).toContainText('/engine_key');
  const project = await download(page, () => exportProject(page));
  expect(project.data.project).toBeDefined();
});

test('Chinese mobile runtime action and project menu fit the single toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(page.getByRole('button', { name: '匯出執行資料', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '專案選單', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '匯入專案', exact: true })).toBeInViewport();
  await expect(page.getByRole('menuitem', { name: '匯出專案', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
