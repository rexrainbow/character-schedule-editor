import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { referenceFixture } from '../referenceFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  const fixture = referenceFixture();
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'references.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(fixture.draft).data)) });
  return fixture;
}
async function download(page, action) {
  const wait = page.waitForEvent('download'); await action(); return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
test('typed reference picker filters leaves, cancels drafts and exports an opaque reference', async ({ page }) => {
  const { slot, target, local } = await load(page);
  await navigate(page, 'slots');
  await page.getByRole('button', { name: 'Argument: Target', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('treeitem', { name: 'limit', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'text', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('tab', { name: 'Constant', exact: true })).toHaveCount(0);
  await dialog.getByRole('treeitem', { name: 'Local counter', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Argument: Target', exact: true })).toHaveText('Engine.counter');
  await page.getByRole('button', { name: 'Argument: Target', exact: true }).click();
  await dialog.getByRole('treeitem', { name: 'Local counter', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const project = await download(page, () => exportProject(page));
  expect(project.slots[slot.id].branches[0].task.arguments[target.id]).toEqual({ type: 'variable_reference', reference_id: local });
  const runtime = await download(page, () => page.getByRole('button', { name: 'Export runtime data', exact: true }).click());
  expect(runtime.slots[slot.id].branches[0].task.arguments[0]).toEqual({ type: 'variable_reference', reference_id: local });
});

test('macro reference parameters forward through the picker but cannot be used as expression values or lose write capability', async ({ page }) => {
  await load(page); await navigate(page, 'taskMacros');
  const step = page.getByRole('article', { name: 'Step 1', exact: true });
  await step.getByRole('button', { name: 'Argument: Target', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('treeitem', { name: 'Counter reference', exact: true })).toBeVisible();
  await dialog.getByRole('treeitem', { name: 'Counter reference', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await step.getByRole('button', { name: 'Argument: Amount', exact: true }).click();
  await expect(dialog.getByRole('treeitem', { name: 'Counter reference', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'Amount', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('combobox', { name: 'Variable access', exact: true }).selectOption('read');
  await expect(page.getByRole('combobox', { name: 'Variable access', exact: true })).toHaveValue('read_write');
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('definition controls add reference contracts and support readonly leaf selection for read access', async ({ page }) => {
  await load(page); await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Increment variable 2', exact: true }).click();
  await page.getByRole('combobox', { name: 'Variable access', exact: true }).selectOption('read');
  await expect(page.getByRole('combobox', { name: 'Variable access', exact: true })).toHaveValue('read');
  await page.getByRole('combobox', { name: 'Referenced variable type', exact: true }).selectOption('string');
  await expect(page.getByRole('combobox', { name: 'Referenced variable type', exact: true })).toHaveValue('number');
  await navigate(page, 'slots');
  await page.getByRole('button', { name: 'Argument: Target', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Search variables', exact: true }).fill('limit');
  await dialog.getByRole('treeitem', { name: 'limit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Argument: Target', exact: true })).toHaveText('Engine.limit');
  await navigate(page, 'tasks');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByRole('combobox', { name: 'Parameter type', exact: true }).selectOption('variable_reference');
  await expect(page.getByRole('combobox', { name: 'Referenced variable type', exact: true })).toHaveValue('number');
  await expect(page.getByRole('combobox', { name: 'Variable access', exact: true })).toHaveValue('read_write');
});
