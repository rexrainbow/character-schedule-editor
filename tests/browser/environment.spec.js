import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import example from '../../src/state-example.json' with { type: 'json' };
import { projectToDraft } from '../../src/model.js';
import { compileEnvironment, createEnvironmentInfo } from '../../src/environmentModel.js';
import { exportProject, switchMode } from './navigation.js';

function fixtures() {
  const project = structuredClone(example); project.environment = createEnvironmentInfo('Test engine');
  return { project, environment: compileEnvironment(projectToDraft(project)).data };
}
const file = (data) => ({ name: 'data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
async function savedProject(page) {
  const wait = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await wait).path(), 'utf8'));
}
async function exportEnvironment(page) {
  await page.getByRole('button', { name: 'Environment actions', exact: true }).click();
  const wait = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Export environment', exact: true }).click();
  const download = await wait; expect(download.suggestedFilename()).toBe('character-schedule-environment.json');
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

test('startup chooses project import or a new project with an optional environment', async ({ page }) => {
  const { environment } = fixtures();
  await page.goto('/'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.welcome').getByRole('button', { name: 'Import project', exact: true })).toBeVisible();
  await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill('New story');
  await dialog.locator('input[type=file]').setInputFiles(file(environment));
  await expect(dialog).toContainText('Test engine');
  await expect(dialog.getByRole('spinbutton', { name: 'Slots per day', exact: true })).toHaveValue('6');
  await expect(dialog.getByRole('spinbutton', { name: 'Slots per day', exact: true })).toHaveAttribute('readonly', '');
  await dialog.getByRole('button', { name: 'Remove environment', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Slots per day', exact: true })).toHaveValue('3');
  await dialog.locator('input[type=file]').setInputFiles(file(environment));
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New story', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Add day', exact: true }).click();
  await expect(page.locator('.day-cell')).toHaveCount(6);
  const saved = await savedProject(page);
  expect(saved.environment).toEqual(environment.environment); expect(saved.tasks).toEqual(environment.tasks);
  await switchMode(page, 'environment');
  expect(await exportEnvironment(page)).toEqual(environment);
  expect(await exportEnvironment(page)).toEqual(environment);
});

test('environment replacement previews incompatibilities and cancel preserves the whole project', async ({ page }) => {
  const { project, environment } = fixtures();
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles(file(project));
  await switchMode(page, 'environment');
  const input = page.locator('.app-header input[type=file]').nth(1);
  const incompatible = structuredClone(environment); incompatible.settings.slots_per_day = 3;
  await input.setInputFiles(file(incompatible));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Slots per day must match');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await savedProject(page)).toEqual(project);
  const replacement = structuredClone(environment); replacement.environment.display_name = 'Updated engine'; replacement.environment.version = '2';
  await input.setInputFiles(file(replacement));
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Environment replaced');
  const saved = await savedProject(page);
  expect(saved.environment.display_name).toBe('Updated engine'); expect(saved.slots).toEqual(project.slots);
  expect(saved.project.name).toBe(project.project.name);
});

test('environment settings persist a stable ID and slots lock once day schedules exist', async ({ page }) => {
  await page.goto('/'); await page.locator('.welcome').getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await switchMode(page, 'environment');
  await page.getByRole('button', { name: 'Environment actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Environment settings', exact: true }).click();
  const dialog = page.getByRole('dialog'), id = await dialog.getByRole('textbox', { name: 'Environment ID', exact: true }).inputValue();
  await expect(dialog.getByRole('textbox', { name: 'Environment ID', exact: true })).toHaveAttribute('readonly', '');
  await dialog.getByRole('textbox', { name: 'Environment name', exact: true }).fill('Custom engine');
  await dialog.getByRole('spinbutton', { name: 'Slots per day', exact: true }).fill('4');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const env = await exportEnvironment(page); expect(env.environment.id).toBe(id); expect(env.settings.slots_per_day).toBe(4);
  await switchMode(page, 'user');
  await page.locator('.sidebar').getByRole('button', { name: 'Add day', exact: true }).click();
  await switchMode(page, 'environment');
  await page.getByRole('button', { name: 'Environment actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Environment settings', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Slots per day', exact: true })).toHaveAttribute('readonly', '');
  await expect(dialog.getByRole('spinbutton', { name: 'Slots per day', exact: true })).toHaveValue('4');
});
