import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/examples/task-macro-example.json' with { type: 'json' };
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'help.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(example)) });
}
async function saved(page) {
  const pending = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function checkHelp(page, t, titleKey, hintKeys) {
  for (const key of hintKeys) await expect(page.getByText(t(key), { exact: true })).toHaveCount(0);
  const trigger = page.getByRole('button', { name: t('sectionHelp', { section: t(titleKey) }), exact: true });
  await trigger.click();
  const modal = page.getByRole('dialog');
  for (const key of hintKeys) await expect(modal.getByText(t(key), { exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
}

test('expression and task macro help is contextual, localized and never edits project data', async ({ page }) => {
  await load(page); const en = translator('en');
  await navigate(page, 'expressions');
  await page.getByRole('button', { name: en('addComputedVariable'), exact: true }).click();
  await page.getByRole('textbox', { name: en('nodeName'), exact: true }).fill('Test expression');
  const before = await saved(page);
  await checkHelp(page, en, 'macroParameters', ['expressionParametersHint']);
  await navigate(page, 'taskMacros');
  const macro = Object.values(example.task_macros).find((item) => item.mode === 'sequence');
  await page.locator('.operand-sidebar').getByRole('button', { name: `${macro.display_name} ${macro.steps.length}`, exact: true }).click();
  await checkHelp(page, en, 'macroParameters', ['macroParametersHint']);
  await checkHelp(page, en, 'taskSteps', ['taskStepsHint']);
  expect(await saved(page)).toEqual(before);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const zh = translator('zh-TW');
  await checkHelp(page, zh, 'macroParameters', ['macroParametersHint']);
  await checkHelp(page, zh, 'taskSteps', ['taskStepsHint']);
});

test('builtin expression help includes its signature guidance and fits a narrow Chinese viewport', async ({ page }) => {
  await load(page); await navigate(page, 'expressions', 'en', 'environment');
  await page.getByRole('treeitem', { name: 'Random item', exact: true }).click();
  await checkHelp(page, translator('en'), 'macroParameters', ['expressionParametersHint', 'expressionFunctionHint_randomItem', 'expressionVariadicHint']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const zh = translator('zh-TW');
  await page.getByRole('button', { name: zh('sectionHelp', { section: zh('macroParameters') }), exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText(zh('expressionParametersHint'), { exact: true })).toBeVisible();
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/macro-help-mobile-zh.png' });
  await modal.locator('.modal-footer').getByRole('button', { name: zh('close'), exact: true }).click();
  await expect(modal).toHaveCount(0);
});
