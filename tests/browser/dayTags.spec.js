import { showAllDayPurposes } from './dayOptions.js';
import { openDayOptions, closeDayOptions } from './dayOptions.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture } from '../sequenceEventsFixture.js';
import { compileProject, createDay } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
async function load(page) {
  const f = sequenceEventsFixture(); f.main.tags = ['Main', 'Work']; f.draft.days.find((day) => day.id === f.eventDay.id).tags = ['Event', 'Work'];
  f.draft.days.push(createDay(f.draft, 'Rest'));
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'tags.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(f.draft).data)) });
  return f;
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('day tags trim input, prevent duplicates, filter with names and survive copies and project reloads', async ({ page }) => {
  const { main } = await load(page); const list = page.locator('.sidebar .slot-list');
  await page.getByRole('textbox', { name: 'New tag', exact: true }).fill(' Work ');
  await expect(page.getByRole('button', { name: 'Add tag', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'New tag', exact: true }).fill(' Custom '); await page.getByRole('textbox', { name: 'New tag', exact: true }).press('Enter');
  await page.getByRole('combobox', { name: 'Add existing tag', exact: true }).selectOption('Event');
  await expect(page.locator('.day-tags-editor .day-tag')).toHaveCount(4);
  await list.getByRole('button', { name: 'Filter by tag: Event', exact: true }).first().click();
  await expect(list.locator('.slot-item')).toHaveCount(2);
  await openDayOptions(page);
  await page.getByRole('textbox', { name: translator('en')('searchDays'), exact: true }).fill('Inspection'); await expect(list.locator('.slot-item')).toHaveCount(1);
  await closeDayOptions(page);
  await openDayOptions(page);
  await page.getByRole('textbox', { name: translator('en')('searchDays'), exact: true }).fill('');
  await closeDayOptions(page);
  await openDayOptions(page);
  await page.getByRole('combobox', { name: 'Filter by tag', exact: true }).selectOption('untagged');
  await closeDayOptions(page);
  await expect(list.locator('.slot-item')).toHaveCount(1); await expect(list.locator('.slot-item')).toHaveText('Rest');
  await openDayOptions(page);
  await page.getByRole('button', { name: 'Clear tag filter', exact: true }).click();
  await closeDayOptions(page);
  await list.getByRole('button', { name: 'Workday', exact: true }).click();
  await page.getByRole('button', { name: 'Day actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Duplicate day', exact: true }).click();
  const data = await save(page), copy = Object.values(data.day_schedules).find((day) => day.display_name !== 'Workday' && day.display_name.startsWith('Workday'));
  expect(data.day_schedules[main.id].tags).toEqual(['Main', 'Work', 'Custom', 'Event']); expect(copy.tags).toEqual(data.day_schedules[main.id].tags);
  await page.getByRole('button', { name: 'Remove tag: Custom', exact: true }).click();
  const changed = await save(page); expect(changed.day_schedules[main.id].tags).toContain('Custom');
  const runtimePending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  const runtime = JSON.parse(await readFile(await (await runtimePending).path(), 'utf8')); expect(runtime.days[main.id].tags).toContain('Custom');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'reload.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
  await openDayOptions(page);
  await expect(page.getByRole('combobox', { name: 'Filter by tag', exact: true })).toHaveValue('');
  await closeDayOptions(page);
  await expect(list.getByRole('button', { name: 'Filter by tag: Custom', exact: true })).toHaveCount(1);
});

test('week, override and event-day selectors share tag filtering without changing hidden assignments', async ({ page }) => {
  await load(page); await navigate(page, 'weeks'); await page.getByRole('button', { name: 'Choose day for Monday', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Filter by tag', exact: true }).selectOption('tag:Event');
  await expect(dialog.getByRole('radio', { name: 'Inspection', exact: true })).toBeVisible(); await expect(dialog.getByRole('radio', { name: 'Workday', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose day for Monday', exact: true }).locator('..')).toContainText('Workday');
  await navigate(page, 'sequences'); await page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByRole('combobox', { name: 'Filter by tag', exact: true }).selectOption('untagged');
  await expect(dialog.getByRole('radio', { name: 'Rest', exact: true })).toBeVisible(); await expect(dialog.getByRole('radio', { name: 'Inspection', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Manage events (0)', exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Add event group', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Event day schedule', exact: true }).click();
  await showAllDayPurposes(page);
  await dialog.getByRole('combobox', { name: 'Filter by tag', exact: true }).selectOption('tag:Event');
  await expect(dialog.getByRole('option', { name: 'Workday', exact: true })).toHaveCount(0);
  await dialog.getByRole('option', { name: 'Inspection', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.sequence-event-icon')).toHaveCount(1);
});

test('Chinese mobile tag editor and untagged filtering fit the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW'); const t = translator('zh-TW');
  await page.getByRole('textbox', { name: t('newDayTag'), exact: true }).fill('特殊狀況'); await page.getByRole('button', { name: t('addDayTag'), exact: true }).click();
  await expect(page.getByRole('button', { name: t('removeDayTag', { tag: '特殊狀況' }), exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openDayOptions(page);
  await page.getByRole('combobox', { name: t('filterDayTags'), exact: true }).selectOption('untagged');
  await closeDayOptions(page);
  await expect(page.locator('.sidebar .slot-item')).toHaveCount(1);
});
