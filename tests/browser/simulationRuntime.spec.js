import { test, expect } from '@playwright/test';
import { builtinVariableFixture } from '../builtinVariableFixture.js';
import { compileProject } from '../../src/core/model.js';
import { switchMode } from './navigation.js';

async function load(page) {
  const { draft } = builtinVariableFixture(), compiled = compileProject(draft);
  expect(compiled.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await switchMode(page, 'simulation');
  await page.evaluate(async () => {
    const { Runtime } = await import('/src/runtime/index.js');
    const original = Runtime.prototype.resume;
    window.simulationRuns = 0;
    Runtime.prototype.resume = async function () {
      window.simulationRuns++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (this.status === 'paused') return this.snapshot();
      return original.call(this);
    };
  });
}

test('runtime simulation prevents duplicate runs, cancels without applying and can run again', async ({ page }) => {
  await load(page);
  const run = page.getByRole('button', { name: 'Run simulation', exact: true });
  await run.click(); await expect(run).toBeDisabled(); await expect(run).toHaveAttribute('aria-busy', 'true');
  await run.evaluate((button) => { button.click(); button.click(); });
  await expect(page.locator('.simulation-results')).toContainText('Running simulation');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Simulation cancelled');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('10');
  await expect.poll(() => page.evaluate(() => window.simulationRuns)).toBe(1);
  await run.click();
  await expect(page.locator('.simulation-results')).toContainText('10 → 8');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/simulation-runtime-desktop.png' });
});

test('editing inputs and leaving simulation invalidate pending results instead of publishing stale values', async ({ page }) => {
  await load(page);
  const run = page.getByRole('button', { name: 'Run simulation', exact: true });
  await run.click();
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('30');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.simulationRuns)).toBe(1);
  await run.click();
  await expect(page.locator('.simulation-results')).toContainText('30 → 28');
  await expect(page.locator('.simulation-results')).not.toContainText('10 → 8');
  await run.click(); await switchMode(page, 'user'); await switchMode(page, 'simulation');
  await expect(page.locator('.simulation-results')).toContainText('Set test values and run');
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('30');
});

test('Chinese narrow-screen runtime trace preserves keyboard controls, apply and reset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const run = page.getByRole('button', { name: '執行模擬', exact: true });
  await run.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeVisible();
  await expect(page.locator('.simulation-results')).toContainText('10 → 8');
  await page.screenshot({ path: 'artifacts/simulation-runtime-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '套用執行後數值', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: '重設輸入', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('10');
});
