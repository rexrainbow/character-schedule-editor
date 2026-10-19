import { exportProject, navigate } from './navigation.js';
import { defineSimpleTask, selectFirstDefinedTask } from './taskHelpers.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/computed-example.json' with { type: 'json' };
import { translator } from '../../src/i18n/index.js';

async function exported(page) {
  const wait = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'computed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await navigate(page, 'expressions');
}
async function selectReference(page, container, label, name, index = 0) {
  await container.getByRole('button', { name: label, exact: true }).nth(index).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Reference', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search variables', exact: true }).fill(name);
  await dialog.getByRole('treeitem', { name, exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
}
async function selectConstant(page, container, label, value, index = 0, type = 'number') {
  await container.getByRole('button', { name: label, exact: true }).nth(index).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Constant type', exact: true }).selectOption(type);
  if (type === 'boolean') await dialog.getByRole('combobox', { name: 'Constant value', exact: true }).selectOption(value);
  else await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill(value);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
}
async function addComputed(page, name) {
  await navigate(page, 'expressions');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Add expression macro', exact: true }).click();
  await page.getByRole('textbox', { name: 'Node name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
}

test('numeric and boolean macros reuse the expression and ALL/ANY editors and can be used by slot branches', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await navigate(page, 'operands');
  await page.getByRole('button', { name: 'Value', exact: true }).click();
  await page.getByRole('textbox', { name: 'Node name', exact: true }).fill('Input');
  await addComputed(page, 'A'); const dialog = page.getByRole('dialog');
  await selectReference(page, dialog, 'Numeric expression', 'Input');
  await dialog.getByRole('button', { name: 'Add OP to Numeric expression', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit expression operand B', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog.locator('.expression-preview pre')).toHaveText('(Input + 10)');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await addComputed(page, 'B');
  await selectReference(page, dialog, 'Numeric expression', 'A');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await addComputed(page, 'Can act');
  await dialog.getByRole('combobox', { name: 'Definition kind', exact: true }).selectOption('boolean');
  await expect(dialog.getByRole('textbox', { name: 'Task', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Group mode', exact: true }).selectOption('ANY');
  await selectReference(page, dialog, 'Left operand (opA)', 'A');
  await selectConstant(page, dialog, 'Right operand (opB)', '10');
  await dialog.getByRole('combobox', { name: 'Operator', exact: true }).selectOption('>');
  await dialog.getByRole('button', { name: 'Add group', exact: true }).click();
  await selectReference(page, dialog, 'Left operand (opA)', 'B', 1);
  await selectConstant(page, dialog, 'Right operand (opB)', '3', 1);
  await dialog.getByRole('combobox', { name: 'Operator', exact: true }).nth(1).selectOption('<');
  await expect(dialog.locator('.expression-preview pre')).toContainText('ANY(A > 10, ALL(B < 3))');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Value type', exact: true })).toHaveCount(0);
  await defineSimpleTask(page);
  await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: 'Add slot', exact: true }).click();
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  await page.getByRole('button', { name: 'Add conditional branch', exact: true }).click();
  const branch = page.getByRole('article', { name: 'Branch 1', exact: true });
  for (const select of await page.getByRole('combobox', { name: 'Task', exact: true }).all()) await selectFirstDefinedTask(select);
  await selectReference(page, branch, 'Left operand (opA)', 'Can act');
  await selectConstant(page, branch, 'Right operand (opB)', 'true', 0, 'boolean');
  const saved = await exported(page), macro = Object.entries(saved.expression_macros).find(([, n]) => n.display_name === 'Can act');
  expect(macro[1].source).toBeUndefined(); expect(macro[1].value_type).toBe('boolean');
  expect(Object.values(saved.slots)[0].branches[0].condition.operand_a.expression_macro_id).toBe(macro[0]);
  expect(errors).toEqual([]);
});

test('cycles, dependency type changes and result type changes are blocked while cancel preserves definitions', async ({ page }) => {
  await load(page);
  await page.getByRole('treeitem', { name: 'adjusted_energy', exact: true }).click();
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await selectReference(page, dialog, 'Numeric expression', 'half_energy');
  await expect(dialog.getByRole('alert')).toContainText('dependency cycle');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Definition kind', exact: true }).selectOption('boolean');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('number operands');
  await page.keyboard.press('Escape');
  expect((await exported(page)).operand_nodes).toEqual(example.operand_nodes);
  await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('string');
  await expect(page.getByRole('combobox', { name: 'Value type', exact: true })).toHaveValue('number');
  await expect(page.getByRole('alert')).toContainText('Expression macro: adjusted_energy');
  await expect(page.getByRole('button', { name: 'Delete node', exact: true })).toBeDisabled();
});

test('copying a group remaps macro dependencies and deleting the copy ignores its internal references', async ({ page }) => {
  await load(page); await navigate(page, 'operands'); await page.getByRole('treeitem', { name: 'Character', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate subtree', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete node', exact: true })).toBeEnabled();
  const saved = await exported(page);
  const group = Object.keys(saved.operand_nodes).find((id) => saved.operand_nodes[id].display_name === 'Character (副本)');
  const find = (name) => Object.keys(saved.operand_nodes).find((id) => saved.operand_nodes[id].parent_id === group && saved.operand_nodes[id].display_name === name);
  expect(saved.expression_macros).toEqual(example.expression_macros); expect(find('adjusted_energy')).toBeUndefined();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Delete node', exact: true }).click();
  expect((await exported(page)).operand_nodes).toEqual(example.operand_nodes);
  const bad = structuredClone(example);
  const a = Object.keys(bad.expression_macros).find((id) => bad.expression_macros[id].display_name === 'adjusted_energy');
  bad.expression_macros[a].definition.expression = { type: 'expression_macro_reference', expression_macro_id: a };
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'cycle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('.issues')).toContainText(`/expression_macros/${a}/definition/expression/expression_macro_id`);
  expect((await exported(page)).operand_nodes).toEqual(example.operand_nodes);
});

test('Chinese mobile computed definitions use one modal and keep the footer visible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), t = translator('zh-TW');
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'computed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('expressions');
  await page.getByRole('treeitem', { name: 'can_act', exact: true }).click();
  await page.getByRole('button', { name: t('editDefinition'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: t('mode'), exact: true })).toHaveValue('ANY');
  await dialog.getByRole('button', { name: t('operandA'), exact: true }).first().click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('combobox', { name: t('definitionKind'), exact: true })).toBeVisible();
  await expect(dialog.locator('.modal-footer')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape'); await context.close();
});
