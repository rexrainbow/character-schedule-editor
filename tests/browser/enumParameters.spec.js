import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { enumFixture } from '../enumFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject, switchMode } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
async function load(page, draft) {
  await page.goto('/'); const result = compileProject(draft); expect(result.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'enum.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
test('option definitions support names, unique values, ordering and persisted environment contracts', async ({ page }) => {
  const { draft } = enumFixture(); await load(page, draft); await navigate(page, 'tasks');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Engine choice');
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).fill('Mode');
  await page.getByRole('combobox', { name: 'Parameter type', exact: true }).selectOption('enum');
  await page.getByRole('textbox', { name: 'Option name', exact: true }).fill('Quiet');
  await page.getByRole('textbox', { name: 'Option value', exact: true }).fill('quiet');
  await page.getByRole('button', { name: 'Add option', exact: true }).click();
  await page.getByRole('textbox', { name: 'Option name', exact: true }).nth(1).fill('Loud');
  await page.getByRole('textbox', { name: 'Option value', exact: true }).nth(1).fill('quiet');
  await expect(page.locator('.enum-options-editor')).toContainText('Option values must be unique');
  await page.getByRole('textbox', { name: 'Option value', exact: true }).nth(1).fill('loud');
  await page.locator('.enum-option-row').nth(1).getByRole('button', { name: 'Move up', exact: true }).click();
  const data = await save(page), task = Object.values(data.tasks).find((item) => item.display_name === 'Engine choice');
  expect(task.parameters[0]).toMatchObject({ type: 'enum', options: [{ display_name: 'Loud', value: 'loud' }, { display_name: 'Quiet', value: 'quiet' }] });
  await page.screenshot({ path: 'test-results/enum-definition-desktop.png' });
});
test('macro option parameters forward into probability adjustments and can be selected at invocation', async ({ page }) => {
  const { draft, property, operation, macro } = enumFixture(); await load(page, draft); await navigate(page, 'taskMacros');
  const step = page.locator('.task-step');
  await expect(step.getByRole('combobox', { name: 'Property', exact: true })).toHaveValue(`parameter:${property.id}`);
  await expect(step.getByRole('combobox', { name: 'Operation', exact: true })).toHaveValue(`parameter:${operation.id}`);
  await expect(step.getByRole('combobox', { name: 'Property', exact: true })).toContainText('Property input');
  await page.getByRole('textbox', { name: 'Option name', exact: true }).first().fill('Chance percent');
  await expect(step.getByRole('combobox', { name: 'Property', exact: true })).toHaveValue(`parameter:${property.id}`);
  await navigate(page, 'slots');
  await page.getByRole('combobox', { name: 'Argument: Property input', exact: true }).selectOption('option:cooldown_days');
  await page.getByRole('combobox', { name: 'Argument: Operation input', exact: true }).selectOption('option:set');
  const data = await save(page); expect(Object.values(data.slots)[0].branches[0].task.arguments[property.id]).toEqual({ type: 'constant', value: 'cooldown_days' });
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  const runtime = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(runtime.task_macros[macro.id].steps[0].property).toEqual({ type: 'parameter_reference', parameter_id: property.id });
  await switchMode(page, 'simulation'); await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('day');
  await page.getByRole('combobox', { name: 'Occurrence: Cold', exact: true }).selectOption('true');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Simulation completed');
  await expect(page.locator('.simulation-results')).toContainText('Cold.cooldown_days');
});
test('Chinese mobile enum definitions wrap and used values cannot be removed', async ({ page }) => {
  const { draft } = enumFixture(); await load(page, draft); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const t = translator('zh-TW'); await navigate(page, 'taskMacros', 'zh-TW');
  await page.locator('.enum-option-row').first().getByRole('button', { name: t('deleteEnumOption'), exact: true }).click();
  await expect(page.getByRole('textbox', { name: t('enumOptionValue'), exact: true }).first()).toHaveValue('probability_percent');
  await expect(page.getByRole('alert')).toContainText(t('macroChangeBlocked'));
  await page.locator('.enum-options-editor').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/enum-definition-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
