import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/state-example.json' with { type: 'json' };
import { translator } from '../../src/i18n/index.js';
const branch = (page) => page.getByRole('article', { name: 'Branch 1', exact: true });
const dialog = (page) => page.getByRole('dialog');
const idFor = (name) => Object.keys(example.operand_nodes).find((id) => example.operand_nodes[id].display_name === name);
async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
}
async function exported(page) {
  const wait = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
async function target(page, container, name, accept = null) {
  await container.getByRole('button', { name: 'Target variable', exact: true }).click();
  await dialog(page).getByRole('textbox', { name: 'Search variables', exact: true }).fill(name);
  await dialog(page).getByRole('treeitem', { name, exact: true }).click();
  if (accept === true) page.once('dialog', (d) => d.accept());
  else if (accept === false) page.once('dialog', (d) => d.dismiss());
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
}
async function constant(page, container, value, type) {
  await container.getByRole('button', { name: 'Value', exact: true }).click();
  await dialog(page).getByRole('tab', { name: 'Constant', exact: true }).click();
  await expect(dialog(page).getByRole('combobox', { name: 'Constant type', exact: true })).toHaveValue(type);
  await expect(dialog(page).getByRole('combobox', { name: 'Constant type', exact: true })).toBeDisabled();
  if (type === 'boolean') await dialog(page).getByRole('combobox', { name: 'Constant value', exact: true }).selectOption(value);
  else await dialog(page).getByRole(type === 'number' ? 'spinbutton' : 'textbox', { name: 'Constant value', exact: true }).fill(value);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
}

test('variable space, independent expression macros and immutable built-in task have distinct panels', async ({ page }) => {
  await load(page); await navigate(page, 'operands');
  await expect(page.getByRole('treeitem', { name: 'adjusted_energy', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add expression macro', exact: true })).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'weather', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Read only', exact: true })).toBeChecked();
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Read only', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Read only', exact: true })).not.toBeChecked();
  await expect(page.getByRole('alert').first()).toContainText('write references');
  await navigate(page, 'expressions');
  await page.getByRole('treeitem', { name: 'can_act', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Read only', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Root', exact: true })).toHaveCount(0);
  await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Set variable', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Set variable');
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Task actions', exact: true })).toHaveCount(0);
  expect(await exported(page)).toEqual(example);
});

test('assignment target selection excludes read-only/macros and shares numeric expression editing', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await load(page); await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: 'Add slot', exact: true }).click();
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  await branch(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:set_variable');
  await branch(page).getByRole('button', { name: 'Target variable', exact: true }).click();
  await dialog(page).getByRole('textbox', { name: 'Search variables', exact: true }).fill('energy');
  await expect(dialog(page).getByRole('treeitem', { name: 'max_energy', exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole('treeitem', { name: 'adjusted_energy', exact: true })).toHaveCount(0);
  await dialog(page).getByRole('treeitem', { name: 'energy', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await branch(page).getByRole('button', { name: 'Value', exact: true }).click();
  await dialog(page).getByRole('textbox', { name: 'Search variables', exact: true }).fill('energy');
  await dialog(page).getByRole('treeitem', { name: 'energy', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add OP', exact: true }).click();
  await dialog(page).getByRole('combobox', { name: 'Arithmetic operator', exact: true }).selectOption('-');
  await dialog(page).getByRole('button', { name: 'Edit expression operand B', exact: true }).click();
  await dialog(page).getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('10');
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  const saved = await exported(page), use = Object.values(saved.slots).at(-1).branches[0].task;
  expect(use.builtin).toBe('set_variable'); expect(use.target_variable_id).toBe(idFor('energy'));
  expect(use.value.operand_a.reference_id).toBe(idFor('energy')); expect(use.value.operand_b.value).toBe(10);
  await expect(page.locator('.sidebar')).toContainText('Set variable'); expect(errors).toEqual([]);
});

test('incompatible target changes confirm value clearing and string/boolean types remain native', async ({ page }) => {
  await load(page); await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: 'Add slot', exact: true }).click();
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  await branch(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:set_variable');
  await target(page, branch(page), 'energy'); await constant(page, branch(page), '2', 'number');
  await target(page, branch(page), 'mood', false);
  await expect(dialog(page)).toBeVisible(); await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(branch(page).getByRole('button', { name: 'Target variable', exact: true })).toHaveText('Character.energy');
  await target(page, branch(page), 'mood', true); await constant(page, branch(page), '', 'string');
  await target(page, branch(page), 'ready', true); await constant(page, branch(page), 'false', 'boolean');
  const saved = await exported(page), use = Object.values(saved.slots).at(-1).branches[0].task;
  expect(use.value.value).toBe(false); expect(use.target_variable_id).toBe(idFor('ready'));
});

test('assignment values can read local macro inputs or read-only variables without changing their targets', async ({ page }) => {
  await load(page); await navigate(page, 'taskMacros');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Choose trip 2', exact: true }).click();
  const last = page.getByRole('article', { name: 'Branch 2', exact: true });
  await last.getByRole('button', { name: 'Value', exact: true }).click();
  await expect(dialog(page).getByRole('treeitem', { name: 'Destination', exact: true })).toBeVisible();
  await dialog(page).getByRole('textbox', { name: 'Search variables', exact: true }).fill('weather');
  await dialog(page).getByRole('treeitem', { name: 'weather', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  const saved = await exported(page), macro = Object.values(saved.task_macros).find((m) => m.mode === 'branch');
  expect(macro.branches.at(-1).task.value.reference_id).toBe(idFor('weather'));
  expect(macro.branches.at(-1).task.target_variable_id).toBe(idFor('mood'));
  expect(saved.operand_nodes[idFor('weather')].read_only).toBe(true);
});

test('Chinese mobile modal keeps its footer and rejects read-only assignment imports at the write position', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), t = translator('zh-TW');
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('taskMacros');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Shopping 3', exact: true }).click();
  const step = page.getByRole('article', { name: t('taskStep', { count: 3 }), exact: true });
  await step.getByRole('button', { name: t('writeTarget'), exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1); await expect(dialog(page).locator('.modal-footer')).toBeInViewport();
  await expect(dialog(page).getByRole('treeitem', { name: 'max_energy', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const data = structuredClone(example), slotId = Object.keys(data.slots)[1]; data.slots[slotId].branches[0].task.target_variable_id = idFor('max_energy');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('.issues')).toContainText(`/slots/${slotId}/branches/0/task/target_variable_id`);
  await expect(page.locator('.issues')).toContainText(t('readonlyTarget'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
