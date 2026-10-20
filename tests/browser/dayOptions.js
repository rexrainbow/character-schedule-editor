import { translator } from '../../src/i18n/index.js';
import { expect } from '@playwright/test';

export async function openDayOptions(page) {
  const trigger = page.locator('.day-options-trigger');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(page.getByRole('dialog').filter({ has: page.locator('.day-list-controls') })).toBeVisible();
}
export async function closeDayOptions(page) {
  if (await page.locator('.day-options-trigger').getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape');
  await expect(page.locator('.day-options-trigger')).toHaveAttribute('aria-expanded', 'false');
}

export async function showAllDayPurposes(page) {
  const t = translator(await page.locator('html').getAttribute('lang'));
  await page.getByRole('dialog').getByRole('combobox', { name: t('filterDayUses'), exact: true }).selectOption('');
}
