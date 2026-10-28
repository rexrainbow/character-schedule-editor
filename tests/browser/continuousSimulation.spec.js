import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';

async function load(page) {
  const yaml = await readFile('docs/recipes/examples/life-simulation.yaml', 'utf8');
  const imported = importBlueprint(yaml); expect(imported.errors).toEqual([]);
  const project = compileProject(imported.draft); expect(project.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'continuous.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project.data)) });
  await navigate(page, 'continuousSimulation', 'en', 'simulation');
  return project.data;
}
test('continuous days/weeks retain snapshots, replay details and never modify project data', async ({ page }) => {
  const before = await load(page);
  const results = page.locator('.continuous-simulation-editor .simulation-results');
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  await expect(results).toContainText('Completed 28 days.', { timeout: 15000 });
  await expect(results.locator('tbody tr')).toHaveCount(14);
  const firstRow = await results.locator('tbody tr').first().textContent();
  await results.locator('.continuous-date-button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Day 1 details', exact: true });
  await expect(dialog).toContainText('Changes by source');
  await expect(dialog.locator('.continuous-source-list')).toContainText('每日心情消耗');
  await dialog.getByRole('button', { name: 'Inspect this day’s execution', exact: true }).click();
  await expect(dialog.locator('.simulation-trace').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to day summary', exact: true }).click();
  await dialog.getByText('Complete daily variable snapshot', { exact: true }).click();
  await expect(dialog).toContainText('本周完成班數');
  await page.keyboard.press('Escape');
  await results.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(results.locator('.continuous-date-button').first()).toContainText('Day 15');
  await results.getByRole('tab', { name: 'Weekly summaries', exact: true }).click();
  await expect(results.locator('tbody tr')).toHaveCount(4);
  await results.locator('.continuous-date-button').first().click();
  const week = page.getByRole('dialog', { name: 'Week 1 summary', exact: true });
  await expect(week).toContainText('Complete end-of-week snapshot');
  await expect(week).toContainText('本周完成班數');
  await week.getByRole('button', { name: 'Inspect the final day of this week', exact: true }).click();
  const finalDay = page.getByRole('dialog', { name: 'Day 7 details', exact: true });
  await expect(finalDay).toBeVisible();
  await finalDay.locator('.continuous-source-list button').first().click();
  await expect(page.getByRole('tab', { name: 'Days', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, 'continuousSimulation', 'en', 'simulation');
  await results.getByRole('tab', { name: 'Daily records', exact: true }).click();
  await page.screenshot({ path: 'artifacts/continuous-simulation-desktop.png' });
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  await expect(results).toContainText('Completed 28 days.', { timeout: 15000 });
  expect(await results.locator('tbody tr').first().textContent()).toBe(firstRow);
  const pending = page.waitForEvent('download'); await exportProject(page);
  expect(JSON.parse(await readFile(await (await pending).path(), 'utf8'))).toEqual(before);
});

test('cancellation retains completed days, input edits invalidate results and tabs keep separate sessions', async ({ page }) => {
  await load(page);
  await page.evaluate(async () => {
    const { Runtime } = await import('/src/runtime/index.js'); const original = Runtime.prototype.resume;
    Runtime.prototype.resume = async function () { await new Promise((resolve) => setTimeout(resolve, 300)); return this.status === 'paused' ? this.snapshot() : original.call(this); };
  });
  const run = page.getByRole('button', { name: 'Start continuous simulation', exact: true }), results = page.locator('.continuous-simulation-editor .simulation-results');
  await run.click(); await expect(run).toBeDisabled(); await expect(run).toHaveAttribute('aria-busy', 'true');
  await expect(results).toContainText('1 / 28 days completed');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(results).toContainText(/Stopped; retained \d+ completed days/);
  expect(await results.locator('tbody tr').count()).toBeGreaterThan(0);
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('2');
  await expect(results).toContainText('Choose a sequence and inputs');
  await run.click();
  await page.getByRole('tab', { name: 'Schedule simulation', exact: true }).click();
  await expect(page.locator('.continuous-simulation-editor')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Continuous simulation', exact: true }).click();
  await expect(run).toBeEnabled();
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('1'); await run.click();
  await expect(results).toContainText('Completed 1 days.');
});

test('Traditional Chinese narrow-screen run exposes full day snapshots and keyboard-accessible replay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('spinbutton', { name: '模擬天數', exact: true }).fill('3');
  const run = page.getByRole('button', { name: '開始連續模擬', exact: true }); await run.focus(); await page.keyboard.press('Enter');
  const results = page.locator('.continuous-simulation-editor .simulation-results');
  await expect(results).toContainText('已完成 3 天。');
  await expect(results).toBeVisible();
  await results.locator('.continuous-date-button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Day 1 詳細資訊', exact: true });
  await dialog.getByRole('button', { name: '檢查當日執行流程', exact: true }).click();
  await expect(dialog.locator('.simulation-trace').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/continuous-simulation-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
