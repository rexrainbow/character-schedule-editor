import { test, expect } from '@playwright/test';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileProject } from '../../src/core/model.js';
import { navigate } from './navigation.js';

async function load(page, mobile) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const imported = importBlueprint(`variables: {energy: {initial: 100}}
slots: {use: {branches: [{when: null, run: {builtin: increment_variable, target: energy, value: "-1"}}]}}
days: {d: {start: use}, e: {}}
weeks: {w: {days: {mon: d, tue: d, wed: d, thu: d, fri: d, sat: d, sun: d}}}
sequences: {s: {weeks: [{week: w, repeat: null}], start_weekday: thu, events: {cold: {display_name: Cold, kind: probability, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, probability: 100, cooldown_days: 1, day: e, priority: 2}, bonus: {display_name: Bonus, kind: periodic, start: {week: 1, weekday: mon}, end: {week: 1, weekday: sun}, every: 1, day: e, priority: 1}}}}
`);
  expect(imported.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'markers.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(imported.draft).data)) });
  await navigate(page, 'continuousSimulation', 'en', 'simulation');
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('5');
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Completed 5 days.');
  await page.getByRole('tab', { name: 'Trends', exact: true }).click();
}

for (const mobile of [false, true]) test(`event colors, overlapping markers and point-to-day navigation (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await load(page, mobile);
  const options = page.locator('.trend-event-options');
  await expect(options).toContainText('Cold (3)'); await expect(options).toContainText('Bonus (5)');
  await options.getByRole('checkbox', { name: 'Mark event: Cold', exact: true }).check();
  await options.getByRole('combobox', { name: 'Event color: Cold', exact: true }).selectOption('red');
  await options.getByRole('checkbox', { name: 'Mark event: Bonus', exact: true }).check();
  await options.getByRole('combobox', { name: 'Event color: Bonus', exact: true }).selectOption('blue');
  const chart = page.locator('.continuous-trend-figure').first();
  const first = chart.locator('.continuous-trend-point[data-day="1"]').first();
  await expect(first).toHaveAttribute('data-events', '2');
  await expect(first.locator('.recharts-line-dot')).toHaveAttribute('fill', '#F87171');
  await expect(first.locator('.trend-event-ring')).toHaveAttribute('stroke', '#60A5FA');
  await expect(chart.locator('.continuous-trend-point[data-day="2"]').first()).toHaveAttribute('data-events', '1');
  await chart.locator('.recharts-surface').focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(chart.getByRole('tooltip')).toContainText('Cold'); await expect(chart.getByRole('tooltip')).toContainText('Bonus');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Day 1 details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const second = chart.locator('.continuous-trend-point[data-day="2"]').first();
  await second.scrollIntoViewIfNeeded(); const box = await second.locator('.trend-point-hit').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('dialog', { name: 'Day 2 details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `artifacts/trend-markers-${mobile ? 'mobile' : 'desktop'}.png` });
  await page.getByRole('tab', { name: 'Weekly summaries', exact: true }).click();
  await page.getByRole('tab', { name: 'Trends', exact: true }).click();
  await expect(options.getByRole('checkbox', { name: 'Mark event: Cold', exact: true })).toBeChecked();
  await expect(options.getByRole('combobox', { name: 'Event color: Cold', exact: true })).toHaveValue('red');
  expect(errors).toEqual([]);
});
