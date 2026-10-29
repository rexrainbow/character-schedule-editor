import { exportProject, navigate } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/sequence-example.json' with { type: 'json' };
import { translator } from '../../src/i18n/index.js';

async function load(page, data = example) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'icons.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('status')).toContainText('JSON imported successfully.');
}
async function pick(page, name) {
  const openDialog = page.getByRole('dialog');
  await (await openDialog.count() ? openDialog : page).getByRole('button', { name: 'Choose icon', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose icon', exact: true });
  await dialog.getByRole('textbox', { name: 'Search icons' }).fill(name);
  await dialog.getByRole('button', { name, exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
}
async function exported(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

test('eight solid colors appear first, render without a glyph and survive export and import', async ({ page }) => {
  await load(page);
  await expect(page.locator('.slot-list .slot-item .slot-icon').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.icon-field .slot-icon').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Choose icon', exact: true }).click();
  const dialog = page.getByRole('dialog');
  expect((await dialog.locator('.icon-choice').allTextContents()).slice(0, 8)).toEqual(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Gray']);
  await dialog.getByRole('combobox', { name: 'Category' }).selectOption('colors');
  await expect(dialog.locator('.icon-choice')).toHaveCount(8);
  await dialog.getByRole('button', { name: 'Blue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const icon = page.locator('.icon-field [data-icon="blue"]');
  await expect(icon).toHaveCSS('background-color', 'rgb(96, 165, 250)');
  await expect(icon.locator('svg')).toHaveCount(0);
  const saved = await exported(page); expect(Object.values(saved.day_schedules)[0].icon).toBe('blue');
  await load(page, saved);
  await expect(icon).toHaveCSS('background-color', 'rgb(96, 165, 250)');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW');
  const t = translator('zh-TW'); await page.getByRole('button', { name: t('chooseIcon'), exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: t('iconCategory') }).selectOption('colors');
  await expect(page.getByRole('dialog').locator('.icon-choice')).toHaveCount(8);
  await expect(page.getByRole('dialog').locator('.icon-choice').first()).toHaveText('\u7d05\u8272');
});

test('one offline catalog edits all entity types and updates relationship icons', async ({ page, context }) => {
  const errors = [], external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url()); });
  await load(page); await context.setOffline(true);
  await navigate(page, 'slots'); await pick(page, 'Doctor');
  await expect(page.locator('.sidebar .slot-item').first().locator('[data-icon="tabler:stethoscope"]')).toBeVisible();
  await navigate(page, 'days'); await pick(page, 'Health');
  await navigate(page, 'weeks'); await pick(page, 'Home');
  await expect(page.getByRole('button', { name: 'Choose day for Monday', exact: true }).locator('..').locator('[data-icon="tabler:heart"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monday / Slot 1', exact: true }).locator('[data-icon="tabler:stethoscope"]')).toBeVisible();
  await navigate(page, 'sequences'); await pick(page, 'Important');
  await expect(page.getByRole('button', { name: 'Choose week for Week 1', exact: true }).locator('[data-icon="tabler:home"]')).toBeVisible();
  await expect(page.locator('.sequence-day').filter({ has: page.getByRole('button', { name: 'Week 3 / Monday', exact: true }) }).locator('.day-preview-name [data-icon="tabler:heart"]')).toBeVisible();
  const data = await exported(page);
  expect(Object.values(data.slots)[0].icon).toBe('tabler:stethoscope');
  expect(Object.values(data.day_schedules)[0].icon).toBe('tabler:heart');
  expect(Object.values(data.week_schedules)[0].icon).toBe('tabler:home');
  expect(Object.values(data.week_sequences)[0].icon).toBe('tabler:star');
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('picker cancel, translated search, clear, and editor-dialog drafts stay isolated', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit slot', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Display name', exact: true }).fill('Draft name');
  await page.getByRole('dialog').getByRole('button', { name: 'Choose icon', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('combobox', { name: 'Category' }).selectOption('health');
  await page.getByRole('dialog').getByRole('button', { name: 'Doctor', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Draft name');
  await expect(page.getByRole('dialog').locator('.icon-field [data-icon="tabler:bus"]')).toBeVisible();
  await pick(page, 'Doctor');
  await expect(page.getByRole('dialog').locator('.icon-field [data-icon="tabler:stethoscope"]')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(Object.values((await exported(page)).slots)[0].icon).toBe('commute');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW');
  const t = translator('zh-TW');
  await page.getByRole('button', { name: t('chooseIcon'), exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: t('searchIcons') }).fill('看醫生');
  await page.getByRole('dialog').getByRole('button', { name: '看醫生', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('apply'), exact: true }).click();
  await page.getByRole('button', { name: t('chooseIcon'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('clearIcon'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('apply'), exact: true }).click();
  await page.getByRole('combobox', { name: t('language') }).selectOption('en');
  expect(Object.values((await exported(page)).day_schedules)[0].icon).toBe('');
});

test('unknown imported names display locally and cancel preserves their original value', async ({ page }) => {
  const data = structuredClone(example);
  Object.values(data.day_schedules)[0].icon = 'constructor';
  Object.values(data.week_schedules)[0].icon = '__proto__';
  await load(page, data);
  await expect(page.locator('.icon-field [data-icon="constructor"]')).toBeVisible();
  await page.getByRole('button', { name: 'Choose icon', exact: true }).click();
  await expect(page.locator('.icon-preview')).toContainText('constructor');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await navigate(page, 'weeks');
  await page.getByRole('button', { name: 'Choose icon', exact: true }).click();
  await expect(page.locator('.icon-preview')).toContainText('__proto__');
  await page.keyboard.press('Escape');
  const saved = await exported(page);
  expect(Object.values(saved.day_schedules)[0].icon).toBe('constructor');
  expect(Object.values(saved.week_schedules)[0].icon).toBe('__proto__');
});
