import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { reportFixture } from '../reportFixture.js';
import { compileProject } from '../../src/core/model.js';
import { createSequence } from '../../src/core/sequenceModel.js';
import { translator } from '../../src/i18n/index.js';
import { navigate, exportProject } from './navigation.js';

async function load(page) {
  const f = reportFixture(); f.draft.sequences.push(createSequence(f.draft, 'Second sequence'));
  const result = compileProject(f.draft); expect(result.errors).toEqual([]);
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'report.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
  await navigate(page, 'sequences'); return result.data;
}
async function open(page, locale = 'en') {
  const t = translator(locale); await page.getByRole('button', { name: t('sequenceActions'), exact: true }).click();
  await expect(page.getByRole('menu').getByRole('menuitem').last()).toHaveText(t('exportReport'));
  await page.getByRole('menuitem', { name: t('exportReport'), exact: true }).click();
  return page.getByRole('dialog');
}

test('last sequence action exports all sequences as linked Markdown without changing project contents', async ({ page }) => {
  const before = await load(page), dialog = await open(page);
  await expect(dialog.getByRole('checkbox', { name: 'Include unreferenced content', exact: true })).not.toBeChecked();
  const pending = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download Markdown', exact: true }).click();
  const download = await pending; expect(download.suggestedFilename()).toBe('character-schedule-report.md');
  const text = await readFile(await download.path(), 'utf8');
  expect(text).toContain('# Project schedule report: Daily routine'); expect(text).toContain('### Second sequence');
  expect(text).toContain('Day 1 / Thursday'); expect(text).toContain('Probability candidate');
  expect(text).toContain('## Events'); expect(text).toContain('## Day schedules'); expect(text).toContain('## Slot schedules and task logic');
  expect(text).toContain('Adjust probability event (Cold'); expect(text).not.toContain('Unused slot');
  await expect(dialog).toHaveCount(0);
  const projectDownload = page.waitForEvent('download'); await exportProject(page);
  expect(JSON.parse(await readFile(await (await projectDownload).path(), 'utf8'))).toEqual(before);
});

test('Chinese mobile report options fit, cancel keeps content unchanged, and unreferenced content can be included', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW'); const t = translator('zh-TW');
  let dialog = await open(page, 'zh-TW');
  await expect(dialog.locator('.modal-footer')).toBeInViewport();
  await dialog.getByRole('checkbox', { name: t('reportIncludeUnreferenced'), exact: true }).check();
  await page.screenshot({ path: 'test-results/report-options-mobile.png' });
  await dialog.getByRole('button', { name: t('cancel'), exact: true }).click();
  dialog = await open(page, 'zh-TW');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked(); await dialog.getByRole('checkbox').check();
  const pending = page.waitForEvent('download'); await dialog.getByRole('button', { name: t('reportDownload'), exact: true }).click();
  const text = await readFile(await (await pending).path(), 'utf8');
  expect(text).toContain('## 周序列'); expect(text).toContain('## 事件'); expect(text).toContain('## 日行程');
  expect(text).toContain('Unused slot'); expect(text).toContain('未引用'); expect(text).toContain('機率候選');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid current fields block report export and report download preserves unsaved project state', async ({ page }) => {
  await load(page);
  await page.getByRole('textbox', { name: 'Sequence name', exact: true }).fill('');
  const dialog = await open(page); await dialog.getByRole('button', { name: 'Download Markdown', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fix these project errors');
  await expect(dialog.locator('code')).toContainText('/display_name');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('textbox', { name: 'Sequence name', exact: true }).fill('Edited sequence');
  const fixed = await open(page), pending = page.waitForEvent('download');
  await fixed.getByRole('button', { name: 'Download Markdown', exact: true }).click(); await pending;
  let confirmed = false; page.once('dialog', async (native) => { confirmed = true; await native.dismiss(); });
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  expect(confirmed).toBe(true); await expect(page.getByRole('dialog')).toHaveCount(0);
});
