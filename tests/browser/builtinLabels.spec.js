import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expressionFunctionYaml } from '../expressionFunctionFixture.js';
import { parse, stringify } from 'yaml';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';

async function load(page) {
  const input = parse(expressionFunctionYaml);
  input.builtins = { increment_variable: { icon: 'blue' }, reset_variable: { display_name: 'reset_variable' } };
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'labels.yaml', mimeType: 'application/yaml', buffer: Buffer.from(stringify(input)) });
  await expect(page.getByRole('status')).toContainText('YAML');
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
async function language(page, locale) {
  await page.getByRole('combobox', { name: translator(await page.locator('html').getAttribute('lang'))('language'), exact: true }).selectOption(locale);
}

test('increase/reset use live translated defaults and custom task names remain unchanged', async ({ page }) => {
  await load(page); await navigate(page, 'tasks');
  await expect(page.getByRole('button', { name: 'Increase value', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset initial value', exact: true })).toBeVisible();
  await language(page, 'zh-TW');
  await expect(page.getByRole('button', { name: '增加數值', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重設初始值', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '增加數值', exact: true }).click();
  await page.getByRole('textbox', { name: translator('zh-TW')('name'), exact: true }).fill('額外獎勵');
  await language(page, 'en');
  await expect(page.getByRole('button', { name: '額外獎勵', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: translator('en')('name'), exact: true }).fill('');
  await expect(page.getByRole('button', { name: 'Increase value', exact: true })).toBeVisible();
});

test('random function and parameter labels follow locale without storing translations or overwriting custom labels', async ({ page }) => {
  await load(page); await navigate(page, 'expressions', 'en', 'environment');
  await expect(page.getByRole('treeitem', { name: 'Random range', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Random item', exact: true })).toBeVisible();
  const baseline = await save(page);
  await language(page, 'zh-TW');
  await page.getByRole('treeitem', { name: '隨機範圍', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '隨機選項', exact: true })).toBeVisible();
  await expect(page.locator('.parameter-row').first().getByRole('textbox', { name: translator('zh-TW')('parameterName'), exact: true })).toHaveAttribute('placeholder', '最小值');
  await expect(page.locator('.parameter-row').nth(1).getByRole('textbox', { name: translator('zh-TW')('parameterName'), exact: true })).toHaveAttribute('placeholder', '最大值');
  expect(await save(page)).toEqual(baseline);
  await page.screenshot({ path: 'test-results/builtin-labels-zh.png', fullPage: true });
  await page.getByRole('textbox', { name: translator('zh-TW')('nodeName'), exact: true }).fill('我的範圍');
  await page.locator('.parameter-row').first().getByRole('textbox', { name: translator('zh-TW')('parameterName'), exact: true }).fill('下界');
  await language(page, 'en');
  await expect(page.getByRole('treeitem', { name: '我的範圍', exact: true })).toBeVisible();
  await expect(page.locator('.parameter-row').first().getByRole('textbox', { name: 'Parameter name', exact: true })).toHaveValue('下界');
  await expect(page.locator('.parameter-row').nth(1).getByRole('textbox', { name: 'Parameter name', exact: true })).toHaveAttribute('placeholder', 'Maximum');
  await navigate(page, 'expressions');
  await page.getByRole('treeitem', { name: 'Greeting', exact: true }).click();
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'String expression', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('treeitem', { name: 'Random item', exact: true })).toBeVisible();
  await expect(page.locator('.expression-call-parameter')).toContainText('Candidates');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
});
