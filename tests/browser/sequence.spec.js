import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/sequence-example.json' with { type: 'json' };
import { translator } from '../../src/i18n.js';

async function load(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'sequence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
  await navigate(page, 'sequences');
}
async function exported(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function action(page, label, item) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('day numbers cover blank and overridden dates and follow week row positions', async ({ page }) => {
  await load(page);
  const numbers = page.locator('.sequence-day-number');
  await expect(numbers).toHaveText(Array.from({ length: 21 }, (_, i) => `Day ${i + 1}`));
  await page.locator('.sequence-row-controls').first().getByRole('button', { name: 'Duplicate week row', exact: true }).click();
  await expect(numbers).toHaveText(Array.from({ length: 28 }, (_, i) => `Day ${i + 1}`));
  await page.locator('.sequence-row-controls').first().getByRole('button', { name: 'Move down', exact: true }).click();
  await expect(numbers).toHaveText(Array.from({ length: 28 }, (_, i) => `Day ${i + 1}`));
  await page.locator('.sequence-row-controls').first().getByRole('button', { name: 'Delete week row', exact: true }).click();
  await expect(numbers).toHaveText(Array.from({ length: 21 }, (_, i) => `Day ${i + 1}`));
  const data = await exported(page);
  expect(JSON.stringify(data.week_sequences)).not.toContain('day_number');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(numbers.first()).toHaveText('Day 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('empty sequence creation, duplicate, deletion and canceled row picker', async ({ page }) => {
  await page.goto('/'); await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await navigate(page, 'sequences');
  await page.locator('.sidebar').getByRole('button', { name: 'Add sequence', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add week row', exact: true })).toBeDisabled();
  let data = await exported(page); let sequence = Object.values(data.week_sequences)[0];
  expect(sequence.week_schedule_ids).toEqual([]); expect(sequence.day_overrides).toEqual([]);
  await action(page, 'Sequence actions', 'Duplicate sequence');
  await expect(page.getByRole('textbox', { name: 'Sequence name', exact: true })).toHaveValue(/New sequence \(.+\)/);
  data = await exported(page); expect(Object.keys(data.week_sequences)).toHaveLength(2);
  page.once('dialog', (dialog) => dialog.accept()); await action(page, 'Sequence actions', 'Delete sequence');
  data = await exported(page); expect(Object.keys(data.week_sequences)).toHaveLength(1);
  await load(page); await page.getByRole('button', { name: 'Add week row', exact: true }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Rest week', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  data = await exported(page); expect(Object.values(data.week_sequences)[0].week_schedule_ids).toHaveLength(3);
});

test('overrides use only named shared days, can be removed or explicitly empty, never edit sources', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page); const modal = page.getByRole('dialog');
  await expect(page.getByRole('button', { name: 'Week 1 / Wednesday', exact: true }).locator('..')).toContainText('Inherited · week custom');
  await page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(4);
  await expect(modal.getByRole('button', { name: 'Edit slot', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('radio', { name: 'Week custom', exact: true })).toHaveCount(0);
  await modal.getByRole('radio', { name: 'No override — inherit from week', exact: true }).click();
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).locator('..')).toContainText('Workday');
  await page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await modal.getByRole('radio', { name: 'Override with an empty day', exact: true }).click();
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).locator('..')).toContainText('Empty override');
  await page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await modal.getByRole('radio', { name: 'Holiday', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).locator('..')).toContainText('Empty override');
  const data = await exported(page);
  expect(data.week_schedules).toEqual(example.week_schedules); expect(data.day_schedules).toEqual(example.day_schedules); expect(data.slots).toEqual(example.slots);
  expect(Object.values(data.week_sequences)[0].day_overrides[0]).toEqual({ week_number: 1, weekday: 'mon', day_schedule_id: null });
  expect(errors).toEqual([]);
});

test('row movement, duplication and source replacement keep overrides attached to the row', async ({ page }) => {
  await load(page);
  await page.getByRole('group', { name: 'Week 2', exact: true }).getByRole('button', { name: 'Move up', exact: true }).click();
  let data = await exported(page); let sequence = Object.values(data.week_sequences)[0];
  expect(sequence.day_overrides.map((item) => [item.week_number, item.weekday])).toEqual([[1, 'fri'], [2, 'mon']]);
  await page.getByRole('group', { name: 'Week 2', exact: true }).getByRole('button', { name: 'Duplicate week row', exact: true }).click();
  data = await exported(page); sequence = Object.values(data.week_sequences)[0];
  expect(sequence.day_overrides.map((item) => [item.week_number, item.weekday])).toEqual([[1, 'fri'], [2, 'mon'], [3, 'mon']]);
  await page.getByRole('button', { name: 'Choose week for Week 2', exact: true }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Rest week', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Week 2 / Monday', exact: true }).locator('..')).toContainText('Holiday');
  await expect(page.getByRole('button', { name: 'Week 2 / Tuesday', exact: true }).locator('..')).toContainText('Unassigned');
  for (let count = 4; count > 0; count--) await page.getByRole('group', { name: 'Week 1', exact: true }).getByRole('button', { name: 'Delete week row', exact: true }).click();
  data = await exported(page); sequence = Object.values(data.week_sequences)[0];
  expect(sequence.week_schedule_ids).toEqual([]); expect(sequence.day_overrides).toEqual([]);
});

test('source week deletion removes referenced rows, and shared day deletion removes complete overrides', async ({ page }) => {
  await load(page);
  await navigate(page, 'days');
  await page.locator('.sidebar .slot-item').filter({ hasText: 'Holiday' }).click();
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('1 sequence override'); await dialog.accept(); });
  await action(page, 'Day actions', 'Delete day');
  let data = await exported(page); let sequence = Object.values(data.week_sequences)[0];
  expect(sequence.day_overrides).toEqual([{ week_number: 2, weekday: 'fri', day_schedule_id: null }]);
  await navigate(page, 'sequences');
  await expect(page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).locator('..')).toContainText('Workday');
  await navigate(page, 'weeks');
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('2 sequence row'); await dialog.accept(); });
  await action(page, 'Week actions', 'Delete week');
  data = await exported(page); sequence = Object.values(data.week_sequences)[0];
  expect(sequence.week_schedule_ids).toHaveLength(1); expect(sequence.day_overrides[0].week_number).toBe(1);
  page.once('dialog', (dialog) => dialog.accept()); await action(page, 'Week actions', 'Delete week');
  data = await exported(page); sequence = Object.values(data.week_sequences)[0];
  expect(sequence.week_schedule_ids).toEqual([]); expect(sequence.day_overrides).toEqual([]);
});

test('invalid overrides are rejected with paths; older projects without sequences import', async ({ page }) => {
  const old = structuredClone(example); delete old.week_sequences; await load(page, old);
  await expect(page.getByRole('heading', { name: 'No week sequences yet', exact: true })).toBeVisible();
  const invalid = structuredClone(example); const id = Object.keys(invalid.week_sequences)[0];
  invalid.week_sequences[id].day_overrides.push({ week_number: 99, weekday: 'mon', day_schedule_id: null });
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.getByRole('status')).toContainText('Import rejected');
  await expect(page.locator('.issues')).toContainText(`/week_sequences/${id}/day_overrides/2/week_number`);
  const data = await exported(page); expect(data.week_sequences).toEqual({});
});

test('Chinese mobile sequence matrix has one scroll area and shared-day override modal', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-TW', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const t = translator('zh-TW');
  await page.goto('/');
  const long = structuredClone(example); const sequence = Object.values(long.week_sequences)[0];
  sequence.week_schedule_ids = Array(1000).fill(sequence.week_schedule_ids[0]); sequence.day_overrides = [];
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'sequence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(long)) });
  await page.getByRole('combobox', { name: t('editorPage'), exact: true }).selectOption('sequences');
  await expect(page.getByRole('textbox', { name: t('sequenceName'), exact: true })).toHaveValue('Stage 0');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.sequence-row').count()).toBeLessThan(20);
  await page.locator('.sequence-matrix').evaluate((element) => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
  await page.getByRole('button', { name: t('sequenceDayCell', { count: 1000, weekday: t('sun') }), exact: true }).click();
  const modal = page.getByRole('dialog'); await expect(modal).toContainText(t('sequenceReadOnlyHint'));
  await modal.getByRole('radio', { name: t('overrideEmpty'), exact: true }).click();
  await modal.getByRole('button', { name: t('apply'), exact: true }).click();
  await expect(page.getByRole('button', { name: t('sequenceDayCell', { count: 1000, weekday: t('sun') }), exact: true })).toContainText(t('emptyOverride'));
  await page.locator('.sequence-row').last().getByRole('button', { name: t('deleteWeekRow'), exact: true }).click();
  await expect(page.getByRole('group', { name: t('weekNumber', { count: 999 }), exact: true })).toBeVisible();
  await context.close();
});
