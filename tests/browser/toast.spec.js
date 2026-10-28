import { test, expect } from '@playwright/test';
import { exportProject } from './navigation.js';

async function setup(page, mobile = false) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const time = new Date('2026-10-28T00:00:00Z');
  await page.clock.install({ time }); await page.clock.pauseAt(time);
  await page.goto('/');
}
async function upload(page, content) {
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'toast.yaml', mimeType: 'application/yaml', buffer: Buffer.from(content) });
}

test('success toast is fixed at the lower left and disappears after one second', async ({ page }) => {
  await setup(page);
  await upload(page, 'project: {name: Toast test}');
  const toast = page.locator('.app-toast');
  await expect(toast).toContainText('Project rebuilt');
  await expect(toast).toHaveCSS('position', 'fixed');
  const box = await toast.boundingBox(), viewport = page.viewportSize();
  expect(box.x).toBe(16); expect(box.y + box.height).toBe(viewport.height - 16);
  await page.clock.runFor(999); await expect(toast).toBeVisible();
  await page.screenshot({ path: 'artifacts/toast-desktop.png' });
  await page.clock.runFor(1); await expect(toast).toHaveCount(0);
});

test('a replacement notification gets a fresh timer and cannot be dismissed by the earlier timer', async ({ page }) => {
  await setup(page); await upload(page, 'project: {name: Toast test}');
  await expect(page.locator('.app-toast')).toBeVisible(); await page.clock.runFor(600);
  await exportProject(page);
  await expect(page.locator('.app-toast')).toContainText('JSON exported');
  await page.clock.runFor(500); await expect(page.locator('.app-toast')).toBeVisible();
  await page.clock.runFor(500); await expect(page.locator('.app-toast')).toHaveCount(0);
});

test('Chinese mobile toasts fit the viewport while errors and validation details remain until dismissed', async ({ page }) => {
  await setup(page, true);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await upload(page, 'project: {name: Toast test}');
  await expect(page.locator('.app-toast')).toContainText('YAML 藍圖匯入成功');
  const box = await page.locator('.app-toast').boundingBox();
  expect(box.x).toBe(16); expect(box.x + box.width).toBeLessThanOrEqual(374);
  await page.screenshot({ path: 'artifacts/toast-mobile.png' });
  await page.clock.runFor(1000); await expect(page.locator('.app-toast')).toHaveCount(0);
  await upload(page, 'expressions: {bad: {type: number, value: vars.missing}}');
  await expect(page.locator('.notice-error')).toBeVisible();
  await expect(page.locator('.import-issues')).toBeVisible();
  await page.clock.runFor(5000);
  await expect(page.locator('.notice-error')).toBeVisible();
  await expect(page.locator('.import-issues')).toBeVisible();
  await page.locator('.notice-error').getByRole('button').click();
  await expect(page.locator('.notice-error')).toHaveCount(0);
  await expect(page.locator('.import-issues')).toHaveCount(0);
});
