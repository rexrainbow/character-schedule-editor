import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/task-example.json' with { type: 'json' };
import { exportProject, navigate, switchMode } from './navigation.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
}

test('mode navigation remembers selection/search and protects environment definitions in user mode', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-mode', 'user');
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'User editing', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('menuitemradio', { name: 'Environment editing', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tab', { name: 'Task definitions', exact: true })).toHaveCount(0);
  await navigate(page, 'operands', 'en', 'user');
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Read only', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Duplicate subtree', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Value', exact: true }).click();
  await page.getByRole('textbox', { name: 'Node name', exact: true }).fill('Application counter');
  await page.getByRole('textbox', { name: 'Search variables', exact: true }).fill('counter');
  await navigate(page, 'tasks');
  await expect(page.getByRole('tab', { name: 'Slots', exact: true })).toHaveCount(0);
  await switchMode(page, 'user');
  await expect(page.getByRole('tab', { name: 'Application variables', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Search variables', exact: true })).toHaveValue('counter');
  await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toHaveValue('Application counter');
  await switchMode(page, 'environment');
  await expect(page.getByRole('tab', { name: 'Task definitions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
  await expect(page.getByRole('treeitem', { name: 'Application counter', exact: true })).toHaveCount(0);
  const wait = page.waitForEvent('download'); await exportProject(page);
  const data = JSON.parse(await readFile(await (await wait).path(), 'utf8'));
  expect(Object.values(data.operand_nodes).find((node) => node.display_name === 'Application counter').scope).toBe('application');
  expect(errors).toEqual([]);
});

test('mode menu and environment badge fit the single-row mobile header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  for (const mode of ['environment', 'user']) {
    await switchMode(page, mode);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('.environment-badge')).toHaveCount(mode === 'environment' ? 1 : 0);
    await expect(page.getByRole('button', { name: 'Project menu', exact: true })).toBeInViewport();
    expect(await page.locator('.app-header').evaluate((el) => el.getBoundingClientRect().height)).toBe(56);
    await expect(page.getByRole('combobox', { name: 'Editor page', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('user task assignments can write writable environment values and read application values', async ({ page }) => {
  await load(page);
  await navigate(page, 'operands', 'en', 'user');
  await page.getByRole('button', { name: 'Value', exact: true }).click();
  await page.getByRole('textbox', { name: 'Node name', exact: true }).fill('User counter');
  await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: 'Add slot', exact: true }).click();
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  const branch = page.getByRole('article', { name: 'Branch 1', exact: true });
  await branch.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:set_variable');
  await branch.getByRole('button', { name: 'Target variable', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Variables', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Application variables', exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Search variables', exact: true }).fill('energy');
  await dialog.getByRole('treeitem', { name: 'energy', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await branch.getByRole('button', { name: 'Value', exact: true }).click();
  await dialog.getByRole('treeitem', { name: 'User counter', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const wait = page.waitForEvent('download'); await exportProject(page);
  const data = JSON.parse(await readFile(await (await wait).path(), 'utf8'));
  const task = Object.values(data.slots).at(-1).branches[0].task;
  expect(data.operand_nodes[task.target_variable_id].display_name).toBe('energy');
  expect(data.operand_nodes[task.value.reference_id].scope).toBe('application');
});
