import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/sequence-example.json' with { type: 'json' };
import { translator } from '../../src/i18n.js';
import { navigate, exportProject } from './navigation.js';

async function load(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await navigate(page, 'days');
}

test('day slot jump opens the shared definition and returns without changing assignments, including on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  const t = translator('en'), day = Object.values(example.day_schedules).find((item) => item.display_name === 'Workday');
  const slot = example.slots[day.slot_ids[0]];
  await expect(page.locator('.day-cell.empty-cell .day-slot-open')).toHaveCount(0);
  await page.getByRole('button', { name: t('openSlotFor', { count: 1, name: slot.display_name }), exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: t('name'), exact: true })).toHaveValue(slot.display_name);
  await expect(page.getByRole('button', { name: 'Back to day', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: t('name'), exact: true }).fill('Updated shared slot');
  await page.getByRole('button', { name: 'Back to day', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday');
  await expect(page.getByRole('button', { name: 'Slot 1', exact: true })).toContainText('Updated shared slot');
  const pending = page.waitForEvent('download'); await exportProject(page);
  const saved = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(saved.day_schedules).toEqual(example.day_schedules);
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('return restores a far virtualized day position and the original day selection', async ({ page }) => {
  const data = structuredClone(example); data.project.settings.slots_per_day = 120;
  for (const day of Object.values(data.day_schedules)) day.slot_ids = Array.from({ length: 120 }, (_, index) => day.slot_ids[index] ?? null);
  const day = Object.values(data.day_schedules).find((item) => item.display_name === 'Workday');
  const slotId = day.slot_ids[0]; day.slot_ids[35] = slotId;
  await load(page, data);
  await page.locator('.day-cells').evaluate((element) => { element.scrollTop = 3500; });
  await page.getByRole('button', { name: translator('en')('openSlotFor', { count: 36, name: data.slots[slotId].display_name }), exact: true }).click();
  await page.getByRole('button', { name: 'Back to day', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday');
  await expect.poll(() => page.locator('.day-cells').evaluate((element) => element.scrollTop)).toBe(3500);
  await expect(page.getByRole('button', { name: 'Slot 36', exact: true })).toBeVisible();
  expect(await page.locator('.day-cell').count()).toBeLessThan(30);
});
