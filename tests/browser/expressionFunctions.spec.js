import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expressionFunctionYaml } from '../expressionFunctionFixture.js';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
import { createProject, compileProject } from '../../src/core/model.js';

async function load(page) {
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'functions.yaml', mimeType: 'application/yaml', buffer: Buffer.from(expressionFunctionYaml) });
  await expect(page.getByRole('status')).toContainText('YAML');
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
async function chooseLocal(page, argumentName, parameterName) {
  await page.getByRole('dialog').getByRole('button', { name: translator('en')('argumentFor', { name: argumentName }), exact: true }).click();
  await page.getByRole('dialog').getByRole('tab', { name: translator('en')('reference'), exact: true }).click();
  await page.getByRole('dialog').getByRole('treeitem', { name: parameterName, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
}

test('imported projects automatically include both functions without an install button or duplicate entries', async ({ page }) => {
  const source = compileProject(createProject()); expect(source.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source.data)) });
  await navigate(page, 'expressions', 'en', 'environment');
  await expect(page.getByRole('treeitem', { name: 'Random range', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Random item', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add random functions', exact: true })).toHaveCount(0);
  const saved = await save(page);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await navigate(page, 'expressions', 'en', 'environment');
  const second = await save(page);
  expect(second.expression_macros).toEqual(saved.expression_macros);
  expect(Object.keys(second.expression_macros)).toHaveLength(2);
});

test('environment functions expose fixed contracts and user expressions can declare parameters and call them', async ({ page }) => {
  await load(page); await navigate(page, 'expressions', 'en', 'environment');
  await page.getByRole('treeitem', { name: 'Random range', exact: true }).click();
  await expect(page.locator('.expression-parameters .parameter-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await expect(page.locator('.parameter-row').first().getByRole('combobox', { name: 'Parameter type', exact: true })).toBeDisabled();
  await page.locator('.parameter-row').first().getByRole('textbox', { name: 'Parameter name', exact: true }).fill('Lower bound');
  await navigate(page, 'expressions');
  const t = translator('en');
  await page.getByRole('button', { name: t('addComputedVariable'), exact: true }).click();
  await page.getByRole('textbox', { name: t('nodeName'), exact: true }).fill('Roll');
  await page.getByRole('textbox', { name: t('engineKey'), exact: true }).first().fill('custom_roll');
  for (const [index, symbol, label] of [[0, 'low', 'Low'], [1, 'high', 'High']]) {
    await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
    const row = page.locator('.parameter-row').nth(index);
    await row.getByRole('textbox', { name: t('engineKey'), exact: true }).fill(symbol);
    await row.getByRole('textbox', { name: 'Parameter name', exact: true }).fill(label);
  }
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numeric expression', exact: true }).click();
  await page.getByRole('dialog').getByRole('tab', { name: t('expressions'), exact: true }).click();
  await page.getByRole('dialog').getByRole('treeitem', { name: 'Random range', exact: true }).click();
  await chooseLocal(page, 'Lower bound', 'Low');
  await chooseLocal(page, 'Maximum', 'High');
  await expect(page.locator('.expression-preview').last()).toContainText('Low');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.parameter-row').first().getByRole('button', { name: 'Delete parameter', exact: true })).toBeDisabled();
  const saved = await save(page), macros = Object.values(saved.expression_macros), macro = macros.find((item) => item.name === 'custom_roll'), range = macros.find((item) => item.name === 'randomRange');
  expect(macro.parameters.map((p) => p.name)).toEqual(['low', 'high']);
  expect(macro.definition.expression.arguments[range.parameters[0].id]).toEqual({ type: 'parameter_reference', parameter_id: macro.parameters[0].id });
  expect(macro.definition.expression.arguments[range.parameters[1].id]).toEqual({ type: 'parameter_reference', parameter_id: macro.parameters[1].id });
  await page.locator('.operand-properties-area').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/expression-parameters-desktop.png', fullPage: true });
});

test('random item candidates edit through the same operand panel and retain cancel/Chinese mobile behavior', async ({ page }) => {
  await load(page); await navigate(page, 'expressions');
  await page.getByRole('treeitem', { name: 'Greeting', exact: true }).click();
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'String expression', exact: true }).click();
  await expect(page.locator('.expression-call-argument')).toHaveCount(3);
  await page.getByRole('dialog').getByRole('button', { name: 'Add candidate', exact: true }).click();
  await expect(page.locator('.expression-call-argument')).toHaveCount(4);
  await page.getByRole('dialog').getByRole('button', { name: 'Remove candidate', exact: true }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: translator('en')('argumentFor', { name: 'Candidates 2' }), exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: translator('en')('constantValue'), exact: true }).fill('Changed');
  await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  const saved = await save(page), macro = Object.values(saved.expression_macros).find((item) => item.name === 'greeting');
  expect(Object.values(macro.definition.expression.arguments)[0][1]).toEqual({ type: 'constant', value: 'Changed' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const t = translator('zh-TW');
  await page.getByRole('button', { name: t('editDefinition'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('stringDefinition'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('addExpressionCandidate'), exact: true }).click();
  const geometry = await page.getByRole('dialog').evaluate((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, scroll: node.scrollWidth, width: node.clientWidth }));
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(390); expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  await page.screenshot({ path: 'test-results/expression-candidates-mobile-zh.png', fullPage: true });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const after = await save(page); expect(after.expression_macros).toEqual(saved.expression_macros);
});
