import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exportProject, navigate, switchMode } from './navigation.js';
import { compileProject, createProject, createDay, createSlot } from '../../src/core/model.js';

async function load(page, draft) {
  await page.goto('/');
  const result = compileProject(draft); expect(result.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'activities.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
}
async function saved(page) {
  const download = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

for (const mobile of [false, true]) test(`named activities create on confirmation and reuse exact names (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const draft = createProject(), day = createDay(draft, 'Daily routine'); draft.days = [day];
  await load(page, draft);
  await expect(page.locator('.mobile-page-picker')).toHaveValue('days');
  const pageOrder = await page.locator('.mobile-page-picker option').evaluateAll((options) => options.map((o) => o.value));
  expect(pageOrder.slice(0, 4)).toEqual(['days', 'weeks', 'sequences', 'slots']);
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  const dialog = page.getByRole('dialog'), search = dialog.getByRole('textbox', { name: /^Search slot name or tasks/ });
  await search.fill('  Work  ');
  await expect(dialog.getByRole('button', { name: 'Create and assign “Work”', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(Object.keys((await saved(page)).slots)).toHaveLength(0);
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await search.fill('  Work  '); await search.press('Enter');
  await expect(dialog).toHaveCount(0);
  const first = await saved(page), id = Object.keys(first.slots)[0];
  expect(first.slots[id].display_name).toBe('Work'); expect(first.slots[id].branches).toEqual([]);
  expect(first.day_schedules[day.id].slot_ids[0]).toBe(id);
  await page.getByRole('button', { name: 'Slot 2', exact: true }).click();
  await search.fill('Work'); await expect(dialog.getByRole('button', { name: 'Create and assign “Work”', exact: true })).toHaveCount(0);
  await search.press('Enter');
  const reused = await saved(page); expect(Object.keys(reused.slots)).toHaveLength(1);
  expect(reused.day_schedules[day.id].slot_ids.slice(0, 2)).toEqual([id, id]);
  await switchMode(page, 'simulation');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Executing: Work');
  await expect(page.locator('.simulation-results')).toContainText('No actions; completed');
  await expect(page.locator('.simulation-results')).not.toContainText('ELSE');
  await navigate(page, 'slots');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete branch', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('duplicate names require selection, blank and composing input do not create activities', async ({ page }) => {
  const draft = createProject(), day = createDay(draft, 'Daily routine'); draft.days = [day];
  draft.slots = [createSlot([], 'Work'), createSlot([], 'Work')];
  await load(page, draft);
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  const dialog = page.getByRole('dialog'), search = dialog.getByRole('textbox', { name: /^Search slot name or tasks/ });
  await search.fill(' '); await search.press('Enter'); await expect(dialog).toBeVisible();
  await search.fill('Rest'); await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true }); await expect(dialog).toBeVisible();
  await search.fill('Work'); await search.press('Enter');
  await expect(dialog).toContainText('Several schedules have this name');
  await dialog.getByRole('radio').last().click(); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const project = await saved(page); expect(Object.keys(project.slots)).toHaveLength(2);
  expect(project.day_schedules[day.id].slot_ids[0]).toBe(draft.slots[1].id);
});
