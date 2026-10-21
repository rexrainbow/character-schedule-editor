import { exportRuntime } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { referenceFixture } from '../referenceFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  const fixture = referenceFixture();
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'initial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(fixture.draft).data)) });
  return fixture;
}
async function download(page, action) {
  const wait = page.waitForEvent('download'); await action();
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}

test('initial values respect layer locks and runtime exports include unused environment values', async ({ page }) => {
  const { counter, local } = await load(page);
  await navigate(page, 'operands', 'en', 'user');
  await page.getByRole('treeitem', { name: 'Local counter', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Initial value', exact: true }).fill('42.5');
  await page.getByRole('treeitem', { name: 'counter', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Initial value', exact: true })).toBeDisabled();
  await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'limit', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Initial value', exact: true }).fill('8');
  await expect(page.getByRole('checkbox', { name: 'Read only', exact: true })).toBeChecked();
  await navigate(page, 'operands', 'en', 'user');
  const runtime = await download(page, () => exportRuntime(page));
  expect(runtime.application_variables.find((n) => n.id === local).initial_value).toBe(42.5);
  const leaves = runtime.environment_variables[0].children;
  expect(leaves.find((n) => n.display_name === 'limit').initial_value).toBe(8);
  expect(leaves.find((n) => n.id === counter).initial_value).toBe(0);
  expect(runtime.environment_requirements.variables.some((n) => n.name === 'limit')).toBe(false);
});

test('type changes confirm initial value reset, cancel preserves data, and all three inputs save typed values', async ({ page }) => {
  const { text } = await load(page); await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Initial value', exact: true }).fill('hello');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('boolean');
  await expect(page.getByRole('textbox', { name: 'Initial value', exact: true })).toHaveValue('hello');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('boolean');
  await expect(page.getByRole('combobox', { name: 'Initial value', exact: true })).toHaveValue('false');
  await page.getByRole('combobox', { name: 'Initial value', exact: true }).selectOption('true');
  const project = await download(page, () => exportProject(page));
  expect(project.operand_nodes[text].initial_value).toBe(true);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('number');
  await expect(page.getByRole('spinbutton', { name: 'Initial value', exact: true })).toHaveValue('0');
  await page.getByRole('spinbutton', { name: 'Initial value', exact: true }).fill('');
  await expect(page.getByRole('alert').filter({ hasText: 'The initial value must match' })).toBeVisible();
});
