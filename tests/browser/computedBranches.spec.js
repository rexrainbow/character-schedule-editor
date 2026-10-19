import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { computedBranchFixture, numeric } from '../computedBranchFixture.js';
import { addComputedNode } from '../../src/core/operandModel.js';
import { compileProject } from '../../src/core/model.js';
import { translator } from '../../src/i18n/index.js';
import { navigate, switchMode, exportProject } from './navigation.js';

async function load(page, draft) {
  await page.goto('/'); const result = compileProject(draft); expect(result.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'computed-branches.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
  await navigate(page, 'expressions');
}
async function edit(page, name) { await page.getByRole('treeitem', { name, exact: true }).click(); await page.getByRole('button', { name: 'Edit definition', exact: true }).click(); }
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('single expressions convert losslessly through ELSE and new branch drafts remain isolated on cancel', async ({ page }) => {
  const { draft } = computedBranchFixture(), added = addComputedNode(draft.operandNodes, null, 'Scalar'); draft.operandNodes = added.nodes;
  draft.operandNodes[added.id].definition = numeric(7);
  await load(page, draft); await edit(page, 'Scalar');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Expression mode', exact: true }).selectOption('branch');
  await expect(dialog.getByRole('article', { name: 'Branch 1', exact: true })).toContainText('ELSE');
  await expect(dialog.getByRole('button', { name: 'Return value for branch 1', exact: true })).toHaveText('7');
  await expect(dialog.getByRole('combobox', { name: 'Task', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Expression mode', exact: true }).selectOption('single');
  await expect(dialog.getByRole('button', { name: 'Numeric expression', exact: true })).toHaveText('7');
  await dialog.getByRole('combobox', { name: 'Expression mode', exact: true }).selectOption('branch');
  await dialog.getByRole('button', { name: 'Add conditional branch', exact: true }).click();
  await expect(dialog.getByRole('article')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await save(page)).expression_macros[added.id].definition).toEqual(numeric(7));
});

test('multi-branch conversion requires choosing and confirming the result to keep', async ({ page }) => {
  const { draft, reward } = computedBranchFixture(); await load(page, draft); await edit(page, 'Reward');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Expression mode', exact: true }).selectOption('single');
  await expect(dialog.getByRole('button', { name: 'Keep this result', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Choose the branch result to keep', exact: true }).selectOption('1');
  page.once('dialog', (d) => d.dismiss()); await dialog.getByRole('button', { name: 'Keep this result', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Expression mode', exact: true })).toHaveValue('branch');
  page.once('dialog', (d) => d.accept()); await dialog.getByRole('button', { name: 'Keep this result', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Numeric expression', exact: true })).toHaveText('20');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = await save(page); expect(data.expression_macros[reward].definition).toEqual(numeric(20)); expect(data.expression_macros[reward].engine_key).toBe('calc.reward');
});

test('branch results persist without editor metadata and appear in the simulation trace', async ({ page }) => {
  const { draft, reward } = computedBranchFixture(); await load(page, draft); await edit(page, 'Reward');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Return value for branch 1', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = await save(page); expect(data.expression_macros[reward].definition.branches[0].result.expression.value).toBe(8);
  expect(JSON.stringify(data.expression_macros[reward])).not.toContain('uid');
  await switchMode(page, 'simulation');
  await page.getByRole('spinbutton', { name: 'Schedule progress.Current weekday', exact: true }).fill('6');
  await expect(page.getByRole('status', { name: 'Reward', exact: true })).toHaveText('8');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Return value');
  await expect(page.locator('.simulation-results')).toContainText('Not evaluated');
  await expect(page.locator('.simulation-results')).toContainText('Balance: 0 → 8');
});

test('Chinese mobile environment boolean branches share the result editor and keep the modal footer visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft } = computedBranchFixture(); await load(page, draft);
  const t = translator('zh-TW'); await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await navigate(page, 'expressions', 'zh-TW', 'environment');
  await page.getByRole('treeitem', { name: 'Is later slot', exact: true }).click();
  await page.getByRole('button', { name: t('editDefinition'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: t('computedMode'), exact: true })).toHaveValue('branch');
  await expect(dialog.getByRole('combobox', { name: t('definitionKind'), exact: true })).toHaveValue('boolean');
  await expect(dialog.locator('.computed-result-editor')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: t('apply'), exact: true })).toBeInViewport();
  page.once('dialog', (d) => d.dismiss()); await dialog.getByRole('combobox', { name: t('definitionKind'), exact: true }).selectOption('number');
  await expect(dialog.getByRole('combobox', { name: t('definitionKind'), exact: true })).toHaveValue('boolean');
  await page.screenshot({ path: 'test-results/computed-branches-mobile.png' });
  await dialog.getByRole('button', { name: t('cancel'), exact: true }).click();
});
