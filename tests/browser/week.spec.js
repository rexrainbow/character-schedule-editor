import { exportProject, navigate } from './navigation.js';
import { defineSimpleTask, selectFirstDefinedTask } from './taskHelpers.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/example.json' with { type: 'json' };
import { translator } from '../../src/i18n.js';

async function menuAction(page, menu, action) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

async function load(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await navigate(page, 'weeks');
  await page.locator('.sidebar').getByRole('button', { name: 'Add week', exact: true }).click();
}
async function exported(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function reference(page, weekday = 'Monday') {
  await page.getByRole('button', { name: `Choose day for ${weekday}`, exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByRole('radio', { name: 'Workday', exact: true }).click();
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
}

test('reference no-op and global definition edits do not create private days', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page); await reference(page);
  await page.getByRole('button', { name: 'Monday / Slot 1', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  let data = await exported(page); expect(Object.keys(data.day_schedules)).toHaveLength(1);
  const dayId = Object.keys(data.day_schedules)[0]; const weekId = Object.keys(data.week_schedules)[0];
  expect(data.week_schedules[weekId].days.mon).toBe(dayId);
  await page.getByRole('button', { name: 'Monday / Slot 1', exact: true }).click();
  await modal.getByRole('button', { name: 'Edit slot', exact: true }).click();
  await expect(modal.getByText('Editing a shared slot affects all references. Use Duplicate slot to change only this cell.')).toBeVisible();
  await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Updated globally');
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  data = await exported(page); expect(Object.keys(data.day_schedules)).toHaveLength(1);
  expect(data.week_schedules[weekId].days.mon).toBe(dayId);
  expect(Object.values(data.slots)[0].display_name).toBe('Updated globally');
  expect(errors).toEqual([]);
});

test('reference copy-on-write, private hidden from Days, keep and confirmed replacement', async ({ page }) => {
  await load(page); await reference(page);
  const modal = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Monday / Slot 1', exact: true }).click();
  await modal.getByRole('radio').nth(1).click(); await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose day for Monday', exact: true }).locator('..')).toContainText('Week custom');
  let data = await exported(page); const weekId = Object.keys(data.week_schedules)[0]; const privateId = data.week_schedules[weekId].days.mon;
  expect(data.day_schedules[privateId].scope).toBe('week_private');
  expect(data.day_schedules[privateId].owner).toEqual({ week_schedule_id: weekId, weekday: 'mon' });
  expect(Object.values(data.day_schedules).find((day) => !day.scope).slot_ids[0]).toBe(Object.keys(data.slots)[0]);
  await navigate(page, 'days'); await expect(page.locator('.sidebar .slot-item')).toHaveCount(1);
  await navigate(page, 'weeks');
  await page.getByRole('button', { name: 'Choose day for Monday', exact: true }).click();
  await expect(modal.getByRole('radio', { name: 'Keep week custom', exact: true })).toHaveAttribute('aria-checked', 'true');
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  data = await exported(page); expect(data.week_schedules[weekId].days.mon).toBe(privateId);
  await page.getByRole('button', { name: 'Monday / Slot 2', exact: true }).click();
  await modal.getByRole('button', { name: 'Clear assignment', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  data = await exported(page); expect(data.day_schedules[privateId].slot_ids[1]).toBeNull();
  await page.getByRole('button', { name: 'Choose day for Monday', exact: true }).click();
  await modal.getByRole('radio', { name: 'Unassigned (clear day)', exact: true }).click();
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('discards its slot assignments');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  data = await exported(page); expect(data.day_schedules[privateId]).toBeDefined();
  await page.getByRole('button', { name: 'Choose day for Monday', exact: true }).click();
  await modal.getByRole('radio', { name: 'Workday', exact: true }).click();
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await modal.getByRole('button', { name: 'Confirm replacement', exact: true }).click();
  data = await exported(page); expect(data.day_schedules[privateId]).toBeUndefined();
  expect(Object.keys(data.slots)).toHaveLength(2);
});

test('empty cancel, creation, duplication and week deletion clean up only private days', async ({ page }) => {
  await load(page); const modal = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Wednesday / Slot 1', exact: true }).click();
  await modal.getByRole('button', { name: 'Create slot', exact: true }).click();
  await selectFirstDefinedTask(modal.getByRole('combobox', { name: 'Task', exact: true }));
  await modal.getByRole('button', { name: 'Back', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  let data = await exported(page); expect(Object.keys(data.day_schedules)).toHaveLength(1);
  await page.getByRole('button', { name: 'Wednesday / Slot 1', exact: true }).click();
  await modal.getByRole('button', { name: 'Create slot', exact: true }).click();
  await selectFirstDefinedTask(modal.getByRole('combobox', { name: 'Task', exact: true }));
  await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Private activity');
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(modal).toHaveCount(0);
  data = await exported(page); const weekId = Object.keys(data.week_schedules)[0]; const originalPrivate = data.week_schedules[weekId].days.wed;
  await menuAction(page, 'Week actions', 'Duplicate week');
  await expect(page.getByRole('textbox', { name: 'Week name', exact: true })).toHaveValue('New week (副本)');
  data = await exported(page); const copyId = Object.keys(data.week_schedules)[1]; const copiedPrivate = data.week_schedules[copyId].days.wed;
  expect(copiedPrivate).not.toBe(originalPrivate); expect(data.day_schedules[copiedPrivate].owner.week_schedule_id).toBe(copyId);
  page.once('dialog', (dialog) => dialog.accept()); await menuAction(page, 'Week actions', 'Delete week');
  data = await exported(page); expect(data.day_schedules[copiedPrivate]).toBeUndefined(); expect(data.day_schedules[originalPrivate]).toBeDefined();
  expect(Object.keys(data.slots)).toHaveLength(3);
});

test('deleting a referenced shared day clears weekdays and preserves private snapshots', async ({ page }) => {
  await load(page); await reference(page); await reference(page, 'Tuesday');
  await page.getByRole('button', { name: 'Monday / Slot 1', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByRole('button', { name: 'Clear assignment', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await navigate(page, 'days');
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('1 weekday reference'); await dialog.accept(); });
  await menuAction(page, 'Day actions', 'Delete day');
  const data = await exported(page); const week = Object.values(data.week_schedules)[0];
  expect(week.days.tue).toBeNull(); expect(data.day_schedules[week.days.mon].scope).toBe('week_private');
  expect(Object.keys(data.slots)).toHaveLength(2);
});

test('old project imports without weeks; invalid private owner is rejected with a path', async ({ page }) => {
  const old = structuredClone(example); delete old.week_schedules; await load(page, old);
  const invalid = structuredClone(example); const id = 'ec38fdcb-7480-41ca-8e9d-29e497856021';
  invalid.day_schedules[id] = { display_name: 'orphan', scope: 'week_private', owner: { week_schedule_id: 'ec38fdcb-7480-41ca-8e9d-29e497856022', weekday: 'mon' }, slot_ids: Array(6).fill(null) };
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.getByRole('status')).toContainText('Import rejected');
  await expect(page.locator('.issues')).toContainText(`/day_schedules/${id}/owner`);
  const data = await exported(page); expect(data.day_schedules[id]).toBeUndefined();
});

test('Chinese mobile matrix scrolls horizontally and vertically without overflowing the page', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const t = translator('zh-TW');
  await page.goto('/'); await page.locator('.welcome').getByRole('button', { name: t('newProject'), exact: true }).click(); const modal = page.getByRole('dialog');
  await modal.getByRole('spinbutton', { name: t('slotsPerDay') }).fill('500');
  await modal.getByRole('button', { name: t('createProject'), exact: true }).click();
  await defineSimpleTask(page, t);
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('weeks');
  await page.locator('.sidebar').getByRole('button', { name: t('addWeek'), exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.week-cell').count()).toBeLessThan(120);
  await page.locator('.week-matrix').evaluate((element) => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
  const last = page.getByRole('button', { name: t('weekCell', { weekday: t('sun'), count: 500 }), exact: true });
  await expect(last).toBeVisible(); await last.click();
  await modal.getByRole('button', { name: t('newSlotDialog'), exact: true }).click();
  await selectFirstDefinedTask(modal.getByRole('combobox', { name: t('task'), exact: true }));
  await modal.getByRole('button', { name: t('apply'), exact: true }).click();
  await expect(page.getByRole('button', { name: t('chooseDayFor', { weekday: t('sun') }), exact: true }).locator('..')).toContainText(t('privateDay'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
