import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { iconBlueprint } from '../iconFixture.js';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'icons.yaml', mimeType: 'application/yaml', buffer: Buffer.from(stringify(iconBlueprint)) });
  await expect(page.getByRole('status')).toContainText('YAML');
}
async function save(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function choose(page, trigger, foreground, background, apply = true, locale = 'en') {
  const t = translator(locale);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: t('chooseIcon'), exact: true });
  await dialog.getByRole('textbox', { name: t('searchIcons') }).fill(foreground);
  await dialog.getByRole('button', { name: foreground, exact: true }).click();
  if (background?.startsWith('#')) await dialog.getByRole('textbox', { name: t('iconHexColor') }).fill(background);
  else if (background) await dialog.getByRole('combobox', { name: t('iconBackground') }).selectOption(background);
  if (apply) await dialog.getByRole('button', { name: t('apply'), exact: true }).click();
  else await page.keyboard.press('Escape');
}

test('parameter and enum icons share composition, contrast, cancel and project/Blueprint persistence', async ({ page }) => {
  const external = [], errors = [];
  page.on('request', (request) => { if (request.url().startsWith('http') && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await load(page); await navigate(page, 'tasks');
  await page.locator('.slot-item').filter({ has: page.getByText('Work', { exact: true }) }).click();
  const parameter = page.locator('.parameter-row').first();
  const trigger = parameter.getByRole('button', { name: 'Choose icon', exact: true });
  await choose(page, trigger, 'Doctor', '#101218', false);
  await expect(trigger).toBeFocused();
  await expect(trigger.locator('[data-icon="tabler:calculator|yellow"]')).toBeVisible();
  await choose(page, trigger, 'Doctor', '#101218');
  await expect(trigger.locator('.slot-icon')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(trigger.locator('svg').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  const option = page.locator('.parameter-row').nth(2).locator('.enum-option-name .icon-field');
  await choose(page, option, 'Blue');
  await expect(option.locator('[data-icon="blue"]')).toBeVisible();
  const saved = await save(page), task = Object.values(saved.tasks).find((item) => item.name === 'work');
  expect(task.parameters[0].icon).toBe('tabler:stethoscope|#101218');
  expect(task.parameters[2].options[0].icon).toBe('blue');
  await navigate(page, 'taskMacros');
  await choose(page, page.locator('.parameter-row .icon-field').first(), 'Important', 'orange');
  await expect(page.locator('.parameter-row [data-icon="tabler:star|orange"]')).toBeVisible();
  await navigate(page, 'enums', 'en', 'environment');
  await expect(page.locator('.icon-field .icon-warning')).toBeVisible();
  await choose(page, page.locator('.enum-option-row .icon-field').first(), 'Health', 'red');
  await expect(page.locator('.enum-option-row [data-icon="tabler:heart|red"]').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/icon-options-desktop.png', fullPage: true });
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('fixed builtin option icons remain editable and the picker fits a narrow Traditional Chinese screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page); await navigate(page, 'tasks');
  await page.getByRole('button', { name: 'Adjust probability event', exact: true }).click();
  const operation = page.locator('.parameter-row').nth(2);
  await expect(operation.getByRole('combobox', { name: 'Parameter type', exact: true })).toBeDisabled();
  await choose(page, operation.locator('.enum-options-preview .icon-field').first(), 'Green');
  const saved = await save(page);
  expect(saved.builtin_tasks.adjust_probability_event.parameters.operation.option_icons.set).toBe('green');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const t = translator('zh-TW');
  await operation.locator('.parameter-name-fields .icon-field').click();
  const dialog = page.getByRole('dialog', { name: t('chooseIcon'), exact: true });
  await dialog.getByRole('combobox', { name: t('iconBackground') }).selectOption('purple');
  await dialog.getByRole('textbox', { name: t('searchIcons') }).fill('no-such-icon');
  await expect(dialog.getByText(t('noIcons'), { exact: true })).toBeVisible();
  const geometry = await dialog.evaluate((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, scroll: node.scrollWidth, width: node.clientWidth }));
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(390); expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  await page.screenshot({ path: 'test-results/icon-picker-mobile-zh.png', fullPage: true });
  await page.keyboard.press('Escape');
});
