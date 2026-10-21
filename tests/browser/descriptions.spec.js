import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { exportProject, navigate } from './navigation.js';

const fixture = fileURLToPath(new URL('../../docs/recipes/examples/life-simulation.yaml', import.meta.url));
async function load(page) { await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles(fixture); }
async function save(page) { const downloaded = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await downloaded).path(), 'utf8')); }

test('object and step explanations persist and the summary toggle hides only comments', async ({ page }) => {
  await load(page);
  await page.getByRole('textbox', { name: 'Description (optional)', exact: true }).fill('Working-day intent.');
  await navigate(page, 'taskMacros');
  const object = page.locator('.task-definition-editor > .description-field textarea');
  await object.fill('Work intent.\nSpend stamina and count attendance.');
  const firstStep = page.locator('.task-step').first();
  await firstStep.getByRole('textbox', { name: 'Description (optional)' }).fill('Spend stamina first.');
  await page.getByRole('button', { name: 'Logic overview', exact: true }).click();
  const text = page.locator('.logic-overview pre');
  expect((await page.getByRole('checkbox', { name: 'Show descriptions' }).boundingBox()).width).toBeLessThan(30);
  await expect(text).toContainText('// Work intent.'); await expect(text).toContainText('// Spend stamina first.');
  await page.getByRole('checkbox', { name: 'Show descriptions' }).uncheck();
  await expect(text).not.toContainText('Spend stamina first.'); await expect(text).toContainText('體力');
  await page.getByRole('checkbox', { name: 'Show descriptions' }).check();
  const data = await save(page);
  expect(Object.values(data.day_schedules).find((item) => item.name === 'working').description).toBe('Working-day intent.');
  const macro = Object.values(data.task_macros).find((item) => item.name === 'work');
  expect(macro.description).toBe('Work intent.\nSpend stamina and count attendance.');
  expect(macro.steps[0].description).toBe('Spend stamina first.');
  await page.screenshot({ path: 'artifacts/descriptions-desktop.png', fullPage: true });
});

test('computed branch explanations remain editable through apply and project reload', async ({ page }) => {
  await load(page); await navigate(page, 'expressions');
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  const modal = page.getByRole('dialog');
  const descriptions = modal.getByRole('textbox', { name: 'Description (optional)' });
  await expect(descriptions).toHaveCount(4);
  await expect(descriptions.first()).toHaveValue('完成 10 班，全勤加發獎金 20。');
  await descriptions.first().fill('Full attendance bonus.\nTen shifts.');
  await expect(modal.locator('.expression-preview pre')).toContainText('// Ten shifts.');
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = await save(page);
  const computed = Object.values(data.expression_macros).find((item) => item.name === 'weekly_pay');
  expect(computed.definition.branches[0].description).toBe('Full attendance bonus.\nTen shifts.');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await navigate(page, 'expressions');
  await page.getByRole('button', { name: 'Edit definition', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Description (optional)' }).first()).toHaveValue('Full attendance bonus.\nTen shifts.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/descriptions-mobile.png', fullPage: true });
});
