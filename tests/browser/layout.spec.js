import { navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { translator } from '../../src/i18n/index.js';
import example from '../../src/examples/sequence-example.json' with { type: 'json' };

async function expectSingleScrollArea(page, selector) {
  const result = await page.locator(selector).evaluate((element) => {
    const scrollable = [];
    for (let current = element; current; current = current.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(current).overflowY) && current.scrollHeight > current.clientHeight + 1) scrollable.push(current.className);
    }
    return { scrollable, pageHeight: document.documentElement.scrollHeight, viewport: innerHeight, height: element.clientHeight };
  });
  expect(result.scrollable).toHaveLength(1);
  expect(result.pageHeight).toBeLessThanOrEqual(result.viewport);
  expect(result.height).toBeGreaterThan(250);
}

test('single toolbar, action menus and one editor scroll area across desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: 'Slots per day' }).fill('1000');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('.app-header')).toHaveCSS('height', '60px');
  await expect(page.locator('.workspace-nav')).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button', { name: 'Add day' }).click();
  await expectSingleScrollArea(page, '.day-cells');
  // Leave room for the day tag controls and collapsed event row above the grid.
  expect(await page.locator('.day-cells').evaluate((element) => element.clientHeight)).toBeGreaterThan(page.viewportSize().height * 0.7);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Project settings', exact: true }).click();
  await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Import project', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await navigate(page, 'weeks');
  await page.locator('.sidebar').getByRole('button', { name: 'Add week' }).click();
  await expectSingleScrollArea(page, '.week-matrix');
  expect(await page.locator('.week-matrix').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.week-matrix').evaluate((element) => element.scrollTop = element.scrollHeight);
  await expect(page.getByRole('button', { name: 'Sunday / Slot 1000', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose day for Sunday', exact: true })).toBeVisible();
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expectSingleScrollArea(page, '.week-matrix');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.week-matrix').evaluate((element) => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
    await page.getByRole('button', { name: 'Sunday / Slot 1000', exact: true }).click();
    await dialog.getByRole('button', { name: 'Create slot', exact: true }).click();
    await expect(dialog.locator('.modal-footer')).toBeInViewport();
    await expect(dialog.locator('.modal-header')).toBeInViewport();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await page.getByRole('combobox', { name: 'Editor page', exact: true }).selectOption('days');
  await expectSingleScrollArea(page, '.day-cells');
  await page.getByRole('button', { name: 'Day actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate day', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue(/New day \(.+\)/);
});

test('both seven-day matrices fit desktop widths and collapsed list preserves selection and search', async ({ page }) => {
  const data = structuredClone(example);
  for (const collection of ['slots', 'day_schedules', 'week_schedules', 'week_sequences']) {
    for (const item of Object.values(data[collection])) item.display_name += ' — A very long schedule name to check column overflow';
  }
  const sequence = Object.values(data.week_sequences)[0];
  sequence.week_schedule_ids = Array(30).fill(sequence.week_schedule_ids[0]); sequence.day_overrides = [];
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  async function fits(selector) {
    const size = await page.locator(selector).evaluate((e) => ({ width: e.clientWidth, content: e.scrollWidth }));
    expect(size.content).toBeLessThanOrEqual(size.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 768 });
    await navigate(page, 'weeks');
    await fits('.week-matrix');
    await expect(page.getByRole('button', { name: 'Choose day for Sunday', exact: true })).toBeInViewport({ ratio: 1 });
    await page.locator('.week-matrix').evaluate((e) => e.scrollTop = e.scrollHeight);
    await expect(page.getByRole('button', { name: 'Sunday / Slot 6', exact: true })).toBeInViewport({ ratio: 1 });
    await navigate(page, 'sequences');
    await fits('.sequence-matrix');
    await page.locator('.sequence-matrix').evaluate((e) => e.scrollTop = e.scrollHeight);
    await expect(page.getByRole('button', { name: 'Week 30 / Sunday', exact: true })).toBeInViewport({ ratio: 1 });
  }
  const name = await page.getByRole('textbox', { name: 'Sequence name', exact: true }).inputValue();
  await page.getByRole('textbox', { name: translator('en')('searchSequences'), exact: true }).fill('Stage');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: 'Collapse schedule list', exact: true }).click();
  await fits('.sequence-matrix');
  await expect(page.getByRole('textbox', { name: 'Sequence name', exact: true })).toHaveValue(name);
  await navigate(page, 'weeks');
  await fits('.week-matrix');
  await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Expand schedule list', exact: true }).click();
  await expect(page.getByRole('textbox', { name: translator('en')('searchSequences'), exact: true })).toHaveValue('Stage');
  await page.getByRole('button', { name: 'Collapse schedule list', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar .slot-list')).toBeVisible();
  expect(await page.locator('.sequence-matrix').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
});
