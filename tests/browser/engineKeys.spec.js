import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/task-example.json' with { type: 'json' };
import { exportProject, navigate } from './navigation.js';

async function exported(page) {
  const wait = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
test('cross-type key warnings permit export, copies clear keys, and modal Back discards key edits', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await navigate(page, 'days');
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('workday');
  await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Move 3', exact: true }).click();
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('workday');
  await expect(page.locator('.engine-key-field .engine-key-warning')).toBeVisible();
  await expect(page.locator('.engine-key-field .engine-key-warning')).toHaveAttribute('title', /Days:/);
  const saved = await exported(page);
  expect(Object.values(saved.tasks).some((task) => task.symbol === 'workday')).toBe(true);
  await page.getByRole('button', { name: 'Task actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate task', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Engine key', exact: true })).toHaveValue('');
  await navigate(page, 'days');
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit slot', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Engine key', exact: true }).fill('workday');
  await expect(dialog.locator('.engine-key-warning')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(Object.values((await exported(page)).slots).some((slot) => slot.symbol === 'workday')).toBe(false);
  expect(errors).toEqual([]);
});

test('environment keys are definition-locked and icon/name/key fields fit mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('energy');
  await navigate(page, 'operands', 'en', 'user');
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Engine key', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Engine key', exact: true })).toHaveValue('energy');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
