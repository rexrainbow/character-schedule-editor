import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { builtinVariableFixture } from '../builtinVariableFixture.js';
import { addProgressDefinitions } from '../../src/progressEnvironment.js';
import { translator } from '../../src/i18n.js';
import { compileProject } from '../../src/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';

function fixture() {
  const base = sequenceEventsFixture(), vars = builtinVariableFixture();
  base.draft.operandNodes = addProgressDefinitions(vars.draft.operandNodes, 3, translator('en'));
  base.draft.builtinTasks = vars.draft.builtinTasks; base.draft.slots = vars.draft.slots;
  base.draft.days[0].slotIds[0] = vars.draft.slots[0].id;
  base.draft.days[1].dayStartId = vars.draft.slots[0].id;
  base.sequence.eventGroups = [{ ...rule(base.sequence, base.eventDay.id, 0, 20, 1, 5), display_name: 'Morning inspection' }];
  return base;
}
async function load(page, draft) {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'day-simulation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  return compiled.data;
}
async function dayMode(page) {
  await switchMode(page, 'simulation');
  await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('day');
}

test('day simulation shares state, repeats from inputs, applies explicitly, and keeps project intact', async ({ page }) => {
  const { draft } = fixture(), project = await load(page, draft); await dayMode(page);
  await expect(page.locator('.simulation-day-plan')).toContainText('Morning inspection');
  await expect(page.locator('.simulation-day-plan')).toContainText('Workday');
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('20');
  await expect(page.getByRole('spinbutton', { name: 'Schedule progress.Current slot', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('20 → 18');
  await expect(page.locator('.simulation-results')).toContainText('18 → 16');
  await page.screenshot({ path: 'test-results/day-simulation-desktop.png', fullPage: true });
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('20');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText('20 → 18');
  await page.getByRole('button', { name: 'Use resulting values', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('16');
  const pending = page.waitForEvent('download'); await exportProject(page);
  expect(JSON.parse(await readFile(await (await pending).path(), 'utf8'))).toEqual(project);
  await page.getByRole('button', { name: 'Reset inputs', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true })).toHaveValue('10');
});

test('calendar limits active dates and progress bindings can be changed or disabled', async ({ page }) => {
  const { draft, sequence } = fixture(); sequence.startWeekday = 'thu'; sequence.endWeekday = 'fri';
  await load(page, draft); await dayMode(page);
  await page.getByRole('button', { name: 'Week 1 / Thursday · Day 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Week 1 / Monday', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Week 3 / Sunday', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Week 2 / Tuesday', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Schedule progress.Current day', exact: true })).toHaveValue('6');
  await page.getByText('Schedule progress variables', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Current day', exact: true }).selectOption('');
  await expect(page.getByRole('spinbutton', { name: 'Schedule progress.Current day', exact: true })).toBeEnabled();
  const slotId = Object.entries(draft.operandNodes).find(([, node]) => node.engine_key === 'schedule.current_slot')[0];
  await page.getByRole('combobox', { name: 'Current day', exact: true }).selectOption(slotId);
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeDisabled();
  await expect(page.locator('.simulation-inputs .issues')).toContainText('distinct environment number variable');
});

test('sequence cell shortcut and source links open the selected definitions', async ({ page }) => {
  const { draft, sequence } = fixture(); await load(page, draft); await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Simulate week 1 / Monday', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Week sequence to simulate', exact: true })).toHaveValue(sequence.id);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.locator('.simulation-trace').getByRole('button', { name: /^Open day schedule: Morning inspection/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Inspection');
  await switchMode(page, 'simulation');
  await page.locator('.simulation-trace').getByRole('button', { name: /^Open slot schedule: Morning inspection/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Operation 1');
});

test('failed day stops with context and Chinese mobile layout remains usable', async ({ page }) => {
  const { draft } = fixture();
  const counter = Object.entries(draft.operandNodes).find(([, node]) => node.display_name === 'Counter')[0];
  draft.slots[0].branches[0].task.value = { type: 'expression', operator: '/', operand_a: { type: 'constant', value: 1 }, operand_b: { type: 'reference', reference_id: counter } };
  await load(page, draft); await dayMode(page);
  await page.getByRole('spinbutton', { name: 'Engine.Counter', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-results .issues')).toContainText('/operand_b');
  await expect(page.locator('.simulation-results .shared-warning')).toContainText('Morning inspection');
  await expect(page.getByRole('button', { name: 'Use resulting values', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(page.getByRole('combobox', { name: '模擬目標', exact: true })).toHaveValue('day');
  await page.getByRole('button', { name: '第 1 周 / 星期一 · Day 1', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '選擇模擬日期' })).toBeVisible();
  await page.getByRole('button', { name: '第 1 周 / 星期二', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.simulation-results')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/day-simulation-mobile.png', fullPage: true });
});
