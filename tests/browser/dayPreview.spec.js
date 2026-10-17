import { test, expect } from '@playwright/test';
import example from '../../src/sequence-example.json' with { type: 'json' };
import { translator } from '../../src/i18n.js';
import { navigate } from './navigation.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'sequence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
  await navigate(page, 'sequences');
}
const row = (page, count = 1) => page.getByRole('group', { name: `Week ${count}`, exact: true });
const preview = (page) => page.getByRole('dialog', { name: 'Day schedule information', exact: true });

test('slot icons navigate from the preview to the selected slot and clear stale searches', async ({ page }) => {
  await load(page); await navigate(page, 'slots');
  const t = translator('en');
  await page.getByRole('textbox', { name: t('search'), exact: true }).fill('missing');
  await navigate(page, 'sequences');
  await row(page).getByRole('button', { name: 'Preview Tuesday: Workday', exact: true }).click();
  const day = Object.values(example.day_schedules).find((day) => day.display_name === 'Workday');
  for (const [index, id] of day.slot_ids.entries()) await expect(preview(page).getByRole('listitem').nth(index).getByRole('button')).toHaveCount(id ? 1 : 0);
  const name = example.slots[day.slot_ids[1]].display_name;
  await preview(page).getByRole('button', { name: t('openSlotFor', { count: 2, name }), exact: true }).click();
  await expect(page.getByRole('textbox', { name: t('name'), exact: true })).toHaveValue(name);
  await expect(page.getByRole('textbox', { name: t('search'), exact: true })).toHaveValue('');
  await expect(preview(page)).toHaveCount(0);
  await expect(page.locator('.sidebar .slot-item[aria-pressed="true"]')).toContainText(name);
});

test('hover shows effective day slots, allows entering the panel, and jumps past a stale day search', async ({ page }) => {
  await load(page); await navigate(page, 'days');
  await page.getByRole('textbox', { name: translator('en')('searchDays'), exact: true }).fill('missing');
  await navigate(page, 'sequences');
  await row(page).getByRole('button', { name: 'Preview Tuesday: Workday', exact: true }).hover();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page)).toContainText('Source week: Normal week');
  await expect(preview(page).getByRole('listitem')).toHaveCount(6);
  const day = Object.values(example.day_schedules).find((day) => day.display_name === 'Workday');
  for (const [index, id] of day.slot_ids.entries()) await expect(preview(page).getByRole('listitem').nth(index)).toContainText(id ? example.slots[id].display_name : 'Unassigned');
  await preview(page).hover();
  await preview(page).getByRole('button', { name: 'Open day schedule', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday');
  await expect(page.getByRole('textbox', { name: translator('en')('searchDays'), exact: true })).toHaveValue('');
  await expect(preview(page)).toHaveCount(0);
});

test('overrides, empty days and keyboard previews show the effective source without changing assignment', async ({ page }) => {
  await load(page);
  await row(page).getByRole('button', { name: 'Preview Monday: Holiday', exact: true }).focus();
  await expect(preview(page)).toContainText('Source: day override');
  await expect(preview(page).getByRole('listitem')).toHaveCount(6);
  await expect(preview(page).getByRole('listitem').first()).toContainText('Unassigned');
  await page.keyboard.press('Escape'); await expect(preview(page)).toHaveCount(0);
  await row(page, 2).getByRole('button', { name: 'Preview Friday: Unassigned', exact: true }).click();
  await expect(preview(page)).toContainText('This override explicitly clears the day schedule.');
  await expect(preview(page).getByRole('button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await row(page, 2).getByRole('button', { name: 'Preview Tuesday: Unassigned', exact: true }).click();
  await expect(preview(page)).toContainText('Source week: Rest week');
  await expect(preview(page).getByRole('button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await row(page).getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Holiday', exact: true })).toBeChecked();
});

test('private days jump to the source week and highlight the weekday; named week days open directly', async ({ page }) => {
  await load(page); await navigate(page, 'weeks');
  await page.getByRole('textbox', { name: translator('en')('searchWeeks'), exact: true }).fill('missing');
  await navigate(page, 'sequences');
  await row(page).getByRole('button', { name: 'Preview Wednesday: Week custom', exact: true }).hover();
  await expect(preview(page)).toContainText('wed custom');
  await preview(page).getByRole('button', { name: 'Open source week', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Week name', exact: true })).toHaveValue('Normal week');
  await expect(page.getByRole('textbox', { name: translator('en')('searchWeeks'), exact: true })).toHaveValue('');
  await expect(page.locator('.weekday-header[data-weekday="wed"]')).toHaveClass(/highlighted-weekday/);
  await expect(page.locator('.weekday-header[data-weekday="wed"]')).toBeFocused();
  await page.locator('.weekday-header[data-weekday="mon"] .day-preview-name').hover();
  await page.waitForTimeout(550);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preview Monday: Workday', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open day schedule: Monday / Workday', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday');
});

test('touch opens a bounded Chinese preview and its navigation action', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'zh-TW' });
  const page = await context.newPage(); const t = translator('zh-TW');
  try {
    await page.goto(baseURL);
    await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'sequence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
    await navigate(page, 'sequences', 'zh-TW');
    const first = page.getByRole('group', { name: t('weekNumber', { count: 1 }), exact: true });
    await first.getByRole('button', { name: t('previewDayFor', { weekday: t('mon'), name: 'Holiday' }), exact: true }).tap();
    const panel = page.getByRole('dialog', { name: t('dayPreview'), exact: true });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: 'test-results/day-preview-mobile.png' });
    await panel.getByRole('button', { name: t('openDayEditor'), exact: true }).tap();
    await expect(page.getByRole('textbox', { name: t('dayName'), exact: true })).toHaveValue('Holiday');
  } finally { await context.close(); }
});
