import { showAllDayPurposes } from './dayOptions.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';

async function load(page, { mode = 'fixed', count = 1 } = {}) {
  const f = sequenceEventsFixture(), { draft, sequence, eventDay, main } = f;
  sequence.eventGroups = Array.from({ length: count }, (_, i) => ({ ...rule(sequence, eventDay.id), display_name: `Event ${i}`, sourceMode: mode, dayCandidates: [{ dayId: eventDay.id, weight: 1 }, { dayId: main.id, weight: 3 }] }));
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'manager-view.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await navigate(page, 'sequences'); return f;
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('collapsed fixed source opens a single readonly view in the manager dialog and closing returns to the draft', async ({ page }) => {
  await load(page); const before = await save(page);
  await page.getByRole('button', { name: 'Manage events (1)', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Event manager', exact: true });
  await expect(manager.getByRole('button', { name: 'Day schedule source', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await manager.getByRole('textbox', { name: 'Event name', exact: true }).fill('Unsaved fixed event');
  await manager.getByRole('button', { name: 'View candidate day schedules', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Event day schedule viewer', exact: true });
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(viewer.locator('.event-candidates-heading')).toContainText('Unsaved fixed event');
  await expect(viewer.locator('.event-candidate-choice')).toHaveCount(1);
  await expect(viewer.locator('.event-candidate-detail')).toContainText('Inspection task');
  await expect(viewer.getByRole('button', { name: /Open day schedule|Open.*Inspection task/ })).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Show all positions', exact: true }).click();
  await viewer.getByRole('button', { name: 'Back to event manager', exact: true }).click();
  await expect(manager.getByRole('textbox', { name: 'Event name', exact: true })).toHaveValue('Unsaved fixed event');
  await expect(manager.getByRole('button', { name: 'Day schedule source', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(manager.getByRole('button', { name: 'View candidate day schedules', exact: true })).toBeFocused();
  await manager.getByRole('button', { name: 'View candidate day schedules', exact: true }).click();
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(manager).toBeVisible();
  await manager.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await save(page)).toEqual(before);
});

test('viewer uses pending weights and restores event draft, source expansion and independent scroll positions', async ({ page }) => {
  await load(page, { mode: 'random', count: 30 }); const before = await save(page);
  await page.getByRole('button', { name: 'Manage events (30)', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Event manager', exact: true });
  await manager.getByRole('textbox', { name: 'Event name', exact: true }).fill('Pending event');
  await manager.getByRole('button', { name: 'Day schedule source', exact: true }).click();
  await manager.getByRole('spinbutton', { name: 'Weight: Inspection', exact: true }).fill('7');
  const form = manager.locator('.event-group-form'), list = manager.locator('.event-group-list');
  await form.evaluate((e) => { e.scrollTop = 100; }); await list.evaluate((e) => { e.scrollTop = 180; });
  const formTop = await form.evaluate((e) => e.scrollTop), listTop = await list.evaluate((e) => e.scrollTop);
  await manager.getByRole('button', { name: 'View candidate day schedules', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Event day schedule viewer', exact: true });
  await expect(viewer.locator('.event-candidate-choice').first()).toContainText('Weight: 7');
  await expect(viewer.locator('.event-candidate-choice').first()).toContainText('70.0%');
  await expect(viewer.getByRole('button', { name: 'Open day schedule', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/event-manager-candidate-view.png' });
  await page.keyboard.press('Escape');
  await expect(manager).toBeVisible();
  await expect(manager.getByRole('spinbutton', { name: 'Weight: Inspection', exact: true })).toHaveValue('7');
  await expect(manager.getByRole('textbox', { name: 'Event name', exact: true })).toHaveValue('Pending event');
  expect(await form.evaluate((e) => e.scrollTop)).toBe(formTop); expect(await list.evaluate((e) => e.scrollTop)).toBe(listTop);
  await manager.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(await save(page)).toEqual(before);
});

test('Chinese mobile disables empty sources and views a newly selected fixed day without applying the event', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { sequence } = await load(page, { count: 0 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('button', { name: '事件管理（0）', exact: true }).click();
  const manager = page.getByRole('dialog', { name: '事件管理', exact: true });
  await manager.getByRole('button', { name: '新增事件組', exact: true }).click();
  await expect(manager.getByRole('button', { name: '檢視候選日行程', exact: true })).toBeDisabled();
  await manager.getByRole('combobox', { name: '事件日行程', exact: true }).click();
  await showAllDayPurposes(page);
  await page.getByRole('dialog').getByRole('option', { name: 'Inspection', exact: true }).click();
  await manager.getByRole('button', { name: '檢視候選日行程', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: '事件日行程檢視', exact: true });
  await expect(viewer.locator('.event-candidate-day-heading')).toContainText('Inspection');
  await expect(viewer.getByRole('button', { name: '開啟日行程', exact: true })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  expect(await viewer.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/event-manager-candidate-view-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(manager.getByRole('textbox', { name: '事件名稱', exact: true })).toHaveValue('Inspection');
  await manager.getByRole('button', { name: '取消', exact: true }).click();
  expect((await save(page)).week_sequences[sequence.id].event_groups).toEqual([]);
});
