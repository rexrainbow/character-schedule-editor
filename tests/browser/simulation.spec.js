import { createActionSlot as createSlot } from '../slotFixture.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { builtinVariableFixture } from '../builtinVariableFixture.js';
import { referenceFixture } from '../referenceFixture.js';
import { computedBranchFixture, numeric } from '../computedBranchFixture.js';
import { compileProject } from '../../src/core/model.js';
import { createProjectWithEnvironment } from '../../src/core/environmentModel.js';
import { createTaskMacro } from '../../src/core/taskMacroModel.js';
import { translator } from '../../src/i18n/index.js';
import { switchMode, exportProject } from './navigation.js';

async function load(page, draft) {
  await page.goto('/');
  const data = compileProject(draft); expect(data.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'simulation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data.data)) });
  await switchMode(page, 'simulation');
  return data.data;
}

test('unconditional slots, task macros and computed branches omit ELSE while conditional fallbacks use natural labels', async ({ page }) => {
  const { draft, reward, slot } = computedBranchFixture();
  const action = structuredClone(slot.branches[0].task);
  draft.operandNodes[reward].definition = { kind: 'branch', branches: [{ condition: null, result: numeric(20) }] };
  const macro = createTaskMacro('Reward macro', 'branch');
  macro.branches[0].task = action; draft.taskMacros = [macro];
  slot.branches[0].task = { task_macro_id: macro.id, arguments: {} };
  await load(page, draft);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const results = page.locator('.simulation-results');
  await expect(results).toContainText('Executing: Reward macro');
  await expect(results).toContainText('Balance: 0 → 20');
  await expect(results).toContainText('Return value');
  await expect(results).not.toContainText('ELSE');
  await expect(results).not.toContainText('Branch 1');
  await expect(results).not.toContainText('None of the preceding conditions matched');

  const conditional = computedBranchFixture();
  await load(page, conditional.draft);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(results).toContainText('None of the preceding conditions matched');
  await expect(results).toContainText('false');
  await expect(results).not.toContainText('ELSE');
  const fallback = results.locator('summary').filter({ hasText: 'None of the preceding conditions matched' });
  await expect(fallback).toHaveCount(1);
  await expect(fallback.locator('strong')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(results).toContainText('其餘條件皆不成立');
  await expect(results).toContainText('正在執行：');
});

test('simulation inputs, repeated runs, explicit apply and reset never modify the project', async ({ page }) => {
  const { draft } = builtinVariableFixture(), project = await load(page, draft);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-mode', 'simulation');
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('20');
  await page.getByRole('spinbutton', { name: 'Engine.Readonly', exact: true }).fill('45');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('20 → 18');
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('20');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('20 → 18');
  await page.getByRole('button', { name: 'Use resulting values', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('18');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.getByRole('tab', { name: 'Variable changes', exact: true }).click();
  await expect(page.locator('.simulation-change-table')).toContainText('16');
  const pending = page.waitForEvent('download'); await exportProject(page);
  expect(JSON.parse(await readFile(await (await pending).path(), 'utf8'))).toEqual(project);
  await page.getByRole('button', { name: 'Reset inputs', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('10');
  await expect(page.getByRole('spinbutton', { name: 'Engine.Readonly', exact: true })).toHaveValue('10');
});

test('opaque engine calls and scoped macro references are traced, sessions persist and editing invalidates results', async ({ page }) => {
  const { draft, macroSlot } = referenceFixture(); await load(page, draft);
  await page.getByRole('combobox', { name: 'Slot schedule to simulate', exact: true }).selectOption(macroSlot.id);
  await page.getByRole('spinbutton', { name: 'Engine.counter', exact: true }).fill('5');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Executing: Increase counter');
  await expect(page.locator('.simulation-results')).toContainText('Executing: Increment variable');
  await expect(page.locator('.simulation-results')).toContainText('leave all variables unchanged');
  await expect(page.locator('.simulation-results')).toContainText('Local counter');
  await page.getByRole('button', { name: 'Open slot schedule', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(macroSlot.name);
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Edited simulation slot');
  await switchMode(page, 'simulation');
  await expect(page.getByRole('spinbutton', { name: 'Engine.counter', exact: true })).toHaveValue('5');
  await expect(page.locator('.simulation-results')).toContainText('Set test values and run');
});

test('runtime expression failures show paths, stop execution and prevent applying partial results', async ({ page }) => {
  const { draft, number } = builtinVariableFixture();
  const empty = createTaskMacro('Debug only'); draft.taskMacros = [empty];
  const action = { task_macro_id: empty.id, arguments: {} };
  draft.slots[0].branches = [{ uid: crypto.randomUUID(), condition: { kind: 'comparison', comparator: '>', operand_a: { type: 'expression', operator: '/', operand_a: { type: 'constant', value: 1 }, operand_b: { type: 'reference', reference_id: number } }, operand_b: { type: 'constant', value: 0 } }, task: action }, { uid: crypto.randomUUID(), condition: null, task: action }];
  await load(page, draft);
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results .issues')).toContainText(translator('en')('divisionByZero'));
  await expect(page.locator('.simulation-results .issues')).toContainText('/operand_b');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('5');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('No actions; completed');
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('');
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeDisabled();
});

test('Chinese mobile simulation edits readonly progress, evaluates macros and switches input/result tabs', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'zh-TW' });
  try {
    const page = await context.newPage(), t = translator('zh-TW'), draft = createProjectWithEnvironment('模擬專案', 3, null, undefined, t);
    const empty = createTaskMacro('周末活動'); draft.taskMacros = [empty];
    const slot = createSlot([], '周末測試'); slot.branches[0].task = { task_macro_id: empty.id, arguments: {} }; draft.slots = [slot];
    await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'mobile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(draft).data)) });
    await switchMode(page, 'simulation', 'zh-TW');
    await page.getByRole('spinbutton', { name: '行程進度.目前星期', exact: true }).fill('6');
    await expect(page.getByRole('status', { name: '是否周末', exact: true })).toHaveText('true');
    await page.getByRole('button', { name: t('simulationRun'), exact: true }).click();
    await expect(page.getByRole('tab', { name: t('simulationResults'), exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.simulation-results')).toContainText('正在執行：周末活動');
    await expect(page.locator('.simulation-results')).toContainText('沒有動作，完成');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: 'test-results/simulation-mobile.png' });
    await page.getByRole('tab', { name: t('simulationInputs'), exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '行程進度.目前星期', exact: true })).toHaveValue('6');
  } finally { await context.close(); }
});
