import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { flowControlFixture } from '../flowControlFixture.js';
import { compileProject } from '../../src/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';

async function load(page, draft) {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'control.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
}
async function runDay(page) {
  await switchMode(page, 'simulation');
  await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('day');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
}

for (const [kind, label, scope, count] of [
  ['cancel_main_slot', 'Cancel the main schedule in this slot', 'slot', 3],
  ['cancel_main_day', 'Cancel the main schedule for the rest of today', 'day', 10],
]) test(`${kind} is available as a fixed task and preserves overlay events in simulation`, async ({ page }) => {
  const { draft, control } = flowControlFixture(); await load(page, draft); await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await expect(page.locator('.parameter-row')).toHaveCount(0);
  await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: /Override activity/ }).click();
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption(`builtin:${kind}`);
  await expect(page.locator('.task-editor')).toContainText('All overlay events continue regardless of priority.');
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  const runtime = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(runtime.slots[control.id].branches[0].task).toEqual({ task_key: `control.main_${scope}`, flow_control: 'cancel_main', scope });
  await runDay(page); await expect(page.locator('.simulation-cancel-reason')).toHaveCount(count);
  const cancelledEntries = page.locator('.simulation-trace-line').filter({ hasText: 'Cancelled; not evaluated' });
  for (const text of await cancelledEntries.allTextContents()) expect(text).toContain('Main day schedule');
});

test('self-cancellation is selectable without parameters, exports its contract and only cancels its own later assignments', async ({ page }) => {
  const { draft, control } = flowControlFixture(); await load(page, draft);
  await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Cancel this schedule for the rest of today', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await expect(page.locator('.parameter-row')).toHaveCount(0);
  await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: /Override activity/ }).click();
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:cancel_self_day');
  await expect(page.locator('.task-editor')).toContainText('Other events, the main day');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  const runtime = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(runtime.slots[control.id].branches[0].task).toEqual({ task_key: 'control.self_day', flow_control: 'cancel_self', scope: 'day' });
  await runDay(page);
  await expect(page.locator('.simulation-cancel-reason')).toHaveCount(9);
  await expect(page.locator('.simulation-results')).toContainText('Future assignments of this day-schedule instance cancelled through day end.');
  for (const text of await page.locator('.simulation-cancel-reason').allTextContents()) expect(text).toContain('Cancelled by High');
});

test('task categories, fixed flow definitions and zero-argument selections persist through project and runtime exports', async ({ page }) => {
  const { draft, control } = flowControlFixture(); await load(page, draft); await navigate(page, 'tasks');
  await expect(page.locator('.operand-sidebar').getByRole('heading', { name: 'Variable operations', exact: true })).toBeVisible();
  await expect(page.locator('.operand-sidebar').getByRole('heading', { name: 'Flow control', exact: true })).toBeVisible();
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Cancel lower-priority schedules in this slot', exact: true }).click();
  await expect(page.locator('.parameter-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Task actions', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Override current slot');
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('engine.stop_lower_slot');
  await navigate(page, 'slots');
  await page.locator('.sidebar').getByRole('button', { name: /Override activity/ }).click();
  const picker = page.getByRole('combobox', { name: 'Task', exact: true });
  await expect(picker.locator('optgroup[label="Variable operations"]')).toHaveCount(1);
  await expect(picker.locator('optgroup[label="Flow control"]')).toHaveCount(1);
  await picker.selectOption('builtin:cancel_lower_priority_slot');
  await expect(page.locator('.task-editor')).toContainText('No parameters.');
  await expect(page.locator('.task-editor .task-arguments')).toHaveCount(0);
  let pending = page.waitForEvent('download'); await exportProject(page);
  const project = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(project.slots[control.id].branches[0].task).toEqual({ builtin: 'cancel_lower_priority_slot' });
  expect(project.builtin_tasks.cancel_lower_priority_slot.display_name).toBe('Override current slot');
  pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  const runtime = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(runtime.slots[control.id].branches[0].task).toEqual({ task_key: 'engine.stop_lower_slot', flow_control: 'cancel_lower_priority', scope: 'slot' });
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'reload.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Override current slot', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Engine key', exact: true })).toHaveValue('engine.stop_lower_slot');
});

test('day simulation distinguishes cancelled sources, preserves macro continuation and standalone no-op explanations', async ({ page }) => {
  const { draft, control } = flowControlFixture(); await load(page, draft); await runDay(page);
  await expect(page.locator('.simulation-cancel-reason')).toHaveCount(12);
  await expect(page.locator('.simulation-cancel-reason').first()).toContainText('Cancelled by High');
  await expect(page.locator('.simulation-results')).toContainText('Cancelled; not evaluated');
  await expect(page.locator('.simulation-results')).toContainText('Lower-priority sources cancelled for the remainder of this slot.');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Variable changes', exact: true }).click();
  await expect(page.locator('.simulation-change-table')).toContainText('64');
  await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('slot');
  await page.getByRole('combobox', { name: 'Slot schedule to simulate', exact: true }).selectOption(control.id);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.getByRole('tab', { name: 'Execution trace', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('requires a week-sequence day context');
  await expect(page.locator('.simulation-results')).toContainText('10 → 11');
});

test('Chinese mobile categories and cancellation reasons remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft } = flowControlFixture('cancel_lower_priority_day', 'dayStart'); await load(page, draft);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await navigate(page, 'tasks', 'zh-TW');
  await page.locator('.operand-sidebar').getByRole('button', { name: '取消本日後續低優先行程', exact: true }).click();
  await expect(page.locator('.task-parameters')).toContainText('無參數');
  await page.screenshot({ path: 'test-results/flow-tasks-mobile.png', fullPage: true });
  await switchMode(page, 'simulation', 'zh-TW');
  await page.getByRole('combobox', { name: '模擬目標', exact: true }).selectOption('day');
  await page.getByRole('button', { name: '執行模擬', exact: true }).click();
  await expect(page.locator('.simulation-cancel-reason')).toHaveCount(44);
  await expect(page.locator('.simulation-cancel-reason').first()).toContainText('本日後續');
  await expect(page.locator('.simulation-results')).toContainText('已取消，不求值');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/flow-simulation-mobile.png', fullPage: true });
});
