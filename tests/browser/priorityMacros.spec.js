import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { priorityMacroFixture } from '../priorityMacroFixture.js';
import { compileProject } from '../../src/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';
async function load(page) {
  const fixture = priorityMacroFixture(); await page.goto('/'); const compiled = compileProject(fixture.draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'priority.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await navigate(page, 'taskMacros'); return fixture;
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
const candidate = (page, index = 1) => page.getByRole('article', { name: `Candidate ${index}`, exact: true });
async function selectPriority(page) { await page.locator('.operand-sidebar').getByRole('button', { name: /Choose activity/ }).click(); }

test('priority editor filters candidates, reorders and duplicates calls, and opens the shared condition definition', async ({ page }) => {
  const { priority, eligible, amount } = await load(page); await selectPriority(page);
  await expect(page.getByRole('combobox', { name: 'Macro mode', exact: true })).toHaveValue('priority');
  const select = candidate(page).getByRole('combobox', { name: 'Task', exact: true });
  await expect(select.locator('option')).toHaveCount(3);
  await expect(select.locator('optgroup[label="Variable operations"]')).toHaveCount(0);
  await expect(candidate(page).locator('.candidate-condition-summary')).toContainText('Engine.Counter');
  await candidate(page).getByRole('button', { name: 'Duplicate candidate', exact: true }).click();
  await expect(page.locator('.task-step')).toHaveCount(4);
  await candidate(page, 2).getByRole('button', { name: 'Delete candidate', exact: true }).click();
  await candidate(page, 2).getByRole('button', { name: 'Move up', exact: true }).click();
  const project = await save(page);
  expect(project.task_macros[priority.id].candidates[0].task.arguments[amount.id].value).toBe(5);
  expect(project.task_macros[priority.id].candidates[1].task.arguments[amount.id].value).toBe(20);
  await candidate(page).getByRole('button', { name: 'Open task macro', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(eligible.display_name);
  await expect(page.getByRole('combobox', { name: 'Macro mode', exact: true })).toHaveValue('sequence');
  await expect(page.locator('.macro-eligibility')).not.toHaveAttribute('open', '');
  await page.locator('.macro-eligibility summary').click();
  await expect(page.locator('.macro-eligibility .condition-comparison')).toHaveCount(1);
});

test('new conditional tasks and priority lists use shared task controls and persist complete data', async ({ page }) => {
  const { priority } = await load(page);
  await page.getByRole('button', { name: 'Add task macro', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Always override');
  await page.locator('.macro-eligibility summary').click();
  await page.getByRole('button', { name: 'Set eligibility condition', exact: true }).click();
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:schedule_takeover');
  await expect(page.locator('.task-step')).toContainText('Evaluate the condition once.');
  const project = await save(page), [id, gate] = Object.entries(project.task_macros).find(([, item]) => item.display_name === 'Always override');
  expect(gate.mode).toBe('sequence'); expect(gate.steps[0].task).toEqual({ builtin: 'schedule_takeover', condition: { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: true }, operand_b: { type: 'constant', value: true } }, scope: 'day', target: 'main' });
  await selectPriority(page); await page.getByRole('button', { name: 'Add candidate', exact: true }).last().click();
  await candidate(page, 4).getByRole('combobox', { name: 'Task', exact: true }).selectOption(`macro:${id}`);
  const saved = await save(page); expect(saved.task_macros[priority.id].candidates[3].task).toEqual({ task_macro_id: id, arguments: {} });
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'reload.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await navigate(page, 'taskMacros'); await selectPriority(page);
  await expect(candidate(page, 4).locator('.candidate-condition-summary')).toContainText('0 == 0');
});

test('simulation traces lazy candidate selection and stops on a visited eligibility error', async ({ page }) => {
  await load(page); await switchMode(page, 'simulation');
  await page.getByRole('spinbutton', { name: 'Engine.Readonly', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const results = page.locator('.simulation-results');
  await expect(results).toContainText('Candidate 1: Eligible increase'); await expect(results).toContainText('Candidate 2: Eligible increase');
  await expect(results).toContainText('Not evaluated'); await expect(results).toContainText('10 → 15');
  await expect(results.locator('.issues')).toHaveCount(0);
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(results.locator('.issues')).toContainText('/eligibility/operand_a/operand_b');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeDisabled();
});

test('Chinese mobile candidate summaries and conditional editing fit the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await selectPriority(page); await expect(page.getByRole('combobox', { name: '巨集模式', exact: true })).toHaveValue('priority');
  await page.getByRole('button', { name: '\u958b\u555f\u4efb\u52d9\u5de8\u96c6', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: '\u5de8\u96c6\u6a21\u5f0f', exact: true })).toHaveValue('sequence');
  await expect(page.locator('.macro-eligibility')).not.toHaveAttribute('open', '');
  await page.locator('.macro-eligibility summary').click();
  await expect(page.locator('.macro-eligibility .condition-comparison')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/conditional-task-mobile.png', fullPage: true });
});
