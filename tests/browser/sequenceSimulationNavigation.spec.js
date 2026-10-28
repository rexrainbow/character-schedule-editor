import { test, expect } from '@playwright/test';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { compileProject } from '../../src/core/model.js';
import { navigate } from './navigation.js';

async function load(page) {
  const imported = importBlueprint('variables: {counter: {initial: 0}}\nweeks: {w: {}}\nsequences:\n  first: {display_name: First, weeks: [w]}\n  second: {display_name: Second, weeks: [w]}');
  expect(imported.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'navigation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(imported.draft).data)) });
  await navigate(page, 'sequences');
  return imported.draft;
}

test('sequence shortcuts preserve inputs and same-target results, clear changed targets, and return to the selected sequence', async ({ page }) => {
  const draft = await load(page);
  await page.locator('.sidebar .search-field input').fill('First');
  await page.getByRole('button', { name: 'Continuous simulation', exact: true }).click();
  const selector = page.getByRole('combobox', { name: 'Week sequence to simulate', exact: true });
  await expect(selector).toHaveValue(draft.sequences[0].id);
  await expect(page.locator('.simulation-results')).toContainText('Choose a sequence and inputs');
  await page.getByRole('spinbutton', { name: 'Days to simulate', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Random seed', exact: true }).fill('saved-seed');
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Completed 2 days.');
  await page.getByRole('button', { name: 'Back to sequence editor', exact: true }).click();
  await expect(page.locator('#sequence-name')).toHaveValue('First');
  await expect(page.locator('.sidebar .search-field input')).toHaveValue('');
  await page.getByRole('button', { name: 'Continuous simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('Completed 2 days.');
  await page.getByRole('button', { name: 'Back to sequence editor', exact: true }).click();
  await page.locator('.sidebar .slot-item').filter({ hasText: 'Second' }).click();
  await page.getByRole('button', { name: 'Continuous simulation', exact: true }).click();
  await expect(selector).toHaveValue(draft.sequences[1].id);
  await expect(page.getByRole('spinbutton', { name: 'Days to simulate', exact: true })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: 'Random seed', exact: true })).toHaveValue('saved-seed');
  await expect(page.locator('.simulation-results')).toContainText('Choose a sequence and inputs');
  await selector.selectOption(draft.sequences[0].id);
  await page.getByRole('button', { name: 'Back to sequence editor', exact: true }).click();
  await expect(page.locator('#sequence-name')).toHaveValue('First');
  await page.screenshot({ path: 'artifacts/sequence-simulation-navigation-desktop.png' });
});

test('returning during a run cancels and retains completed dates without stale updates', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Continuous simulation', exact: true }).click();
  await page.evaluate(async () => {
    const { Runtime } = await import('/src/runtime/index.js'); const original = Runtime.prototype.resume;
    Runtime.prototype.resume = async function () { await new Promise((resolve) => setTimeout(resolve, 300)); return this.status === 'paused' ? this.snapshot() : original.call(this); };
  });
  await page.getByRole('button', { name: 'Start continuous simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('1 / 28 days completed');
  await page.getByRole('button', { name: 'Back to sequence editor', exact: true }).click();
  await page.getByRole('button', { name: 'Continuous simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText(/Stopped; retained \d+ completed days/);
  await expect(page.getByRole('button', { name: 'Start continuous simulation', exact: true })).toBeEnabled();
});

test('Traditional Chinese narrow screens expose both shortcuts with compact accessible icons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const shortcut = page.getByRole('button', { name: '連續模擬', exact: true });
  await expect(shortcut).toBeVisible(); await expect(shortcut.locator('span')).toBeHidden();
  await shortcut.focus(); await page.keyboard.press('Enter');
  const back = page.getByRole('button', { name: '回到周序列編輯', exact: true });
  await expect(back).toBeVisible();
  await page.screenshot({ path: 'artifacts/sequence-simulation-navigation-mobile.png' });
  await back.click(); await expect(page.locator('#sequence-name')).toHaveValue('First');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
