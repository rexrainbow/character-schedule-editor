import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileProject } from '../../src/core/model.js';
import { navigate } from './navigation.js';

async function load(page, mobile = false, startWeekday) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const imported = importBlueprint(await readFile('docs/recipes/examples/life-simulation.yaml', 'utf8'));
  expect(imported.errors).toEqual([]);
  if (startWeekday) imported.draft.sequences[0].startWeekday = startWeekday;
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'trends.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(imported.draft).data)) });
  await navigate(page, 'continuousSimulation', 'en', 'simulation');
}

test('trend charts show captured Day 0 values, synchronize keyboard tooltips and keep variable selection separate', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page);
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('7');
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  const results = page.locator('.continuous-simulation-editor .simulation-results');
  await expect(results).toContainText('Completed 7 days.');
  await results.getByRole('tab', { name: 'Trends', exact: true }).click();
  const charts = results.locator('.continuous-trend-figure');
  await expect(charts).toHaveCount(3);
  await expect(charts.first().locator('.recharts-line-curve')).toBeVisible();
  await charts.first().locator('.recharts-surface').focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await expect(charts.first().getByRole('tooltip')).toContainText('Day 0');
  await expect(charts.first().getByRole('tooltip')).toContainText('Initial value');
  await expect(charts.first().getByRole('tooltip')).toContainText('60');
  await page.keyboard.press('ArrowRight');
  await expect(charts.first().getByRole('tooltip')).toContainText('Day 1');
  await expect(charts.first().getByRole('tooltip')).toContainText('Monday');
  await expect(charts.nth(1).getByRole('tooltip')).toContainText('Day 1');
  await page.screenshot({ path: 'artifacts/continuous-trends-desktop.png' });
  const options = results.locator('.continuous-trend-options');
  await options.getByRole('checkbox', { name: '體力', exact: true }).uncheck();
  await expect(charts).toHaveCount(2);
  await options.getByRole('checkbox', { name: '本周完成班數', exact: true }).check();
  await expect(charts).toHaveCount(3);
  for (const checkbox of await options.getByRole('checkbox').all()) await checkbox.uncheck();
  await expect(results).toContainText('Select a numeric variable to display its trend.');
  await options.getByRole('checkbox', { name: '金錢', exact: true }).check();
  await results.getByRole('tab', { name: 'Daily records', exact: true }).click();
  await expect(results.locator('tbody tr')).toHaveCount(7);
  await expect(results.locator('thead')).toContainText('體力');
  await results.getByRole('tab', { name: 'Weekly summaries', exact: true }).click();
  await expect(results.locator('tbody tr')).toHaveCount(1);
  await results.getByRole('tab', { name: 'Trends', exact: true }).click();
  await expect(charts).toHaveCount(1); await expect(charts.first()).toContainText('金錢');
  expect(errors).toEqual([]);
});

test('Traditional Chinese charts fit narrow screens and recover after switching input/result panels', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page, true, 'thu');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('spinbutton', { name: '模擬天數', exact: true }).fill('3');
  await page.getByRole('button', { name: '開始連續模擬', exact: true }).click();
  const results = page.locator('.continuous-simulation-editor .simulation-results');
  await expect(results).toContainText('已完成 3 天。');
  await results.getByRole('tab', { name: '趨勢圖', exact: true }).click();
  await expect(results.locator('.recharts-line-curve')).toHaveCount(3);
  await page.getByRole('tab', { name: '輸入', exact: true }).click();
  await page.getByRole('tab', { name: '結果', exact: true }).click();
  await expect(results.locator('.recharts-line-curve').first()).toBeVisible();
  const chart = results.locator('.continuous-trend-figure').first();
  await chart.locator('.recharts-surface').focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await expect(chart.getByRole('tooltip')).toContainText('初始值');
  await page.keyboard.press('ArrowRight');
  await expect(chart.getByRole('tooltip')).toContainText('Day 1');
  await expect(chart.getByRole('tooltip')).toContainText('星期四');
  await page.screenshot({ path: 'artifacts/continuous-trends-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('constant zero series remains visible and produces finite SVG coordinates', async ({ page }) => {
  const imported = importBlueprint('variables: {counter: {initial: 0}}\nweeks: {w: {}}\nsequences: {s: {weeks: [w]}}');
  expect(imported.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'zero.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(imported.draft).data)) });
  await navigate(page, 'continuousSimulation', 'en', 'simulation');
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  const results = page.locator('.continuous-simulation-editor .simulation-results');
  await expect(results).toContainText('Completed 3 days.');
  await results.getByRole('tab', { name: 'Trends', exact: true }).click();
  const line = results.locator('.recharts-line-curve');
  await expect(results.locator('.recharts-line-dot').first()).toBeVisible();
  expect(await line.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  expect(await line.evaluate((element) => element.getTotalLength())).toBeGreaterThan(0);
  const y = await line.evaluate((element) => element.getBBox().y);
  expect(y).toBeGreaterThan(12); expect(y).toBeLessThan(182);
});
