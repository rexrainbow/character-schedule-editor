import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exportProject, navigate } from './navigation.js';

const fixture = new URL('../../docs/recipes/examples/life-simulation.yaml', import.meta.url);
async function save(page) {
  const event = page.waitForEvent('download'); await exportProject(page);
  return JSON.parse(await readFile(await (await event).path(), 'utf8'));
}
test('GUI identity row edits persistent names before optional labels and preserves fallback on JSON reload', async ({ page }) => {
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles(fixture.pathname.replace(/^\/(.:)/, '$1'));
  const label = page.getByRole('textbox', { name: 'Day name', exact: true });
  await expect(label).toHaveValue('工作日');
  const name = page.getByRole('textbox', { name: 'Name (symbol)', exact: true });
  await expect(name).toHaveValue('working');
  expect((await name.boundingBox()).x).toBeLessThan((await label.boundingBox()).x);
  await name.fill('office_day'); await label.fill('');
  await expect(label).toHaveValue(''); await expect(label).toHaveAttribute('placeholder', 'office_day');
  await expect(page.locator('.sidebar .slot-item.selected')).toContainText('office_day');
  let saved = await save(page);
  const [id, day] = Object.entries(saved.day_schedules).find(([, item]) => item.name === 'office_day');
  expect(day.display_name).toBe(''); expect(day.engine_key).toBeUndefined();
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(name).toHaveValue('office_day'); await expect(label).toHaveValue('');
  saved = await save(page); expect(saved.day_schedules[id].name).toBe('office_day');
});

test('variable, macro and parameter symbol controls are available and invalid names block export', async ({ page }) => {
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles(fixture.pathname.replace(/^\/(.:)/, '$1'));
  await navigate(page, 'operands', 'en', 'user');
  const name = page.getByRole('textbox', { name: 'Name (symbol)', exact: true });
  await expect(name).toHaveValue('stamina');
  await name.fill('invalid.name'); await expect(name).toHaveAttribute('aria-invalid', 'true');
  await exportProject(page); await expect(page.getByRole('status')).toContainText('Fix');
  await name.fill('energy');
  const saved = await save(page); expect(Object.values(saved.operand_nodes).some((node) => node.name === 'energy')).toBe(true);
  await navigate(page, 'taskMacros');
  await expect(page.getByRole('textbox', { name: 'Name (symbol)', exact: true })).toHaveValue('work');
});

test('built-in task and fixed parameter names can be edited without engine_key fields', async ({ page }) => {
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles(fixture.pathname.replace(/^\/(.:)/, '$1'));
  await navigate(page, 'tasks');
  await page.getByRole('textbox', { name: 'Name (symbol)', exact: true }).first().fill('assign_state');
  await page.locator('.parameter-row').first().getByRole('textbox', { name: 'Name (symbol)', exact: true }).fill('destination');
  const saved = await save(page);
  expect(saved.builtin_tasks.set_variable.name).toBe('assign_state');
  expect(saved.builtin_tasks.set_variable.parameters.target.name).toBe('destination');
  expect(JSON.stringify(saved)).not.toContain('engine_key');
});
