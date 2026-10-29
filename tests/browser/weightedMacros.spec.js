import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { weightedBlueprint } from '../weightedMacroFixture.js';
import { exportProject, switchMode } from './navigation.js';

async function load(page) {
  const result = importBlueprint(weightedBlueprint); expect(result.errors).toEqual([]);
  await page.goto('/#/user/task-macros/lottery');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'weighted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
  await expect(page.getByRole('combobox', { name: 'Macro mode', exact: true })).toHaveValue('random');
  return result;
}
const candidate = (page, index = 1) => page.getByRole('article', { name: `Candidate ${index}`, exact: true });

test('weighted editor orders eligibility, weight and action; edits, copies, reorders and exports fallback', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page);
  await expect(page.locator('.weighted-mode-order')).toContainText('Evaluate all candidate arguments and eligibility');
  const bounds = await Promise.all([candidate(page).locator('.candidate-condition-summary').boundingBox(), candidate(page).locator('.candidate-weight').boundingBox(), candidate(page).locator('.task-select').boundingBox()]);
  expect(bounds[0].y).toBeLessThan(bounds[1].y); expect(bounds[1].y).toBeLessThan(bounds[2].y);
  await page.getByRole('button', { name: 'Add candidate', exact: true }).last().click();
  await candidate(page, 3).getByRole('combobox', { name: 'Task', exact: true }).selectOption({ label: 'Rest' });
  await candidate(page, 3).getByRole('button', { name: 'Random weight', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await candidate(page, 3).getByRole('button', { name: 'Duplicate candidate', exact: true }).click();
  await candidate(page, 4).getByRole('button', { name: 'Move up', exact: true }).click();
  await candidate(page, 4).getByRole('button', { name: 'Delete candidate', exact: true }).click();
  await page.getByRole('button', { name: 'Remove fallback action', exact: true }).click();
  await page.getByRole('button', { name: 'Set fallback action', exact: true }).click();
  await page.locator('.weighted-fallback').getByRole('combobox', { name: 'Task', exact: true }).selectOption({ label: 'Rest' });
  const pending = page.waitForEvent('download'); await exportProject(page);
  const saved = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  const macro = Object.values(saved.task_macros).find((item) => item.name === 'lottery');
  expect(macro.candidates.map((item) => item.weight.value)).toEqual([1, 0, 3]);
  expect(macro.fallback.task.task_macro_id).toBe(Object.keys(saved.task_macros).find((id) => saved.task_macros[id].name === 'rest'));
  await page.locator('.logic-overview-toggle').click();
  await expect(page.locator('.logic-overview')).toContainText('Fallback action');
  await page.locator('.weighted-candidates-editor .task-step').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/weighted-editor-desktop.png' });
  expect(errors).toEqual([]);
});

test('weighted simulator shows fallback and eligible selection; Chinese mobile editor reuses the same controls', async ({ page }) => {
  await load(page); await switchMode(page, 'simulation');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('No selectable candidate; run fallback.');
  await expect(page.locator('.simulation-results')).toContainText('Balance: 0 → 2');
  await page.getByRole('spinbutton', { name: 'Stamina', exact: true }).fill('20');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Selected candidate 1');
  await expect(page.locator('.simulation-results')).toContainText('Balance: 0 → 10');
  await switchMode(page, 'user');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('combobox', { name: '巨集模式', exact: true })).toHaveValue('random');
  await expect(page.locator('.weighted-mode-order')).toContainText('先求值所有候選');
  await expect(page.getByRole('button', { name: '隨機權重', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.weighted-candidates-editor .task-step').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/weighted-editor-mobile.png' });
});
