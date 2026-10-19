import { selectFirstDefinedTask } from './taskHelpers.js';
import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/task-example.json' with { type: 'json' };
import { translator } from '../../src/i18n/index.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'tasks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
}
async function exported(page) {
  const wait = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
async function menu(page, action) {
  await page.getByRole('button', { name: 'Task actions', exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
const branch = (page) => page.getByRole('article', { name: 'Branch 1', exact: true });
const moveTask = Object.entries(example.tasks).find(([, task]) => task.display_name === 'Move');
async function selectMove(page) {
  await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Move 3', exact: true }).click();
}
async function constant(page, container, name, value, type) {
  await container.getByRole('button', { name: 'Argument: ' + name, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Constant type', exact: true })).toHaveValue(type);
  await expect(dialog.getByRole('combobox', { name: 'Constant type', exact: true })).toBeDisabled();
  if (type === 'boolean') await dialog.getByRole('combobox', { name: 'Constant value', exact: true }).selectOption(value);
  else await dialog.getByRole(type === 'number' ? 'spinbutton' : 'textbox', { name: 'Constant value', exact: true }).fill(value);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
}

test('create task definitions and use required string, numeric expression and boolean parameters', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Move');
  for (const [index, name, type] of [[0, 'Destination', 'string'], [1, 'Speed', 'number'], [2, 'Ready', 'boolean']]) {
    await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
    await page.getByRole('textbox', { name: 'Parameter name', exact: true }).nth(index).fill(name);
    await page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(index).selectOption(type);
  }
  await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: 'Add slot', exact: true }).click();
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  await branch(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption({ label: 'Move' });
  await exportProject(page);
  await expect(page.getByRole('status')).toContainText('Unable to export');
  await constant(page, branch(page), 'Destination', 'Shop', 'string');
  await constant(page, branch(page), 'Speed', '2', 'number');
  await branch(page).getByRole('button', { name: 'Add OP to Argument: Speed', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit expression operand B', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('3');
  await expect(dialog.locator('.expression-preview pre')).toHaveText('(2 + 3)');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await constant(page, branch(page), 'Ready', 'false', 'boolean');
  const saved = await exported(page), [id, task] = Object.entries(saved.tasks)[0], use = Object.values(saved.slots)[0].branches[0].task;
  expect(use.task_id).toBe(id); expect(task.parameters.map((p) => p.type)).toEqual(['string', 'number', 'boolean']);
  expect(use.arguments[task.parameters[0].id].value).toBe('Shop'); expect(use.arguments[task.parameters[1].id].type).toBe('expression'); expect(use.arguments[task.parameters[2].id].value).toBe(false);
  expect(errors).toEqual([]);
});

test('task definitions protect existing values, remove parameters globally and regenerate copied IDs', async ({ page }) => {
  await load(page); await selectMove(page);
  await page.getByRole('button', { name: 'Task actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete task', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(1).selectOption('string');
  await expect(page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(1)).toHaveValue('number');
  await expect(page.getByRole('alert')).toContainText('task arguments would become incompatible');
  await page.getByRole('button', { name: 'Move up', exact: true }).nth(2).click();
  expect((await exported(page)).tasks[moveTask[0]].parameters.map((p) => p.display_name)).toEqual(['Destination', 'Ready', 'Speed']);
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Travel');
  await menu(page, 'Duplicate task');
  const saved = await exported(page), copy = Object.entries(saved.tasks).find(([, t]) => t.display_name === 'Travel (副本)');
  expect(copy[0]).not.toBe(moveTask[0]); copy[1].parameters.forEach((p) => expect(moveTask[1].parameters.map((p) => p.id)).not.toContain(p.id));
  page.once('dialog', (dialog) => dialog.accept()); await menu(page, 'Delete task');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Travel 3', exact: true }).click();
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('1 task uses'); await dialog.accept(); });
  await page.getByRole('button', { name: 'Delete parameter', exact: true }).first().click();
  const after = await exported(page), use = Object.values(after.slots)[0].branches[0].task;
  expect(after.tasks[moveTask[0]].parameters).toHaveLength(2); expect(use.arguments[moveTask[1].parameters[0].id]).toBeUndefined();
  await navigate(page, 'slots');
  await expect(page.locator('.sidebar')).toContainText('Travel');
});

test('computed references are type-filtered, new parameters require values, switching tasks confirms discard', async ({ page }) => {
  await load(page); await navigate(page, 'slots');
  await branch(page).getByRole('button', { name: 'Argument: Ready', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Reference', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search variables', exact: true }).fill('can_act');
  await expect(dialog.getByRole('treeitem', { name: 'can_act', exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Search variables', exact: true }).fill('adjusted_energy');
  await expect(dialog.getByRole('treeitem', { name: 'adjusted_energy', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await selectMove(page); await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).last().fill('Extra');
  await navigate(page, 'days');
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit slot', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await constant(page, branch(page), 'Extra', '5', 'number');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await navigate(page, 'slots');
  page.once('dialog', (d) => d.dismiss());
  await selectFirstDefinedTask(branch(page).getByRole('combobox', { name: 'Task', exact: true }));
  await expect(branch(page).getByRole('combobox', { name: 'Task', exact: true })).toHaveValue(moveTask[0]);
  page.once('dialog', (d) => d.accept());
  await selectFirstDefinedTask(branch(page).getByRole('combobox', { name: 'Task', exact: true }));
  expect(Object.values((await exported(page)).slots)[0].branches[0].task.arguments).toEqual({});
});

test('Chinese mobile task definitions and nested argument dialog keep one modal and visible footer', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), t = translator('zh-TW');
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'tasks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await navigate(page, 'tasks', 'zh-TW');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Move 3', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await navigate(page, 'days', 'zh-TW');
  await page.getByRole('button', { name: t('cell', { count: 1 }), exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: t('editSlot'), exact: true }).click();
  await dialog.getByRole('button', { name: t('argumentFor', { name: 'Speed' }), exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(dialog.locator('.modal-footer')).toBeInViewport();
  await page.keyboard.press('Escape'); await expect(dialog.getByRole('combobox', { name: t('task'), exact: true }).first()).toHaveValue(moveTask[0]);
  await page.keyboard.press('Escape'); await context.close();
});
