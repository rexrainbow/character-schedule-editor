import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { builtinVariableFixture } from '../builtinVariableFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  const fixture = builtinVariableFixture();
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'builtins.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(fixture.draft).data)) });
  return fixture;
}
async function download(page, action) {
  const wait = page.waitForEvent('download'); await action();
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}

test('new builtin definitions lock structure and persist custom names/keys without ordinary tasks', async ({ page }) => {
  await load(page); await navigate(page, 'tasks');
  for (const [name, rows] of [['Increase value', 3], ['Toggle boolean', 1], ['Reset initial value', 1]]) {
    await page.locator('.operand-sidebar').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(name);
    await expect(page.locator('.parameter-row')).toHaveCount(rows);
    await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Task actions', exact: true })).toHaveCount(0);
    for (const select of await page.getByRole('combobox', { name: 'Parameter type', exact: true }).all()) await expect(select).toBeDisabled();
  }
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Restore state');
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('custom.restore');
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).fill('Destination');
  await navigate(page, 'slots');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:reset_variable');
  await expect(page.getByRole('button', { name: 'Destination', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Destination', exact: true }).click();
  await page.getByRole('dialog').getByRole('treeitem', { name: 'Message', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  const saved = await download(page, () => exportProject(page));
  expect(saved.builtin_tasks.reset_variable).toEqual({ display_name: 'Restore state', engine_key: 'custom.restore', parameters: { target: { display_name: 'Destination' } } });
});

test('builtin task selection filters writable targets and saves negative increments and target-only operations', async ({ page }) => {
  const fixture = await load(page); await navigate(page, 'slots');
  await expect(page.getByRole('combobox', { name: 'Task', exact: true })).toHaveValue('builtin:increment_variable');
  await page.getByRole('button', { name: 'Target variable', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('treeitem', { name: 'Counter', exact: true })).toBeVisible();
  for (const name of ['Enabled', 'Readonly', 'Message']) await expect(dialog.getByRole('treeitem', { name, exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Amount', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('-4.5');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const runtime = await download(page, () => page.getByRole('button', { name: 'Export runtime data', exact: true }).click());
  expect(runtime.slots[fixture.draft.slots[0].id].branches[0].task.value.value).toBe(-4.5);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:toggle_variable');
  await page.getByRole('button', { name: 'Target variable', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search variables', exact: true }).fill('Enabled');
  await expect(dialog.getByRole('treeitem', { name: 'Counter', exact: true })).toHaveCount(0);
  await dialog.getByRole('treeitem', { name: 'Enabled', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Amount', exact: true })).toHaveCount(0);
  const saved = await download(page, () => exportProject(page));
  expect(saved.slots[fixture.draft.slots[0].id].branches[0].task).toEqual({ builtin: 'toggle_variable', target_variable_id: fixture.boolean });
  await navigate(page, 'taskMacros');
  await page.getByRole('article', { name: 'Step 2', exact: true }).getByRole('button', { name: 'Target variable', exact: true }).click();
  await expect(dialog.getByRole('treeitem', { name: 'Enabled', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('Chinese mobile builtin labels and reset hint appear in task and macro editors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page); await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await navigate(page, 'slots', 'zh-TW');
  await expect(page.getByRole('combobox', { name: '任務', exact: true })).toContainText('增加數值');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('combobox', { name: '任務', exact: true }).selectOption('builtin:reset_variable');
  await expect(page.getByText('重設為 runtime 實際採用的初始化值，包含其環境層初始化策略。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '目標變數', exact: true })).toBeVisible();
});
