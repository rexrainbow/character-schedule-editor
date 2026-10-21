import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { importBlueprint } from '../../src/core/blueprint/index.js';

const fixture = fileURLToPath(new URL('../../docs/recipes/examples/life-simulation.yaml', import.meta.url));
async function load(page) { await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles(fixture); }
const dirty = (page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

test('export menu downloads a rebuildable YAML blueprint with descriptions and keeps unsaved state', async ({ page }) => {
  await load(page);
  await page.getByRole('textbox', { name: 'Description (optional)', exact: true }).fill('Blueprint export intent.');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Runtime data (JSON)', exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Blueprint (YAML)', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('character-schedule-blueprint.yaml');
  const yaml = await readFile(await download.path(), 'utf8');
  expect(parse(yaml).days.working.description).toBe('Blueprint export intent.');
  expect(yaml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  expect(importBlueprint(yaml).errors).toEqual([]);
  expect(await dirty(page)).toBe(true);
  await expect(page.getByRole('status')).toContainText('Blueprint exported');
  await expect(page.getByRole('menu', { name: 'Export', exact: true })).toHaveCount(0);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/yaml', buffer: Buffer.from(yaml) });
  await expect(page.getByRole('textbox', { name: 'Description (optional)', exact: true })).toHaveValue('Blueprint export intent.');
});

test('invalid names block both export formats and corrected input can be exported', async ({ page }) => {
  await load(page);
  const name = page.getByRole('textbox', { name: 'Name (symbol)', exact: true });
  await name.fill('bad.name');
  let count = 0; page.on('download', () => count++);
  for (const option of ['Runtime data (JSON)', 'Blueprint (YAML)']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: option, exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Unable to export');
    await expect(page.locator('.issues')).toBeVisible();
  }
  expect(count).toBe(0);
  await name.fill('working');
  await page.getByRole('button', { name: 'Export', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Runtime data (JSON)', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const pending = page.waitForEvent('download'); await page.keyboard.press('Enter');
  expect((await pending).suggestedFilename()).toMatch(/\.yaml$/);
});

test('Chinese export menu fits a narrow screen and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const trigger = page.getByRole('button', { name: '匯出', exact: true });
  await expect(trigger).toBeInViewport(); await trigger.click();
  await expect(page.getByRole('menuitem', { name: '執行資料（JSON）', exact: true })).toBeInViewport();
  await expect(page.getByRole('menuitem', { name: '藍圖（YAML）', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/export-menu-mobile.png' });
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu', { name: '匯出', exact: true })).toHaveCount(0);
});
