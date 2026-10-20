import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProject, createDay, createSlot, compileProject } from '../../src/core/model.js';
import { createWeek } from '../../src/core/weekModel.js';
import { createSequence, addSequenceRow } from '../../src/core/sequenceModel.js';
import { navigate, exportProject } from './navigation.js';

async function load(page, configure = () => {}) {
  const draft = createProject(); draft.slots = [createSlot([], 'Work')]; draft.days = [createDay(draft, 'Routine')];
  draft.weeks = [createWeek(draft, 'Week')]; draft.weeks[0].days.mon = draft.days[0].id;
  draft.sequences = [addSequenceRow(draft, createSequence(draft, 'Sequence'), draft.weeks[0].id)];
  configure(draft);
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
for (const mobile of [false, true]) test(`configured positions remain editable, aligned and ordered (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await load(page, (draft) => {
    const day = draft.days[0], id = draft.slots[0].id;
    day.dayStartId = id; day.dayEndId = id;
    day.slotEvents = [{ startId: id, endId: id }, { startId: null, endId: id }, { startId: null, endId: null }];
    day.slotReleases = [{ builtin: 'release_slot', condition: null }, null, null];
  });
  await expect(page.getByRole('button', { name: 'Show all positions', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Day start event', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Day end event', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Slot 2 start event', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Release slot 2', exact: true })).toHaveCount(0);
  const rows = await page.locator('.day-time-block').first().evaluate((e) => [...e.children].map((child) => {
    const rect = child.getBoundingClientRect(); return { x: rect.x, top: rect.top, bottom: rect.bottom, label: child.querySelector('button')?.getAttribute('aria-label') ?? child.getAttribute('aria-label') };
  }));
  expect(rows.map((row) => row.label)).toEqual(['Slot 1 start event', 'Release slot 1', 'Slot 1', 'Slot 1 end event']);
  for (let i = 1; i < rows.length; i++) { expect(rows[i].x).toBe(rows[0].x); expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].bottom); }
  const blocks = await page.locator('.day-time-block').evaluateAll((items) => items.map((e) => e.getBoundingClientRect().toJSON()));
  expect(blocks[1].top).toBeGreaterThanOrEqual(rows.at(-1).bottom);
  await page.getByRole('button', { name: 'Release slot 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove release', exact: true }).click();
  await expect(page.locator('.day-slot-release')).toHaveCount(0);
  await page.getByRole('button', { name: 'Slot 1 end event', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear assignment', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Slot 1 end event', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all positions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Slot 1 end event', exact: true })).toHaveCount(1);
  await expect(page.locator('.day-slot-release')).toHaveCount(3);
  await page.getByRole('button', { name: 'Show configured positions only', exact: true }).click();
  await expect(page.locator('.day-slot-release')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(page.getByRole('button', { name: '顯示全部位置', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/day-configured-${mobile ? 'mobile' : 'desktop'}.png` });
});
for (const mobile of [false, true]) test(`day event assignments share quick creation, preserve empty main slots and return navigation (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const draft = await load(page);
  await expect(page.getByRole('button', { name: 'Day start event', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all positions', exact: true }).click();
  await assignName(page, 'Day start event', 'Inspection');
  await assignName(page, 'Slot 1 start event', 'Work');
  await assignName(page, 'Slot 1 end event', 'Wrap up');
  await assignName(page, 'Day end event', 'Inspection');
  await expect(page.getByRole('button', { name: 'Show configured positions only', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Show configured positions only', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show all positions', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Day start event', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Day start event: Inspection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Inspection');
  await page.getByRole('button', { name: 'Back to day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show all positions', exact: true })).toHaveAttribute('aria-expanded', 'false');
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

test('mixed configured positions preserve virtualization and the final boundary', async ({ page }) => {
  await load(page, (draft) => {
    draft.project.settings.slots_per_day = 80;
    const day = draft.days[0], id = draft.slots[0].id;
    day.slotIds = Array(80).fill(null);
    day.slotEvents = Array.from({ length: 80 }, (_, i) => ({ startId: i % 2 === 0 ? id : null, endId: i % 3 === 0 || i === 79 ? id : null }));
    day.slotReleases = Array.from({ length: 80 }, (_, i) => i % 4 === 0 ? { builtin: 'release_slot', condition: null } : null);
    day.dayStartId = id; day.dayEndId = id;
  });
  await expect(page.getByRole('button', { name: 'Slot 1', exact: true })).toBeVisible();
  expect(await page.locator('.day-cell').count()).toBeLessThan(30);
  await page.locator('.day-cells').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(page.getByRole('button', { name: 'Slot 80 end event', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Day end event', exact: true })).toBeVisible();
  const bottom = await page.locator('.day-time-block').last().evaluate((e) => {
    const children = [...e.children]; return { last: children.at(-1).getBoundingClientRect().bottom, end: e.parentElement.nextElementSibling.getBoundingClientRect().top };
  });
  expect(bottom.end).toBeGreaterThanOrEqual(bottom.last);
  expect(await page.locator('.day-cell').count()).toBeLessThan(30);
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
  await page.getByRole('button', { name: 'Show all positions', exact: true }).click();
  await assignName(page, 'Day start event', 'Inspection');
  await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Preview Monday: Routine', exact: true }).hover();
  const panel = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await expect(panel).toContainText('Day start event');
  await panel.getByRole('button', { name: 'Open Day start event: Inspection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Inspection');
});
