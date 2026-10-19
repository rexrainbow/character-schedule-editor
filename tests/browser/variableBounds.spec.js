import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { referenceFixture } from '../referenceFixture.js';
import { builtinVariableFixture } from '../builtinVariableFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject, switchMode } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
async function load(page, draft) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'bounds.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(draft).data)) });
}
async function download(page, action) {
  const pending = page.waitForEvent('download'); await action();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

test('optional limits validate initial values, export both layers and clear without storing null or zero', async ({ page }) => {
  const { draft, counter, local, limit } = referenceFixture(); await load(page, draft);
  await navigate(page, 'operands'); await page.getByRole('treeitem', { name: 'counter', exact: true }).click();
  const min = page.getByRole('spinbutton', { name: 'Minimum value (optional)', exact: true });
  const max = page.getByRole('spinbutton', { name: 'Maximum value (optional)', exact: true });
  await expect(min).toHaveValue(''); await expect(max).toHaveValue('');
  await min.fill('0'); await max.fill('100');
  await page.getByRole('spinbutton', { name: 'Initial value', exact: true }).fill('10');
  await max.fill('5'); await expect(page.getByRole('alert').filter({ hasText: 'Initial value must be within' })).toBeVisible();
  await max.fill('-1'); await expect(page.getByRole('alert').filter({ hasText: 'Minimum value must not exceed' })).toBeVisible();
  await max.fill('100');
  await navigate(page, 'operands', 'en', 'user'); await page.getByRole('treeitem', { name: 'counter', exact: true }).click();
  await expect(min).toBeDisabled(); await expect(max).toBeDisabled();
  await page.getByRole('treeitem', { name: 'Local counter', exact: true }).click(); await min.fill('-5');
  const runtime = await download(page, () => page.getByRole('button', { name: 'Export runtime data', exact: true }).click());
  expect(runtime.environment_variables[0].children.find((node) => node.id === counter).max_value).toBe(100);
  expect(runtime.application_variables.find((node) => node.id === local).min_value).toBe(-5);
  await min.fill(''); const project = await download(page, () => exportProject(page));
  expect(project.operand_nodes[local].min_value).toBeUndefined(); expect(project.operand_nodes[local].max_value).toBeUndefined();
  await navigate(page, 'operands'); await page.getByRole('treeitem', { name: 'text', exact: true }).click();
  await expect(min).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'limit', exact: true }).click(); await min.fill('0'); await max.fill('100');
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('string');
  const changed = await download(page, () => exportProject(page));
  expect(changed.operand_nodes[limit].value_type).toBe('string');
  expect(changed.operand_nodes[limit].min_value).toBeUndefined(); expect(changed.operand_nodes[limit].max_value).toBeUndefined();
});

test('Chinese mobile limits fit and simulation explains numeric clamping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft, number } = builtinVariableFixture(); Object.assign(draft.operandNodes[number], { min_value: 0, max_value: 12 });
  draft.slots[0].branches[0].task.value.value = 10; await load(page, draft);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW'); const t = translator('zh-TW');
  await navigate(page, 'operands', 'zh-TW'); await page.getByRole('treeitem', { name: 'Counter', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: t('minValue'), exact: true })).toHaveValue('0');
  await expect(page.getByRole('spinbutton', { name: t('maxValue'), exact: true })).toHaveValue('12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/variable-bounds-mobile.png', fullPage: true });
  await switchMode(page, 'simulation', 'zh-TW');
  await page.getByRole('button', { name: t('simulationRun'), exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText(t('simulationClamped', { requested: 20, value: 12 }));
});
