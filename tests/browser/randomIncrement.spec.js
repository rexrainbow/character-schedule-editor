import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { builtinVariableFixture } from '../builtinVariableFixture.js';
import { compileProject } from '../../src/core/model.js';
import { translator } from '../../src/i18n/index.js';
import { navigate, exportProject, switchMode } from './navigation.js';

async function load(page, draft) {
  await page.goto('/');
  const project = compileProject(draft); expect(project.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'random.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project.data)) });
}

test('integer constraint validates values, respects environment locks and saves amplitude with editable metadata', async ({ page }) => {
  const { draft, number } = builtinVariableFixture(); await load(page, draft);
  await navigate(page, 'operands'); await page.getByRole('treeitem', { name: 'Counter', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Integer only', exact: true });
  await checkbox.check();
  const initial = page.getByRole('spinbutton', { name: 'Initial value', exact: true });
  await expect(initial).toHaveAttribute('step', '1'); await initial.fill('10.5');
  await expect(page.getByRole('alert')).toContainText(translator('en')('integerValueRequired'));
  await initial.fill('10');
  await navigate(page, 'operands', 'en', 'user'); await page.getByRole('treeitem', { name: 'Counter', exact: true }).click();
  await expect(checkbox).toBeDisabled(); await expect(checkbox).toBeChecked();
  await navigate(page, 'tasks'); await page.locator('.operand-sidebar').getByRole('button', { name: 'Increase value', exact: true }).click();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).nth(2).fill('Random spread');
  await navigate(page, 'slots'); await page.getByRole('button', { name: 'Random spread', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Constant value', exact: true })).toHaveValue('0');
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const pending = page.waitForEvent('download'); await exportProject(page);
  const data = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(data.operand_nodes[number].integer_only).toBe(true);
  expect(data.slots[draft.slots[0].id].branches[0].task.random_amplitude).toEqual({ type: 'constant', value: 2 });
  expect(data.builtin_tasks.increment_variable.parameters.random_amplitude.display_name).toBe('Random spread');
});

test('seed repeats random results and Chinese mobile integer inputs reject fractions', async ({ page }) => {
  const { draft, number } = builtinVariableFixture(); draft.operandNodes[number].integer_only = true;
  Object.assign(draft.slots[0].branches[0].task, { value: { type: 'constant', value: 10 }, random_amplitude: { type: 'constant', value: 2 } });
  await load(page, draft); await switchMode(page, 'simulation');
  await page.getByRole('textbox', { name: 'Random seed', exact: true }).fill('repeatable');
  const run = page.getByRole('button', { name: 'Run simulation', exact: true }); await run.click();
  await expect(page.locator('.simulation-results')).toContainText('sampled offset');
  const trace = await page.locator('.simulation-trace').first().innerText();
  await run.click(); expect(await page.locator('.simulation-trace').first().innerText()).toBe(trace);
  await page.screenshot({ path: 'test-results/random-increment-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW'); const t = translator('zh-TW');
  await page.getByRole('tab', { name: t('simulationInputs'), exact: true }).click();
  const input = page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true });
  await expect(input).toHaveAttribute('step', '1'); await input.fill('10.5');
  await expect(page.getByRole('button', { name: t('simulationRun'), exact: true })).toBeDisabled();
  await input.fill('10'); await expect(page.getByRole('button', { name: t('simulationRun'), exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: t('simulationRandomSeed'), exact: true })).toHaveValue('repeatable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/random-increment-mobile.png' });
});
