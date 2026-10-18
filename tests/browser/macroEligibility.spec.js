import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { priorityMacroFixture } from '../priorityMacroFixture.js';
import { compileProject } from '../../src/model.js';
import { navigate, exportProject } from './navigation.js';
async function load(page) {
  const fixture = priorityMacroFixture(); await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'eligibility.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(fixture.draft).data)) });
  await navigate(page, 'taskMacros'); return fixture;
}
async function saved(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('eligibility defaults to collapsed, remains active while collapsed, can be cleared, and survives mode changes', async ({ page }) => {
  const { eligible, priority } = await load(page);
  await expect(page.getByRole('combobox', { name: 'Macro mode', exact: true }).locator('option')).toHaveCount(3);
  await expect(page.locator('.macro-eligibility summary')).toContainText('Engine.Counter');
  await expect(page.locator('.macro-eligibility')).not.toHaveAttribute('open', '');
  await page.locator('.macro-eligibility summary').click();
  await page.getByRole('button', { name: 'Clear eligibility condition', exact: true }).click();
  await expect(page.locator('.macro-eligibility summary')).toContainText('Unrestricted');
  let project = await saved(page); expect(project.task_macros[eligible.id].eligibility).toBeNull(); expect(project.task_macros[eligible.id].steps).toHaveLength(1);
  await page.getByRole('button', { name: 'Set eligibility condition', exact: true }).click();
  project = await saved(page); const guard = project.task_macros[eligible.id].eligibility;
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('combobox', { name: 'Macro mode', exact: true }).selectOption('priority');
  project = await saved(page); expect(project.task_macros[eligible.id].eligibility).toEqual(guard); expect(project.task_macros[eligible.id].mode).toBe('priority');
  expect(project.task_macros[eligible.id].parameters).toEqual(eligible.parameters);
  await page.locator('.operand-sidebar').getByRole('button', { name: /Choose activity/ }).click();
  await expect(page.locator('.macro-eligibility summary')).toContainText('Unrestricted');
  await expect(page.locator('.macro-eligibility')).not.toHaveAttribute('open', '');
  const select = page.getByRole('article', { name: 'Candidate 1', exact: true }).getByRole('combobox', { name: 'Task', exact: true });
  await expect(select.locator(`option[value="macro:${eligible.id}"]`)).toHaveCount(1);
  await expect(select.locator(`option[value="macro:${priority.id}"]`)).toHaveCount(0);
});

test('legacy conditional project imports become one-step eligible sequences and new exports omit the old mode', async ({ page }) => {
  const { draft, eligible } = priorityMacroFixture(), data = compileProject(draft).data;
  const { eligibility, steps, ...metadata } = data.task_macros[eligible.id];
  data.task_macros[eligible.id] = { ...metadata, mode: 'conditional', condition: eligibility, task: steps[0].task };
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await navigate(page, 'taskMacros');
  await expect(page.getByRole('combobox', { name: 'Macro mode', exact: true })).toHaveValue('sequence');
  await expect(page.locator('.task-step')).toHaveCount(1);
  await expect(page.locator('.macro-eligibility summary')).toContainText('Engine.Counter');
  const project = await saved(page); expect(project.task_macros[eligible.id].mode).toBe('sequence'); expect(project.task_macros[eligible.id].eligibility).toEqual(eligibility); expect(project.task_macros[eligible.id].condition).toBeUndefined();
});
