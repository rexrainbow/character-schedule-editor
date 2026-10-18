import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { priorityMacroFixture } from '../priorityMacroFixture.js';
import { compileProject, createDay } from '../../src/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';
async function load(page, includeDay = false) {
  const fixture = priorityMacroFixture(); fixture.slot.branches = [];
  if (includeDay) fixture.draft.days = [createDay(fixture.draft, 'Routine')];
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'slot-priority.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(fixture.draft).data)) });
  await navigate(page, 'slots'); return fixture;
}
async function saved(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('empty slot offers both entry modes and direct candidates persist, simulate and navigate to shared macro definitions', async ({ page }) => {
  const { eligible, priority, slot } = await load(page);
  await expect(page.getByRole('button', { name: 'Add ELSE branch', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add priority candidates', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Candidate 1', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Branch 1', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption(`macro:${eligible.id}`);
  await page.getByRole('button', { name: 'Argument: Amount', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Constant value', exact: true }).fill('5'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const project = await saved(page); expect(project.slots[slot.id].mode).toBe('priority'); expect(project.slots[slot.id].branches).toBeUndefined(); expect(Object.keys(project.task_macros)).toHaveLength(3);
  await switchMode(page, 'simulation'); await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Candidate 1: Eligible increase'); await expect(page.locator('.simulation-results')).toContainText('10 → 15');
  await navigate(page, 'slots'); await page.getByRole('button', { name: 'Open task macro', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue(eligible.display_name);
});

test('day-cell slot editing saves inline priority data and assigns it immediately', async ({ page }) => {
  const { priority } = await load(page, true); await navigate(page, 'days');
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  let dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Create slot', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Display name', exact: true }).fill('Day choice');
  await dialog.getByRole('button', { name: 'Add priority candidates', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Task', exact: true }).selectOption(`macro:${priority.id}`);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Slot 1', exact: true })).toContainText('Day choice');
  const project = await saved(page), [id, data] = Object.entries(project.slots).find(([, item]) => item.display_name === 'Day choice');
  expect(data.mode).toBe('priority'); expect(data.candidates[0].task.task_macro_id).toBe(priority.id); expect(Object.values(project.day_schedules)[0].slot_ids[0]).toBe(id);
});

test('Chinese mobile entry buttons share a row, and deleting the last candidate restores entry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const actions = page.locator('.slot-start-actions'); await expect(actions.getByRole('button')).toHaveCount(2);
  const buttons = await actions.getByRole('button').all(), first = await buttons[0].boundingBox(), second = await buttons[1].boundingBox(); expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  await page.getByRole('button', { name: '新增優先候選', exact: true }).click();
  await page.getByRole('button', { name: '刪除候選', exact: true }).click();
  await expect(actions).toBeVisible();
  await actions.getByRole('button').last().click(); await expect(page.locator('.else-card')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/slot-priority-mobile.png', fullPage: true });
});
