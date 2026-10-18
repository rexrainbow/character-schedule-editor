import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { flowControlFixture } from '../flowControlFixture.js';
import { compileProject } from '../../src/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';
import { translator } from '../../src/i18n.js';
async function load(page, draft) {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'takeover.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
}
async function runDay(page, locale = 'en') {
  const t = translator(locale); await switchMode(page, 'simulation', locale);
  await page.getByRole('combobox', { name: t('simulationTarget'), exact: true }).selectOption('day');
  await page.getByRole('button', { name: t('simulationRun'), exact: true }).click();
}
async function download(page, action) { const pending = page.waitForEvent('download'); await action(); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }

test('one fixed takeover definition replaces cancellation commands, permits metadata edits and exports typed contracts', async ({ page }) => {
  const { draft, control } = flowControlFixture(); await load(page, draft); await navigate(page, 'tasks');
  const flow = page.locator('.task-category').filter({ has: page.getByRole('heading', { name: 'Flow control', exact: true }) });
  await expect(flow.locator('button')).toHaveCount(1);
  await flow.getByRole('button', { name: 'Schedule takeover', exact: true }).click();
  await expect(page.locator('.parameter-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Claim schedule');
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('engine.takeover');
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).nth(1).fill('Window');
  await navigate(page, 'slots'); await page.locator('.sidebar').getByRole('button', { name: /Override activity/ }).click();
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:schedule_takeover');
  await expect(page.getByRole('combobox', { name: 'Window', exact: true })).toHaveValue('day');
  await page.getByRole('combobox', { name: 'Window', exact: true }).selectOption('slot');
  await page.getByRole('combobox', { name: 'Takeover target', exact: true }).selectOption('main');
  const project = await download(page, () => exportProject(page));
  expect(project.slots[control.id].branches[0].task.scope).toBe('slot'); expect(project.builtin_tasks.schedule_takeover.display_name).toBe('Claim schedule');
  expect(Object.keys(project.builtin_tasks).some((key) => key.startsWith('cancel_'))).toBe(false);
  const runtime = await download(page, () => page.getByRole('button', { name: 'Export runtime data', exact: true }).click());
  expect(runtime.slots[control.id].branches[0].task).toMatchObject({ task_key: 'engine.takeover', flow_control: 'takeover', scope: 'slot', target: 'main' });
  expect(runtime.environment_requirements.tasks.find((item) => item.engine_key === 'engine.takeover').parameters).toHaveLength(3);
});

for (const [scope, target, expected] of [['slot', 'main', 3], ['slot', 'lower_priority', 12], ['day', 'main', 10], ['day', 'lower_priority', 40]]) test(`successful ${scope}/${target} takeover displays the selected scope and outcomes`, async ({ page }) => {
  const { draft } = flowControlFixture({ scope, target }); await load(page, draft); await runDay(page);
  await expect(page.locator('.simulation-cancel-reason')).toHaveCount(expected);
  await expect(page.locator('.simulation-results')).toContainText('Takeover succeeded; selected sources cancelled.');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeEnabled();
});

test('condition editor can choose a false Boolean; failed slot takeover resumes next slot and overview explains both paths', async ({ page }) => {
  const { draft } = flowControlFixture(); await load(page, draft); await navigate(page, 'taskMacros');
  await page.getByRole('combobox', { name: 'Task', exact: true }).first().selectOption('builtin:schedule_takeover');
  await page.getByRole('button', { name: translator('en')('operandA'), exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('tab', { name: 'Constant', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Constant value', exact: true }).selectOption('false');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('combobox', { name: 'Takeover scope', exact: true }).selectOption('slot');
  await navigate(page, 'slots'); await page.locator('.sidebar').getByRole('button', { name: /Override activity/ }).click();
  await page.getByRole('button', { name: 'Logic overview', exact: true }).click();
  await page.getByRole('combobox', { name: 'Expansion depth', exact: true }).selectOption('all');
  await expect(page.locator('.logic-overview pre')).toContainText('IF (false == true)');
  await expect(page.locator('.logic-overview pre')).toContainText('Withdraw: This slot');
  await runDay(page); await expect(page.locator('.simulation-cancel-reason')).toHaveCount(2);
  await expect(page.locator('.simulation-results')).toContainText('Takeover failed; this source');
});

test('Chinese mobile takeover controls remain readable and failed day takeover cancels through day end', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft } = flowControlFixture({ scope: 'day', condition: { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: false }, operand_b: { type: 'constant', value: true } } });
  await load(page, draft); await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW');
  const t = translator('zh-TW'); await navigate(page, 'taskMacros', 'zh-TW');
  await expect(page.getByRole('combobox', { name: t('takeoverScope'), exact: true })).toHaveValue('day');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await runDay(page, 'zh-TW'); await expect(page.locator('.simulation-cancel-reason')).toHaveCount(9);
  await expect(page.locator('.simulation-results')).toContainText(t('takeoverFailed'));
});
