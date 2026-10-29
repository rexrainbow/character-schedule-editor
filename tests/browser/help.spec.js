import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { navigate, switchMode } from './navigation.js';

test('welcome Help opens a one-screen introduction with keyboard close and focus restoration', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Help', exact: true });
  const original = page.url();
  await button.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Character Schedule Editor', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table')).toBeVisible();
  await expect(dialog.getByRole('row')).toHaveCount(8);
  await expect(dialog.getByRole('rowheader')).toHaveText(['Week sequence', 'Week schedule', 'Day schedule', 'Slot schedule', 'Task macro', 'Task', 'Variables / expression macros']);
  await expect(dialog).toContainText('Slot schedules can also call tasks directly');
  expect(await dialog.locator('.modal-body').evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/help-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(button).toBeFocused();
  expect(page.url()).toBe(original);
  await expect(page.locator('.welcome')).toBeVisible();
});

test('Help is available in user, environment and simulation modes without changing the editor location', async ({ page }) => {
  const result = importBlueprint(await readFile(new URL('../fixtures/life-simulation.yaml', import.meta.url), 'utf8'));
  expect(result.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'help.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
  await expect(page).toHaveURL(/#\/user\/days\//);
  for (const mode of ['user', 'environment', 'simulation']) {
    if (mode === 'user') await navigate(page, 'expressions'); else await switchMode(page, mode);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-mode', mode);
    await expect.poll(() => page.url()).toContain(`#/${mode}/`);
    const original = page.url();
    const length = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Character Schedule Editor', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.locator('.modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(page.url()).toBe(original); expect(await page.evaluate(() => history.length)).toBe(length);
  }
});

test('Traditional Chinese introduction stays readable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const button = page.getByRole('button', { name: '說明', exact: true });
  await button.click();
  const dialog = page.getByRole('dialog', { name: '角色行程編輯器', exact: true });
  await expect(dialog.getByRole('rowheader')).toHaveText(['周序列', '周行程', '日行程', '時段行程', '任務巨集', '任務', '變數／計算式巨集']);
  await expect(dialog).toContainText('體力足夠就工作，否則休息');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await dialog.locator('.modal-body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await dialog.locator('.modal-body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('heading', { name: '編輯 → 模擬 → 匯出', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/help-mobile.png' });
  await dialog.locator('.modal-footer').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(button).toBeFocused();
});
