import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { compileProject, createDay } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';

function fixture({ many = false, long = false, mode = 'random' } = {}) {
  const f = sequenceEventsFixture(), { draft, sequence, activity, eventDay, main } = f;
  const first = draft.days.find((day) => day.id === eventDay.id);
  first.slotIds[0] = activity.id;
  first.slotEvents = [{ startId: activity.id, endId: activity.id }, { startId: null, endId: null }, { startId: null, endId: null }];
  first.slotReleases = [{ builtin: 'release_slot', condition: null }, null, null];
  const other = createDay(draft, 'Not a candidate'); draft.days.push(other);
  const extras = many ? Array.from({ length: 12 }, (_, i) => createDay(draft, `Candidate ${i + 1}`)) : [];
  draft.days.push(...extras);
  const group = { ...rule(sequence, eventDay.id), display_name: 'Event choices', sourceMode: mode, dayCandidates: [first, main, ...extras].map((day, i) => ({ dayId: day.id, weight: i + 1 })) };
  sequence.eventGroups = [group];
  if (long) {
    draft.project.settings.slots_per_day = 80;
    for (const day of draft.days) {
      day.slotIds = Array(80).fill(activity.id);
      if (day.slotEvents) day.slotEvents = Array.from({ length: 80 }, (_, i) => day.slotEvents[i] ?? { startId: null, endId: null });
      if (day.slotReleases) day.slotReleases = Array.from({ length: 80 }, (_, i) => day.slotReleases[i] ?? null);
    }
  }
  return f;
}
async function load(page, draft, locale = 'en') {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'viewer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await navigate(page, 'sequences');
  if (locale !== 'en') await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(locale);
}
async function open(page, locale = 'en') {
  const t = translator(locale);
  await page.locator('.sequence-event-icon').first().focus();
  await page.getByRole('dialog', { name: t('dayPreview'), exact: true }).getByRole('button', { name: t('viewEventCandidates'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: t('eventCandidatesViewer'), exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: t('dayPreview'), exact: true })).toHaveCount(0);
  return dialog;
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('read-only viewer shows only event candidates, weights, configured positions and all-position toggle', async ({ page }) => {
  const { draft } = fixture(); await load(page, draft); const before = await save(page), dialog = await open(page);
  await expect(dialog.locator('.event-candidates-heading')).toContainText('Event choices');
  await expect(dialog.locator('.event-candidate-choice')).toHaveCount(2);
  await expect(dialog.locator('.event-candidate-choice').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.event-candidate-choice').first()).toContainText('33.3%');
  await expect(dialog).not.toContainText('Not a candidate');
  await expect(dialog.locator('input, select, textarea')).toHaveCount(0);
  await expect(dialog.locator('.event-candidate-position')).toHaveText(['Day start event', 'Slot 1 start event', 'Slot 1', 'Slot 1 end event', 'Slot 2', 'Slot 3']);
  await expect(dialog).toContainText('Always release');
  await dialog.getByRole('button', { name: 'Show all positions', exact: true }).click();
  await expect(dialog.locator('.event-candidate-position')).toContainText(['Day start event', 'Slot 1 start event', 'Slot 1']);
  await dialog.getByRole('button', { name: 'Show configured positions only', exact: true }).click();
  await dialog.locator('.event-candidate-choice').getByText('Workday', { exact: true }).click();
  await expect(dialog.locator('.event-candidate-position')).toHaveText(['Slot 1', 'Slot 2', 'Slot 3']);
  await page.screenshot({ path: 'test-results/event-candidates-desktop.png' });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(await save(page)).toEqual(before);
});

test('day navigation and slot navigation return to the chosen candidate and restore long-list position', async ({ page }) => {
  const { draft } = fixture({ long: true }); await load(page, draft); let dialog = await open(page);
  await dialog.getByRole('button', { name: 'Workday', exact: true }).click();
  await dialog.getByRole('button', { name: 'Open day schedule', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday');
  await page.getByRole('textbox', { name: 'Day name', exact: true }).fill('Updated Workday');
  await page.getByRole('button', { name: 'Back to candidate day schedules', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Event day schedule viewer', exact: true });
  await expect(dialog.getByRole('button', { name: 'Updated Workday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.locator('.event-candidate-rows').evaluate((e) => { e.scrollTop = 3500; });
  expect(await dialog.locator('.event-candidate-row').count()).toBeLessThan(30);
  await dialog.getByRole('button', { name: 'Open slot 36: Inspection task', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Inspection task');
  await page.getByRole('button', { name: 'Back to candidate day schedules', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Updated Workday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => dialog.locator('.event-candidate-rows').evaluate((e) => e.scrollTop)).toBe(3500);
  await expect(dialog.getByRole('button', { name: 'Open slot 36: Inspection task', exact: true })).toBeVisible();
});

test('search filters only candidates and independent scrolling preserves the selected details', async ({ page }) => {
  const { draft } = fixture({ many: true, long: true }); await load(page, draft); const dialog = await open(page);
  const list = dialog.locator('.event-candidates-list'), detail = dialog.locator('.event-candidate-rows');
  await list.evaluate((e) => { e.scrollTop = 200; }); const top = await list.evaluate((e) => e.scrollTop); expect(top).toBeGreaterThan(0);
  await detail.evaluate((e) => { e.scrollTop = 500; }); expect(await list.evaluate((e) => e.scrollTop)).toBe(top);
  const search = dialog.getByRole('searchbox', { name: 'Search candidate day schedules', exact: true });
  await search.fill('Candidate 12'); await expect(dialog.locator('.event-candidate-choice')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Candidate 12', exact: true }).click();
  await search.fill('Missing'); await expect(dialog.locator('.event-candidate-choice')).toHaveCount(0);
  await expect(dialog.locator('.event-candidate-day-heading')).toContainText('Candidate 12');
  await search.fill(''); await expect(dialog.getByRole('button', { name: 'Candidate 12', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await dialog.locator('.modal-body').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
});

test('Chinese mobile sequential viewer fits the viewport and keeps readonly navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft } = fixture({ mode: 'sequential' }); await load(page, draft, 'zh-TW'); const dialog = await open(page, 'zh-TW');
  await expect(dialog.locator('.event-candidate-choice').first()).toContainText('1.');
  await dialog.getByRole('button', { name: 'Workday', exact: true }).click();
  await expect(dialog.locator('.event-candidate-day-heading')).toContainText('Workday');
  await page.screenshot({ path: 'test-results/event-candidates-mobile.png' });
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  const box = await dialog.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390); expect(box.y + box.height).toBeLessThanOrEqual(844);
  await dialog.getByRole('button', { name: '開啟日行程', exact: true }).click();
  await page.getByRole('button', { name: '返回候選日行程', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Workday', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
