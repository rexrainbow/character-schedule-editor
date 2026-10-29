import { exportRuntime } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProject, compileProject } from '../../src/core/model.js';
import { createProjectWithEnvironment } from '../../src/core/environmentModel.js';
import { addOperandNode, addComputedNode } from '../../src/core/operandModel.js';
import { navigate, exportProject } from './navigation.js';

async function load(page, draft) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'environment-expressions.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(draft).data)) });
}
async function download(page, action) { const pending = page.waitForEvent('download'); await action(); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('environment expressions are editable only in environment mode, filter dependencies and export with runtime data', async ({ page }) => {
  const draft = createProjectWithEnvironment('Progress', 3, null);
  const app = addOperandNode(draft.operandNodes, null, 'value', 'Application only', 'application');
  const computed = addComputedNode(app.nodes, null, 'User number'); draft.operandNodes = computed.nodes;
  await load(page, draft);
  await navigate(page, 'expressions');
  await page.getByRole('treeitem', { name: 'Is first slot', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edit definition', exact: true })).toBeDisabled();
  await page.getByRole('treeitem', { name: 'User number', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
  await navigate(page, 'expressions', 'en', 'environment');
  await expect(page.getByRole('treeitem', { name: 'User number', exact: true })).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Is first slot', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Left operand (opA)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('treeitem', { name: 'Application only', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'User number', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('treeitem', { name: 'Current slot', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  const environment = await download(page, async () => { await page.getByRole('button', { name: 'Environment actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export environment', exact: true }).click(); });
  expect(Object.keys(environment.expression_macros)).toHaveLength(5);
  expect(Object.values(environment.expression_macros).every((macro) => macro.scope === 'environment')).toBe(true);
  await navigate(page, 'expressions');
  const runtime = await download(page, () => exportRuntime(page));
  expect(Object.keys(runtime.expression_macros)).toHaveLength(6);
  expect(runtime.expression_macros[computed.id].display_name).toBe('User number');
  expect(Object.values(runtime.expression_macros).some((macro) => macro.name === 'schedule_is_first_slot')).toBe(true);
});

test('existing projects can add the progress preset repeatedly without duplicating UUIDs', async ({ page }) => {
  await load(page, createProject()); await navigate(page, 'operands');
  await page.getByRole('button', { name: 'Add schedule progress', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Read only', exact: true })).toBeChecked();
  const first = await download(page, () => exportProject(page));
  expect(Object.keys(first.operand_nodes)).toHaveLength(7); expect(Object.keys(first.expression_macros)).toHaveLength(5);
  await page.getByRole('button', { name: 'Add schedule progress', exact: true }).click();
  const second = await download(page, () => exportProject(page));
  expect(second.operand_nodes).toEqual(first.operand_nodes); expect(second.expression_macros).toEqual(first.expression_macros);
});
