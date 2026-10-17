import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/expression-example.json' with { type: 'json' };
import plain from '../../src/example.json' with { type: 'json' };
import { translator } from '../../src/i18n.js';

async function load(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'expression.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await navigate(page, 'slots');
}
async function exported(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
const first = (page) => page.getByRole('article', { name: 'Branch 1', exact: true });
const preview = (page) => page.getByRole('dialog').locator('.expression-preview pre');
const apply = (page) => page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
const child = (page, side) => page.getByRole('dialog').getByRole('button', { name: 'Edit expression operand ' + side, exact: true }).click();
async function number(page, text) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill(text);
}
const root = (page) => page.getByRole('dialog').getByRole('button', { name: 'Root operand', exact: true }).click();

test('Add OP wraps the entire operand; nested edits and root navigation commit one expression tree', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await load(page);
  await first(page).getByRole('button', { name: 'Add OP to Left operand (opA)', exact: true }).click();
  await expect(preview(page)).toHaveText('(((Character.energy + 10) * 2) + 0)');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Arithmetic operator', exact: true }).selectOption('-');
  await child(page, 'B'); await number(page, '5'); await root(page);
  await child(page, 'A'); await child(page, 'A'); await child(page, 'B');
  await page.getByRole('dialog').getByRole('button', { name: 'Add OP', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Arithmetic operator', exact: true }).selectOption('*');
  await child(page, 'B'); await number(page, '3');
  await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(preview(page)).toHaveText('(((Character.energy + (10 * 3)) * 2) - 5)');
  await root(page); await apply(page);
  await expect(first(page).getByRole('button', { name: 'Left operand (opA)', exact: true })).toContainText('(((Character.energy + (10 * 3)) * 2) - 5)');
  const saved = await exported(page), op = Object.values(saved.slots)[0].branches[0].condition.operand_a;
  expect(op.operator).toBe('-'); expect(op.operand_b.value).toBe(5);
  expect(op.operand_a.operand_a.operand_b.operator).toBe('*'); expect(op.operand_a.operand_a.operand_b.operand_b.value).toBe(3);
  await first(page).getByRole('button', { name: 'Add OP to Left operand (opA)', exact: true }).click();
  await child(page, 'B'); await number(page, '99'); await page.keyboard.press('Escape');
  expect((await exported(page)).slots).toEqual(saved.slots); expect(errors).toEqual([]);
});

test('Remove OP keeps either side, direct zero blocks Apply, and expression children only select numbers', async ({ page }) => {
  await load(page); await first(page).getByRole('button', { name: 'Left operand (opA)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remove OP', exact: true }).click();
  await dialog.getByRole('button', { name: /^Keep operand A:/ }).click();
  await expect(preview(page)).toHaveText('(Character.energy + 10)');
  await dialog.getByRole('button', { name: 'Remove OP', exact: true }).click();
  await dialog.getByRole('button', { name: /^Keep operand B:/ }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Constant value', exact: true })).toHaveValue('10');
  await expect(preview(page)).toHaveText('10');
  await dialog.getByRole('tab', { name: 'Expression', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Arithmetic operator', exact: true }).selectOption('/');
  await expect(dialog.getByRole('alert')).toContainText('Division by a constant zero');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await child(page, 'B'); await number(page, '');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: 'Constant type', exact: true })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Reference', exact: true }).click();
  await dialog.getByRole('treeitem', { name: 'Character', exact: true }).click();
  await expect(dialog.getByRole('treeitem', { name: 'weather', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'mood', exact: true })).toHaveCount(0);
  await dialog.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await apply(page);
  const op = Object.values((await exported(page)).slots)[0].branches[0].condition.operand_a;
  expect(op.operator).toBe('/'); expect(op.operand_a.value).toBe(10); expect(op.operand_b.type).toBe('reference');
});

test('string operands cannot Add OP; expression results still require numeric comparison partners', async ({ page }) => {
  await load(page, plain);
  await expect(first(page).getByRole('button', { name: 'Add OP to Left operand (opA)', exact: true })).toBeDisabled();
  await first(page).getByRole('button', { name: 'Left operand (opA)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Expression', exact: true })).toBeDisabled();
  await number(page, '30'); await dialog.getByRole('tab', { name: 'Expression', exact: true }).click();
  await expect(preview(page)).toHaveText('(30 + 0)'); await apply(page);
  await expect(first(page)).toContainText('Both operands must have the same type.');
  await exportProject(page);
  await expect(page.getByRole('status')).toContainText('Unable to export');
});

test('nested modal editing preserves slot drafts on cancel and protects deep references and imports', async ({ page }) => {
  await load(page); await navigate(page, 'days');
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Edit slot', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Display name', exact: true }).fill('Expression slot');
  await first(page).getByRole('button', { name: 'Add OP to Left operand (opA)', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await child(page, 'B'); await number(page, ''); await page.keyboard.press('Escape');
  await expect(dialog.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Expression slot');
  await expect(first(page).getByRole('button', { name: 'Left operand (opA)', exact: true })).toContainText('((Character.energy + 10) * 2)');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('boolean');
  await expect(page.getByRole('combobox', { name: 'Value type', exact: true })).toHaveValue('number');
  await expect(page.getByRole('alert')).toContainText('/operand_a/operand_a/operand_a');
  await expect(page.getByRole('button', { name: 'Delete node', exact: true })).toBeDisabled();
  const bad = structuredClone(example); Object.values(bad.slots)[0].branches[0].condition.operand_a.operand_a.operand_a.reference_id = crypto.randomUUID();
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('.issues')).toContainText('/condition/operand_a/operand_a/operand_a/reference_id');
});

test('Chinese mobile expression navigation and wrapping keep the footer visible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), t = translator('zh-TW');
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'expression.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('slots');
  await page.getByRole('article', { name: t('branchLabel', { count: 1 }), exact: true }).getByRole('button', { name: t('operandA'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: t('editExpressionA'), exact: true }).click();
  await dialog.getByRole('button', { name: t('addOperation'), exact: true }).click();
  await expect(dialog.locator('.modal-footer')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.locator('.modal-body:visible').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: t('back'), exact: true }).click();
  await expect(dialog.locator('.expression-preview pre')).toContainText('(((');
  await page.keyboard.press('Escape'); await context.close();
});
