import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProject, createDay, createSlot, compileProject } from '../../src/model.js';
import { createWeek } from '../../src/weekModel.js';
import { createSequence, addSequenceRow } from '../../src/sequenceModel.js';
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  const draft = createProject(); draft.slots = [createSlot([], 'Work')]; draft.days = [createDay(draft, 'Routine')];
  draft.weeks = [createWeek(draft, 'Week')]; draft.weeks[0].days.mon = draft.days[0].id;
  draft.sequences = [addSequenceRow(draft, createSequence(draft, 'Sequence'), draft.weeks[0].id)];
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'events.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(draft).data)) });
  return draft;
}
async function saved(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
async function assignName(page, label, name) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Search slot name/ }).fill(name);
  await page.getByRole('dialog').getByRole('textbox', { name: /^Search slot name/ }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
for (const mobile of [false, true]) test(`day event assignments share quick creation, preserve empty main slots and return navigation (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const draft = await load(page);
  await expect(page.getByRole('button', { name: 'Day start event', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand event schedules (0)', exact: true }).click();
  await assignName(page, 'Day start event', 'Inspection');
  await assignName(page, 'Slot 1 start event', 'Work');
  await assignName(page, 'Slot 1 end event', 'Wrap up');
  await assignName(page, 'Day end event', 'Inspection');
  await expect(page.getByRole('button', { name: 'Collapse event schedules (4)', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Collapse event schedules (4)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand event schedules (4)', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Day start event', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand event schedules (4)', exact: true }).click();
  await page.getByRole('button', { name: 'Open Day start event: Inspection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Inspection');
  await page.getByRole('button', { name: 'Back to day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collapse event schedules (4)', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const data = await saved(page), day = data.day_schedules[draft.days[0].id];
  expect(day.slot_ids).toEqual([null, null, null]); expect(day.slot_events).toHaveLength(3);
  expect(day.day_start_slot_id).toBe(day.day_end_slot_id);
  await page.getByRole('button', { name: 'Day end event', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear assignment', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await saved(page)).day_schedules[draft.days[0].id].day_end_slot_id).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/day-events-${mobile ? 'mobile' : 'desktop'}.png` });
});

test('week event editing makes a private snapshot and preserves the shared day', async ({ page }) => {
  const draft = await load(page); await navigate(page, 'weeks');
  await page.getByRole('button', { name: 'Expand event schedules (0)', exact: true }).click();
  await assignName(page, 'Monday / Day start event', 'Week inspection');
  const data = await saved(page), privateId = data.week_schedules[draft.weeks[0].id].days.mon;
  expect(privateId).not.toBe(draft.days[0].id);
  expect(data.day_schedules[privateId].day_start_slot_id).toBeTruthy();
  expect(data.day_schedules[draft.days[0].id].day_start_slot_id).toBeUndefined();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(page.getByRole('button', { name: '收合事件行程（1）', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: '星期一 / 日開始事件', exact: true })).toContainText('Week inspection');
});

test('day previews include event positions and can jump to their schedule details', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Expand event schedules (0)', exact: true }).click();
  await assignName(page, 'Day start event', 'Inspection');
  await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Preview Monday: Routine', exact: true }).hover();
  const panel = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await expect(panel).toContainText('Day start event');
  await panel.getByRole('button', { name: 'Open Day start event: Inspection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Inspection');
});
