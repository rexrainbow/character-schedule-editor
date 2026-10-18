import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/sequence-example.json' with { type: 'json' };
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'range.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await navigate(page, 'sequences');
}
async function saved(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
for (const mobile of [false, true]) test(`range flags renumber dates, preserve outside editing and round-trip (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  await expect(page.getByRole('button', { name: 'Set start day: Monday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Set end day: Sunday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Set start day: Thursday', exact: true }).click();
  await page.getByRole('button', { name: 'Set end day: Friday', exact: true }).click();
  await expect(page.locator('.sequence-day[data-active=true] .sequence-day-number')).toHaveText(Array.from({ length: 16 }, (_, i) => `Day ${i + 1}`));
  await expect(page.locator('.outside-range')).toHaveCount(5);
  const before = page.getByRole('group', { name: 'Week 1', exact: true }).locator('.sequence-day').first();
  await expect(before).toContainText('Before start');
  await expect(before).toHaveCSS('background-color', 'rgb(16, 19, 27)');
  await before.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  const data = await saved(page), sequence = Object.values(data.week_sequences)[0];
  expect(sequence.start_weekday).toBe('thu'); expect(sequence.end_weekday).toBe('fri');
  await page.reload();
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'saved-range.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await navigate(page, 'sequences');
  await expect(page.getByRole('button', { name: 'Set start day: Thursday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Set end day: Friday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/sequence-range-${mobile ? 'mobile' : 'desktop'}.png` });
});

test('single-week boundaries move together and row removal normalizes the range with feedback', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Set start day: Saturday', exact: true }).click();
  await page.getByRole('button', { name: 'Set end day: Tuesday', exact: true }).click();
  for (let i = 0; i < 2; i++) await page.locator('.sequence-row-controls').last().getByRole('button', { name: 'Delete week row', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set end day: Saturday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('The other boundary was adjusted to keep a valid date range.', { exact: true })).toBeVisible();
  await expect(page.locator('.sequence-day[data-active=true]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Set end day: Monday', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set start day: Monday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Set start day: Wednesday', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set end day: Wednesday', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(page.getByRole('button', { name: '設為開始日：星期三', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('已連動調整另一個邊界，維持有效日期範圍。', { exact: true })).toBeVisible();
  const data = await saved(page), sequence = Object.values(data.week_sequences)[0];
  expect(sequence.start_weekday).toBe('wed'); expect(sequence.end_weekday).toBe('wed');
});
