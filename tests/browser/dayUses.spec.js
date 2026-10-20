import { openDayOptions, closeDayOptions } from './dayOptions.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dayUsesFixture } from '../dayUsesFixture.js';
import { compileProject } from '../../src/core/model.js';
import { translator } from '../../src/i18n/index.js';
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  const f = dayUsesFixture(), project = compileProject(f.draft); expect(project.errors).toEqual([]);
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'uses.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project.data)) });
  return { ...f, data: project.data };
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('grouped and flat views share object identity, compose with filters and persist manually selected purposes', async ({ page }) => {
  const { data } = await load(page), list = page.locator('.sidebar .slot-list');
  await openDayOptions(page);
  await expect(page.getByRole('combobox', { name: 'List view', exact: true })).toHaveValue('grouped');
  await closeDayOptions(page);
  await expect(list.locator('.day-use-group-main>summary')).toHaveAttribute('aria-label', 'Main (2)');
  await expect(list.locator('.day-use-group-overlay>summary')).toHaveAttribute('aria-label', 'Overlay event (2)');
  await expect(list.locator('.day-use-group-interrupt>summary')).toHaveAttribute('aria-label', 'Interrupt event (1)');
  await list.locator('.day-use-group-main').getByRole('button', { name: 'Workday', exact: true }).click();
  const uses = page.getByRole('region', { name: 'Intended uses', exact: true });
  await expect(uses.getByRole('checkbox', { name: 'Main', exact: true })).toBeChecked(); await expect(uses.getByRole('checkbox', { name: 'Overlay event', exact: true })).toBeChecked();
  await page.getByRole('textbox', { name: 'Day name', exact: true }).fill('Renamed workday');
  await expect(list.getByRole('button', { name: 'Renamed workday', exact: true })).toHaveCount(2);
  await page.screenshot({ path: 'test-results/day-uses-desktop.png' });
  await list.locator('.day-use-group-main>summary').click(); await expect(list.locator('.day-use-group-main')).not.toHaveAttribute('open', '');
  await openDayOptions(page);
  await page.getByRole('combobox', { name: 'List view', exact: true }).selectOption('flat');
  await closeDayOptions(page);
  await expect(list.locator('.slot-item')).toHaveCount(5);
  await list.getByRole('button', { name: 'Filter by use: Overlay event', exact: true }).first().click();
  await expect(list.locator('.slot-item')).toHaveCount(2);
  await openDayOptions(page);
  await page.getByRole('combobox', { name: 'Filter by tag', exact: true }).selectOption('tag:Office'); await expect(list.locator('.slot-item')).toHaveCount(1);
  await closeDayOptions(page);
  await openDayOptions(page);
  await page.getByRole('textbox', { name: translator('en')('searchDays'), exact: true }).fill('Inspection'); await expect(list.locator('.slot-item')).toHaveCount(0);
  await closeDayOptions(page);
  await openDayOptions(page);
  await page.getByRole('textbox', { name: translator('en')('searchDays'), exact: true }).fill('');
  await closeDayOptions(page);
  const changed = await save(page); const original = structuredClone(data); original.day_schedules[Object.keys(original.day_schedules).find((id) => original.day_schedules[id].display_name === 'Workday')].display_name = 'Renamed workday';
  expect(changed).toEqual(original);
});

test('container changes preserve purposes and copies inherit manual purposes', async ({ page }) => {
  await load(page); await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Manage events (3)', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('option', { name: /Interrupt day event/ }).click();
  await dialog.getByRole('combobox', { name: 'Execution mode', exact: true }).selectOption('overlay');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await navigate(page, 'days'); const list = page.locator('.sidebar .slot-list');
  await expect(list.locator('.day-use-group-interrupt').getByRole('button', { name: 'Interrupt day', exact: true })).toBeVisible();
  await list.locator('.day-use-group-interrupt').getByRole('button', { name: 'Interrupt day', exact: true }).click();
  const purposes = page.getByRole('region', { name: 'Intended uses', exact: true });
  await purposes.getByRole('checkbox', { name: 'Overlay event', exact: true }).check();
  await purposes.getByRole('checkbox', { name: 'Interrupt event', exact: true }).uncheck();
  await expect(list.locator('.day-use-group-overlay').getByRole('button', { name: 'Interrupt day', exact: true })).toBeVisible();
  await openDayOptions(page);
  await page.getByRole('combobox', { name: 'Filter by use', exact: true }).selectOption('main');
  await closeDayOptions(page);
  await list.getByRole('button', { name: 'Workday', exact: true }).click();
  await page.getByRole('button', { name: 'Day actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Duplicate day', exact: true }).click();
  await openDayOptions(page);
  await expect(page.getByRole('combobox', { name: 'Filter by use', exact: true })).toHaveValue('');
  await closeDayOptions(page);
  await expect(list.locator('.day-use-group-main').getByRole('button', { name: 'Workday (副本)', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Intended uses', exact: true }).getByRole('checkbox', { name: 'Main', exact: true })).toBeChecked();
  expect(Object.values((await save(page)).day_schedules).find((day) => day.display_name === 'Workday (副本)').tags).toEqual(['Office']);
});

test('Chinese mobile grouping and editable purposes fit without page overflow or nested vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW'); const t = translator('zh-TW');
  await openDayOptions(page);
  await page.getByRole('combobox', { name: t('filterDayUses'), exact: true }).selectOption('interrupt');
  await closeDayOptions(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Interrupt day', exact: true }).click();
  const uses = page.getByRole('region', { name: t('dayUses'), exact: true });
  await expect(uses).toContainText('中斷事件'); await expect(uses.getByRole('checkbox', { name: t('dayUse_interrupt'), exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/day-uses-mobile.png' });
  await openDayOptions(page);
  await page.getByRole('combobox', { name: t('dayListView'), exact: true }).selectOption('flat');
  await closeDayOptions(page);
  await expect(page.locator('.sidebar .slot-item')).toHaveCount(1);
  await page.getByRole('button', { name: t('addDay'), exact: true }).click();
  await openDayOptions(page);
  await expect(page.getByRole('combobox', { name: t('filterDayUses'), exact: true })).toHaveValue('');
  await closeDayOptions(page);
  await expect(page.getByRole('region', { name: t('dayUses'), exact: true }).getByRole('checkbox', { name: t('dayUse_main'), exact: true })).toBeChecked();
});
