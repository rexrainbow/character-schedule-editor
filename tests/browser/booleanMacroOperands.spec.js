import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { computedBranchFixture, compare, constant } from '../computedBranchFixture.js';
import { addComputedNode } from '../../src/operandModel.js';
import { compileProject } from '../../src/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';
import { translator } from '../../src/i18n.js';

async function load(page) {
  const f = computedBranchFixture();
  const result = addComputedNode(f.draft.operandNodes, null, 'Application ready');
  result.nodes[result.id] = { ...result.nodes[result.id], value_type: 'boolean', definition: { kind: 'boolean', condition: compare(constant(true), '==', constant(true)) } }; f.draft.operandNodes = result.nodes;
  f.slot.branches = [
    { uid: crypto.randomUUID(), condition: compare(constant(true), '==', constant(true)), task: { builtin: 'set_variable', target_variable_id: f.balance, value: constant(10) } },
    { uid: crypto.randomUUID(), condition: null, task: { builtin: 'set_variable', target_variable_id: f.balance, value: constant(0) } },
  ];
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'boolean-macros.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(f.draft).data)) });
  await navigate(page, 'slots'); return f;
}

test('Boolean-returning macros are selectable from Boolean constants and round-trip into evaluated comparisons', async ({ page }) => {
  const { later, slot } = await load(page);
  await page.getByRole('button', { name: translator('en')('operandA'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Expression macros', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('tab', { name: 'Numeric operation', exact: true })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Expression macros', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search expression macros', exact: true }).fill('Is later slot');
  await dialog.getByRole('treeitem', { name: 'Is later slot', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: translator('en')('operandA'), exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'Expression macros', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('treeitem', { name: 'Is later slot', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const pending = page.waitForEvent('download'); await exportProject(page);
  const saved = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(saved.slots[slot.id].branches[0].condition.operand_a).toEqual({ type: 'expression_macro_reference', expression_macro_id: later });
  await switchMode(page, 'simulation');
  await page.getByRole('spinbutton', { name: 'Schedule progress.Current slot', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Balance: 0 → 10');
});

test('Chinese mobile picker offers both variable layers of Boolean macros but numeric arguments filter them out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW'); const t = translator('zh-TW');
  await page.getByRole('button', { name: t('operandB'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: t('expressions'), exact: true }).click();
  await expect(dialog.getByRole('treeitem', { name: 'Is later slot', exact: true })).toBeVisible();
  await dialog.getByRole('treeitem', { name: 'Application ready', exact: true }).click();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: t('apply'), exact: true }).click();
  await page.locator('.task-editor').first().getByRole('button', { name: t('assignmentValue'), exact: true }).click();
  await dialog.getByRole('tab', { name: t('expressions'), exact: true }).click();
  await expect(dialog.getByRole('treeitem', { name: 'Application ready', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'Is later slot', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'Reward', exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: t('searchExpressions'), exact: true }).fill('not found');
  await expect(dialog).toContainText(t('noMatchingExpressionMacros'));
});
