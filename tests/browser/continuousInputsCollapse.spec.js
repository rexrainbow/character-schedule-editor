import { test, expect } from '@playwright/test';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileProject } from '../../src/core/model.js';
import { navigate } from './navigation.js';

async function load(page) {
  const imported = importBlueprint('variables: {counter: {initial: 10}}\ndays: {d: {}}\nweeks: {w: {}}\nsequences: {s: {weeks: [{week: w, repeat: null}], events: {one: {display_name: One, kind: once, start: {week: 1, weekday: mon}, day: d}}}}');
  expect(imported.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'collapse.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(imported.draft).data)) });
  await navigate(page, 'continuousSimulation', 'en', 'simulation');
}

test('collapsing inputs gives a 300-day chart more width and preserves values, markers and keyboard focus', async ({ page }) => {
  await load(page);
  await page.getByRole('spinbutton', { name: 'counter', exact: true }).fill('42');
  await page.getByRole('textbox', { name: 'Random seed', exact: true }).fill('collapse-seed');
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('300');
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  const results = page.locator('.continuous-simulation-editor .simulation-results');
  await expect(results).toContainText('Completed 300 days.', { timeout: 20000 });
  await results.getByRole('tab', { name: 'Trends', exact: true }).click();
  await results.getByRole('checkbox', { name: 'Mark event: One', exact: true }).check();
  const before = await results.boundingBox();
  const collapse = page.getByRole('button', { name: 'Collapse inputs', exact: true });
  await collapse.focus(); await page.keyboard.press('Enter');
  const expand = page.getByRole('button', { name: 'Expand inputs', exact: true });
  await expect(expand).toBeFocused(); await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.simulation-inputs')).toBeHidden();
  expect((await results.boundingBox()).width).toBeGreaterThan(before.width + 300);
  await expect(results).toContainText('Completed 300 days.');
  await expect(results.locator('.continuous-trend-point[data-day="150"]').first()).toBeVisible();
  await expect(results.getByRole('checkbox', { name: 'Mark event: One', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Start continuous simulation', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/continuous-inputs-collapsed.png' });
  await expand.focus(); await page.keyboard.press('Enter');
  await expect(collapse).toBeFocused();
  await expect(page.getByRole('spinbutton', { name: 'counter', exact: true })).toHaveValue('42');
  await expect(page.getByRole('textbox', { name: 'Random seed', exact: true })).toHaveValue('collapse-seed');
});

test('mobile input/result tabs work even when the desktop preference is collapsed', async ({ page }) => {
  await load(page); await page.getByRole('button', { name: 'Collapse inputs', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('tab', { name: '輸入', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'counter', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '展開輸入', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: '收合輸入', exact: true })).toBeHidden();
  await page.getByRole('tab', { name: '結果', exact: true }).click();
  await expect(page.locator('.simulation-results')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('button', { name: '展開輸入', exact: true })).toBeVisible();
});
