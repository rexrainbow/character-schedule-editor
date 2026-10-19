import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/task-sequence-example.json' with { type: 'json' };
import plain from '../../src/examples/task-example.json' with { type: 'json' };
import { translator } from '../../src/i18n/index.js';

const [sequenceId, sequence] = Object.entries(example.task_macros)[0];
const [taskId, task] = Object.entries(example.tasks).find(([, task]) => task.display_name === 'Move');
const dialog = (page) => page.getByRole('dialog');
const step = (page, count = 1) => page.getByRole('article', { name: 'Step ' + count, exact: true });
async function load(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'sequences.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await navigate(page, 'taskMacros');
}
async function exported(page) {
  const wait = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
async function menu(page, action) {
  await page.getByRole('button', { name: 'Task macro actions', exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
async function constant(page, container, name, value, type) {
  await container.getByRole('button', { name: 'Argument: ' + name, exact: true }).click();
  await dialog(page).getByRole('tab', { name: 'Constant', exact: true }).click();
  if (type === 'boolean') await dialog(page).getByRole('combobox', { name: 'Constant value', exact: true }).selectOption(value);
  else await dialog(page).getByRole(type === 'number' ? 'spinbutton' : 'textbox', { name: 'Constant value', exact: true }).fill(value);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
}

test('create a sequence, bind scoped and project variables, order steps and call it from a slot', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await load(page, plain);
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Add task macro', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Trip');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/This macro has no actions/)).toBeVisible();
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).fill('Velocity');
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await step(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption(taskId);
  await expect(step(page).getByRole('combobox', { name: 'Task', exact: true }).locator('optgroup[label="Task macros"]')).toHaveCount(0);
  await constant(page, step(page), 'Destination', 'Shop', 'string');
  await step(page).getByRole('button', { name: 'Argument: Speed', exact: true }).click();
  await dialog(page).getByRole('treeitem', { name: 'Velocity', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add OP', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Edit expression operand B', exact: true }).click();
  await dialog(page).getByRole('tab', { name: 'Reference', exact: true }).click();
  await dialog(page).getByRole('textbox', { name: 'Search variables', exact: true }).fill('adjusted_energy');
  await dialog(page).getByRole('treeitem', { name: 'adjusted_energy', exact: true }).click();
  await expect(dialog(page).locator('.expression-preview pre')).toHaveText('(Macro parameters.Velocity + adjusted_energy)');
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await step(page).getByRole('button', { name: 'Argument: Ready', exact: true }).click();
  await expect(dialog(page).getByRole('treeitem', { name: 'Velocity', exact: true })).toHaveCount(0);
  await dialog(page).getByRole('textbox', { name: 'Search variables', exact: true }).fill('can_act');
  await dialog(page).getByRole('treeitem', { name: 'can_act', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await step(page).getByRole('button', { name: 'Duplicate step', exact: true }).click();
  await step(page, 2).getByRole('button', { name: 'Move up', exact: true }).click();
  let saved = await exported(page), [id, seq] = Object.entries(saved.task_macros)[0];
  expect(seq.steps).toHaveLength(2); expect(seq.steps[0].id).not.toBe(seq.steps[1].id);
  expect(seq.steps[0].task.arguments[task.parameters[1].id].operand_a.parameter_id).toBe(seq.parameters[0].id);
  await step(page, 2).getByRole('button', { name: 'Delete step', exact: true }).click();
  await navigate(page, 'slots');
  const branch = page.getByRole('article', { name: 'Branch 1', exact: true });
  page.once('dialog', (d) => d.accept()); await branch.getByRole('combobox', { name: 'Task', exact: true }).selectOption('macro:' + id);
  await constant(page, branch, 'Velocity', '5', 'number');
  saved = await exported(page); expect(Object.values(saved.slots)[0].branches[0].task).toEqual({ task_macro_id: id, arguments: { [seq.parameters[0].id]: { type: 'constant', value: 5 } } });
  await navigate(page, 'days');
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Edit slot', exact: true }).click();
  await expect(dialog(page).getByRole('combobox', { name: 'Task', exact: true }).first()).toHaveValue('macro:' + id);
  await dialog(page).getByRole('button', { name: 'Argument: Velocity', exact: true }).click();
  await dialog(page).getByRole('tab', { name: 'Reference', exact: true }).click();
  await expect(dialog(page).getByRole('tree', { name: 'Macro parameters', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await constant(page, dialog(page), 'Velocity', '6', 'number');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  expect(Object.values((await exported(page)).slots)[0].branches[0].task.arguments[seq.parameters[0].id].value).toBe(6);
  await navigate(page, 'weeks');
  await page.locator('.sidebar').getByRole('button', { name: 'Add week', exact: true }).click();
  await page.getByRole('button', { name: 'Monday / Slot 1', exact: true }).click();
  await dialog(page).getByRole('radio').first().click(); await dialog(page).getByRole('button', { name: 'Edit slot', exact: true }).click();
  await expect(dialog(page).getByRole('combobox', { name: 'Task', exact: true }).first()).toHaveValue('macro:' + id);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await exported(page);
  expect(errors).toEqual([]);
});

test('copy remaps local UUIDs, rename preserves references, local parameter type and deletion are protected', async ({ page }) => {
  await load(page);
  await expect(page.getByRole('button', { name: 'Delete parameter', exact: true }).first()).toBeDisabled();
  await page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(1).selectOption('string');
  await expect(page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(1)).toHaveValue('number');
  await expect(page.getByRole('alert')).toContainText('/task_macros/');
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).nth(1).fill('Velocity');
  await expect(step(page).getByRole('button', { name: 'Argument: Speed', exact: true })).toContainText('Macro parameters.Velocity');
  await page.getByRole('button', { name: 'Task macro actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete task macro', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  await menu(page, 'Duplicate task macro');
  const saved = await exported(page), [id, copied] = Object.entries(saved.task_macros).find(([, s]) => s.display_name === 'Shopping (副本)');
  expect(id).not.toBe(sequenceId); expect(copied.steps[0].id).not.toBe(sequence.steps[0].id);
  expect(copied.steps[0].task.arguments[task.parameters[1].id].operand_a.parameter_id).toBe(copied.parameters[1].id);
  expect(copied.parameters[1].id).not.toBe(sequence.parameters[1].id);
  page.once('dialog', (d) => d.accept()); await menu(page, 'Delete task macro');
  expect(Object.keys((await exported(page)).task_macros)).toEqual([sequenceId]);
});

test('task definitions and global variables account for uses exclusively inside sequence steps', async ({ page }) => {
  const data = structuredClone(example), variableId = '1455ac8b-4326-49b9-b799-e6b7034b98fa';
  data.operand_nodes[variableId] = { node_type: 'value', read_only: false, display_name: 'StepOnly', value_type: 'number', parent_id: null, order: 1 };
  data.task_macros[sequenceId].steps[0].task.arguments[task.parameters[1].id] = { type: 'reference', reference_id: variableId };
  await load(page, data); await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Move 3', exact: true }).click();
  await expect(page.locator('.shared-warning')).toContainText('Shopping · Step 1');
  await page.getByRole('button', { name: 'Task actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete task', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Parameter type', exact: true }).first().selectOption('number');
  await expect(page.getByRole('alert')).toContainText('Shopping · Step 1');
  await navigate(page, 'operands');
  await page.getByRole('treeitem', { name: 'StepOnly', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete node', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('string');
  await expect(page.getByRole('combobox', { name: 'Value type', exact: true })).toHaveValue('number');
  await expect(page.getByRole('alert')).toContainText('Shopping / Step 1');
});

test('scope-invalid imports preserve the project and removing every step leaves a valid empty sequence', async ({ page }) => {
  await load(page);
  const bad = structuredClone(example); bad.task_macros[sequenceId].steps[0].task.arguments[task.parameters[0].id].parameter_id = '087343fe-1553-436a-b1a6-0a9bb93f9590';
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('.issues')).toContainText(`/task_macros/${sequenceId}/steps/0/task/arguments/${task.parameters[0].id}/parameter_id`);
  expect((await exported(page)).task_macros).toEqual(example.task_macros);
  await step(page, 2).getByRole('button', { name: 'Delete step', exact: true }).click();
  await step(page).getByRole('button', { name: 'Delete step', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await exported(page)).task_macros[sequenceId].steps).toEqual([]);
});

test('Chinese sequence scope picker shares one modal, and seven tabs fit desktop without page overflow', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(), t = translator('zh-TW');
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'seq.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('tab', { name: t('taskMacros'), exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('taskMacros');
  const first = page.getByRole('article', { name: t('taskStep', { count: 1 }), exact: true });
  await first.getByRole('button', { name: t('argumentFor', { name: 'Speed' }), exact: true }).click();
  await dialog(page).getByRole('button', { name: t('editExpressionA'), exact: true }).click();
  await expect(dialog(page).getByRole('treeitem', { name: 'Speed', exact: true })).toBeVisible();
  await expect(dialog(page).getByRole('treeitem', { name: 'Destination', exact: true })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(dialog(page).locator('.modal-footer')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(first.getByRole('button', { name: t('argumentFor', { name: 'Speed' }), exact: true })).toContainText('本巨集參數.Speed');
  for (const [name, other] of [['Destination', 'Speed'], ['Ready', 'Destination']]) {
    await first.getByRole('button', { name: t('argumentFor', { name }), exact: true }).click();
    await expect(dialog(page).getByRole('treeitem', { name, exact: true })).toBeVisible();
    await expect(dialog(page).getByRole('treeitem', { name: other, exact: true })).toHaveCount(0);
    await dialog(page).getByRole('treeitem', { name, exact: true }).click();
    await dialog(page).getByRole('button', { name: t('apply'), exact: true }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
