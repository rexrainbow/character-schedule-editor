import { exportProject, navigate } from './navigation.js';
import { defineSimpleTask, selectFirstDefinedTask } from './taskHelpers.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/example.json' with { type: 'json' };

async function menuAction(page, menu, action) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

async function init(page, count = 6) {
  await page.goto('/');
  await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('New project');
  await modal.getByRole('spinbutton', { name: 'Slots per day' }).fill(String(count));
  await modal.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Days', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, 'days');
}
async function importData(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await expect(page.getByRole('tab', { name: 'Days', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, 'days');
}
async function exportData(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  const download = await pending;
  expect(download.suggestedFilename()).toBe('character-schedule.json');
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

test('empty startup settings, cancel, day CRUD and locked daily cell count', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start a new project' })).toBeVisible();
  await page.locator('.welcome').getByRole('button', { name: 'New project' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('textbox', { name: 'Project name' }).fill('My characters');
  await expect(modal.getByRole('spinbutton', { name: 'Slots per day' })).toHaveValue('3');
  await modal.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My characters' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Days', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, 'days');
  await expect(page.getByRole('heading', { name: 'No day schedules yet' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Add day' }).click();
  await expect(page.locator('.day-cell')).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Day name', exact: true }).fill('Workday');
  await menuAction(page, 'Day actions', 'Duplicate day');
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday (副本)');
  await menuAction(page, 'Project menu', 'Project settings');
  await expect(modal.getByRole('spinbutton', { name: 'Slots per day' })).toHaveAttribute('readonly', '');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.validation-panel')).toHaveCount(0);
  const saved = await exportData(page);
  expect(Object.keys(saved.slots)).toHaveLength(0); expect(Object.keys(saved.day_schedules)).toHaveLength(2);
  Object.values(saved.day_schedules).forEach((day) => expect(day.slot_ids).toEqual([null, null, null]));
});

test('create and duplicate via edit mode apply directly to day, Back and Escape discard drafts', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await init(page); await defineSimpleTask(page); await page.locator('.sidebar').getByRole('button', { name: 'Add day' }).click();
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Create slot', exact: true }).click();
  await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Uncommitted');
  await modal.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Create slot', exact: true }).click();
  await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Sleep');
  await selectFirstDefinedTask(modal.getByRole('combobox', { name: 'Task', exact: true }));
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(modal).toHaveCount(0); await expect(page.getByRole('button', { name: 'Slot 1', exact: true })).toContainText('Sleep');
  await page.getByRole('button', { name: 'Slot 2', exact: true }).click();
  await modal.getByRole('radio').click(); await modal.getByRole('button', { name: 'Duplicate slot', exact: true }).click();
  await expect(modal.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Sleep (副本)');
  await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Nap');
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(modal).toHaveCount(0); await expect(page.getByRole('button', { name: 'Slot 2', exact: true })).toContainText('Nap');
  await page.getByRole('button', { name: 'Slot 3', exact: true }).click();
  await modal.getByRole('radio').first().click(); await modal.getByRole('button', { name: 'Duplicate slot', exact: true }).click();
  await page.keyboard.press('Escape');
  const saved = await exportData(page); expect(Object.keys(saved.slots)).toHaveLength(2);
  const ids = Object.keys(saved.slots); expect(new Set(ids).size).toBe(2);
  expect(Object.values(saved.day_schedules)[0].slot_ids.slice(0, 3)).toEqual([ids[0], ids[1], null]);
  expect(errors).toEqual([]);
});

test('selection cancel, shared edit assignment, immediate clear, and referenced deletion', async ({ page }) => {
  await importData(page);
  const modal = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Slot 3', exact: true }).click();
  await modal.getByRole('radio').first().click(); await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Slot 3', exact: true })).toContainText('Select slot');
  await page.getByRole('button', { name: 'Slot 3', exact: true }).click();
  await modal.getByRole('radio').first().click(); await modal.getByRole('button', { name: 'Edit slot', exact: true }).click();
  await expect(modal.locator('.shared-warning')).toContainText('1 reference');
  await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Shared commute');
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Slot 1', exact: true })).toContainText('Shared commute');
  await expect(page.getByRole('button', { name: 'Slot 3', exact: true })).toContainText('Shared commute');
  await page.getByRole('button', { name: 'Slot 3', exact: true }).click();
  await modal.getByRole('button', { name: 'Clear assignment', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Slot 3', exact: true })).toContainText('Select slot');
  await navigate(page, 'slots');
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('1 reference'); await dialog.accept(); });
  await menuAction(page, 'Slot actions', 'Delete slot');
  const saved = await exportData(page); expect(Object.keys(saved.slots)).toHaveLength(1);
  expect(Object.values(saved.day_schedules)[0].slot_ids[0]).toBe(null);
});

test('recursive editor shows field errors and blocks invalid modal apply and export', async ({ page }) => {
  await importData(page);
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByRole('button', { name: 'Edit slot', exact: true }).click();
  const first = modal.getByRole('article', { name: 'Branch 1', exact: true });
  await first.getByRole('combobox', { name: 'Condition type', exact: true }).selectOption('group');
  await first.getByRole('button', { name: 'Add group', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  for (const [name, value] of [['Left operand (opA)', '50'], ['Right operand (opB)', '30']]) {
    await first.getByRole('button', { name, exact: true }).nth(1).click();
    await modal.getByRole('tab', { name: 'Constant', exact: true }).click();
    await modal.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill(value);
    await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  }
  await expect(modal.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await first.getByRole('combobox', { name: 'Task', exact: true }).selectOption('');
  await expect(first.getByText('Choose a task.', { exact: true }).last()).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await navigate(page, 'slots');
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('');
  await expect(page.getByText('Please enter a value.', { exact: true })).toBeVisible();
  await exportProject(page);
  await expect(page.getByRole('status')).toContainText('Unable to export');
  await expect(page.locator('.validation-panel')).toHaveCount(0);
});

test('import rejects cell count and dangling references with paths, version values accepted', async ({ page }) => {
  await init(page);
  const data = structuredClone(example); const dayId = Object.keys(data.day_schedules)[0];
  data.day_schedules[dayId].slot_ids = ['99999999-9999-4999-8999-999999999999'];
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('Import rejected');
  await expect(page.getByText('Cell count must equal the project’s slots per day.')).toBeVisible();
  await expect(page.getByText('Referenced slot does not exist.')).toBeVisible();
  await expect(page.locator('.issues')).toContainText(`/day_schedules/${dayId}/slot_ids/0`);
  await expect(page.getByRole('heading', { name: 'No day schedules yet' })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  const accepted = structuredClone(example); accepted.project.schema_version = 'future';
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(accepted)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  const saved = await exportData(page); expect(saved).toEqual(accepted);
});

test('system Chinese, persistent English override, mobile modal and long schedule scrolling', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('/');
  await page.locator('.welcome').getByRole('button', { name: '新建專案', exact: true }).click();
  const modal = page.getByRole('dialog'); await expect(modal).toContainText('新建專案');
  await modal.getByRole('spinbutton', { name: '每日時段數' }).fill('1000');
  await modal.getByRole('button', { name: '建立專案', exact: true }).click();
  await page.getByRole('combobox', { name: '介面語言' }).selectOption('en');
  await expect(page.getByRole('combobox', { name: 'Editor page', exact: true })).toHaveValue('days');
  await navigate(page, 'days');
  await defineSimpleTask(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Add day' }).click();
  expect(await page.locator('.day-cell').count()).toBeLessThan(25);
  await page.locator('.day-cells').evaluate((element) => element.scrollTop = element.scrollHeight);
  await expect(page.getByRole('button', { name: 'Slot 1000', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Slot 1000', exact: true }).click();
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await modal.getByRole('button', { name: 'Create slot', exact: true }).click();
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await selectFirstDefinedTask(modal.getByRole('combobox', { name: 'Task', exact: true }));
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await exportData(page); await page.reload();
  await expect(page.locator('.welcome')).toBeVisible();
  await expect(modal).toHaveCount(0);
  await context.close();
});
