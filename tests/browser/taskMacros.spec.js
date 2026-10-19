import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/task-macro-example.json' with { type: 'json' };
import { translator } from '../../src/i18n/index.js';

const [branchId, branchMacro] = Object.entries(example.task_macros).find(([, m]) => m.mode === 'branch');
const [sequenceId, sequenceMacro] = Object.entries(example.task_macros).find(([, m]) => m.mode === 'sequence');
const workId = Object.keys(example.tasks).find((id) => example.tasks[id].display_name === 'work');
const branch = (page, count = 1) => page.getByRole('article', { name: 'Branch ' + count, exact: true });
const dialog = (page) => page.getByRole('dialog');
async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'macros.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await navigate(page, 'taskMacros');
}
async function selectMacro(page, name, count) { await page.locator('.operand-sidebar').getByRole('button', { name: `${name} ${count}`, exact: true }).click(); }
async function exported(page) { const wait = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await wait).path(), 'utf8')); }
async function constant(page, container, label, value, type = 'number') {
  await container.getByRole('button', { name: label, exact: true }).click();
  await dialog(page).getByRole('tab', { name: 'Constant', exact: true }).click();
  if (type === 'boolean') await dialog(page).getByRole('combobox', { name: 'Constant value', exact: true }).selectOption(value);
  else await dialog(page).getByRole(type === 'number' ? 'spinbutton' : 'textbox', { name: 'Constant value', exact: true }).fill(value);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
}
async function local(page, container, label, name) {
  await container.getByRole('button', { name: label, exact: true }).click();
  await dialog(page).getByRole('tab', { name: 'Reference', exact: true }).click();
  await dialog(page).getByRole('treeitem', { name, exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
}

test('new branch macros share slot branch controls, bind local conditions and pass inputs to sequences', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page); await page.locator('.operand-sidebar').getByRole('button', { name: 'Add task macro', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Work rules');
  await page.getByRole('combobox', { name: 'Macro mode', exact: true }).selectOption('branch');
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).fill('Input');
  await branch(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption(workId);
  await page.getByRole('button', { name: 'Add conditional branch', exact: true }).click();
  await branch(page).getByRole('combobox', { name: 'Condition type', exact: true }).selectOption('group');
  await branch(page).getByRole('combobox', { name: 'Group mode', exact: true }).selectOption('ANY');
  await local(page, branch(page), 'Left operand (opA)', 'Input');
  await constant(page, branch(page), 'Right operand (opB)', '10');
  await branch(page).getByRole('combobox', { name: 'Operator', exact: true }).selectOption('>');
  const select = branch(page).getByRole('combobox', { name: 'Task', exact: true });
  await expect(select.locator(`option[value="macro:${branchId}"]`)).toHaveCount(1);
  await expect(select.getByRole('option', { name: 'Work rules', exact: true })).toHaveCount(0);
  await select.selectOption('macro:' + sequenceId);
  await constant(page, branch(page), 'Argument: Destination', 'Shop', 'string');
  await local(page, branch(page), 'Argument: Speed', 'Input');
  await constant(page, branch(page), 'Argument: Ready', 'true', 'boolean');
  const saved = await exported(page), [id, macro] = Object.entries(saved.task_macros).find(([, m]) => m.display_name === 'Work rules');
  expect(macro.mode).toBe('branch'); expect(macro.steps).toBeUndefined(); expect(macro.branches.at(-1).condition).toBeNull();
  expect(macro.branches[0].condition.items[0].operand_a.parameter_id).toBe(macro.parameters[0].id);
  expect(macro.branches[0].task.arguments[sequenceMacro.parameters[1].id].parameter_id).toBe(macro.parameters[0].id);
  expect(JSON.stringify(macro)).not.toContain('uid');
  await navigate(page, 'slots');
  page.once('dialog', (d) => d.accept()); await branch(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption('macro:' + id);
  await constant(page, branch(page), 'Argument: Input', '5');
  await navigate(page, 'days'); await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Edit slot', exact: true }).click();
  await expect(dialog(page).getByRole('combobox', { name: 'Task', exact: true }).first()).toHaveValue('macro:' + id);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  expect(Object.values((await exported(page)).slots)[0].branches[0].task.task_macro_id).toBe(id);
  expect(errors).toEqual([]);
});

test('mode switching confirms discard, preserves signature, and blocks incompatible macro callers', async ({ page }) => {
  await load(page); await selectMacro(page, 'Shopping', 2);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('combobox', { name: 'Macro mode', exact: true }).selectOption('priority');
  await expect(page.getByRole('combobox', { name: 'Macro mode', exact: true })).toHaveValue('priority');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await selectMacro(page, 'Choose trip', 2);
  page.once('dialog', (d) => d.dismiss()); await page.getByRole('combobox', { name: 'Macro mode', exact: true }).selectOption('sequence');
  expect((await exported(page)).task_macros[branchId]).toEqual(branchMacro);
  page.once('dialog', (d) => d.accept()); await page.getByRole('combobox', { name: 'Macro mode', exact: true }).selectOption('sequence');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/This macro has no actions/)).toBeVisible();
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await page.getByRole('article', { name: 'Step 1', exact: true }).getByRole('combobox', { name: 'Task', exact: true }).selectOption(workId);
  let saved = (await exported(page)).task_macros[branchId]; expect(saved.parameters).toEqual(branchMacro.parameters); expect(saved.branches).toBeUndefined(); expect(saved.mode).toBe('sequence');
  page.once('dialog', (d) => d.accept()); await page.getByRole('combobox', { name: 'Macro mode', exact: true }).selectOption('branch');
  await branch(page).getByRole('combobox', { name: 'Task', exact: true }).selectOption(workId);
  saved = (await exported(page)).task_macros[branchId]; expect(saved.steps).toBeUndefined(); expect(saved.branches).toHaveLength(1);
});

test('copy and parameter rename preserve both local condition and forwarded argument references', async ({ page }) => {
  await load(page); await selectMacro(page, 'Choose trip', 2);
  await page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(1).selectOption('string');
  await expect(page.getByRole('combobox', { name: 'Parameter type', exact: true }).nth(1)).toHaveValue('number');
  await expect(page.getByRole('alert')).toContainText('/condition/');
  await expect(page.getByRole('button', { name: 'Delete parameter', exact: true }).nth(2)).toBeDisabled();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).nth(1).fill('Velocity');
  await expect(branch(page).getByRole('button', { name: 'Argument: Speed', exact: true })).toContainText('Macro parameters.Velocity');
  await page.getByRole('button', { name: 'Task macro actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate task macro', exact: true }).click();
  const saved = await exported(page), copy = Object.values(saved.task_macros).find((m) => m.display_name === 'Choose trip (副本)');
  expect(copy.branches[0].condition.items[0].operand_a.parameter_id).toBe(copy.parameters[2].id);
  expect(copy.branches[0].task.arguments[sequenceMacro.parameters[1].id].operand_a.parameter_id).toBe(copy.parameters[1].id);
  expect(copy.parameters[1].id).not.toBe(branchMacro.parameters[1].id);
});

test('signature deletion clears branch callers and invalid macro edges/import scopes are rejected', async ({ page }) => {
  await load(page); await selectMacro(page, 'Shopping', 2);
  await page.getByRole('article', { name: 'Step 1', exact: true }).getByRole('button', { name: 'Delete step', exact: true }).click();
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Delete parameter', exact: true }).nth(1).click();
  const saved = await exported(page); expect(saved.task_macros[branchId].branches[0].task.arguments[sequenceMacro.parameters[1].id]).toBeUndefined();
  const bad = structuredClone(saved); bad.task_macros[branchId].branches[0].task = { task_macro_id: branchId, arguments: {} };
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'cycle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('.issues')).toContainText('circular call chain');
  expect((await exported(page)).task_macros).toEqual(saved.task_macros);
});

test('Chinese branch macro condition scope picker keeps one modal and supports nested local expressions', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), t = translator('zh-TW');
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'macros.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('taskMacros');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Choose trip 2', exact: true }).click();
  await expect(page.getByRole('combobox', { name: t('macroMode'), exact: true })).toHaveValue('branch');
  const first = page.getByRole('article', { name: t('branchLabel', { count: 1 }), exact: true });
  await first.getByRole('button', { name: t('operandA'), exact: true }).nth(1).click();
  await dialog(page).getByRole('button', { name: t('editExpressionA'), exact: true }).click();
  await expect(dialog(page).getByRole('treeitem', { name: 'Speed', exact: true })).toBeVisible();
  await expect(dialog(page).getByRole('treeitem', { name: 'Ready', exact: true })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1); await expect(dialog(page).locator('.modal-footer')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(first.getByRole('button', { name: t('operandA'), exact: true }).nth(1)).toContainText('本巨集參數.Speed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
