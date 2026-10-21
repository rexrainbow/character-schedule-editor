import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exportProject } from './navigation.js';

const example = new URL('../../docs/recipes/examples/life-simulation.yaml', import.meta.url);
async function upload(page, name, content) {
  const chooser = page.waitForEvent('filechooser');
  if (await page.locator('.welcome').isVisible()) await page.locator('.welcome').getByRole('button', { name: 'Import project', exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Project menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Import project', exact: true }).click();
  }
  await (await chooser).setFiles({ name, mimeType: name.endsWith('.json') ? 'application/json' : 'application/yaml', buffer: Buffer.from(content) });
}
async function saved(page) {
  const downloaded = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
}

test('startup and system import share JSON/YAML selection; YAML rebuilds and JSON preserves IDs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.welcome')).toContainText('YAML blueprint');
  await expect(page.locator('.app-header input[type=file]').first()).toHaveAttribute('accept', /\.yaml.*\.yml/);
  const yaml = await readFile(example, 'utf8');
  await upload(page, 'life.YML', yaml);
  await expect(page.getByRole('heading', { name: '生活與薪資測試', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Project rebuilt');
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('工作日');
  const first = await saved(page);
  await upload(page, 'life.yaml', yaml);
  await expect(page.getByRole('status')).toContainText('Project rebuilt');
  const second = await saved(page);
  expect(Object.keys(second.operand_nodes)).not.toEqual(Object.keys(first.operand_nodes));
  await upload(page, 'project.json', JSON.stringify(first));
  await expect(page.getByRole('status')).toHaveText(/JSON imported successfully/);
  expect(Object.keys((await saved(page)).operand_nodes)).toEqual(Object.keys(first.operand_nodes));
});

test('invalid YAML and cancelled replacement retain the project; Traditional Chinese explains the result', async ({ page }) => {
  await page.goto('/');
  const yaml = await readFile(example, 'utf8'); await upload(page, 'life.yaml', yaml);
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('工作日');
  await upload(page, 'invalid.yaml', 'expressions: {bad: {type: number, value: vars.missing}}');
  await expect(page.getByRole('status')).toContainText('Import rejected');
  await expect(page.locator('.import-issues')).toContainText('Unknown vars symbol');
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('工作日');
  page.once('dialog', (dialog) => dialog.dismiss());
  await upload(page, 'replacement.yaml', 'project: {name: Replacement}');
  await expect(page.getByRole('heading', { name: '生活與薪資測試', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'life.yaml', mimeType: 'application/yaml', buffer: Buffer.from(yaml) });
  await expect(page.getByRole('status')).toContainText('YAML 藍圖匯入成功');
});
