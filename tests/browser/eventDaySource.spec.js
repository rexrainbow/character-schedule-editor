import { showAllDayPurposes } from './dayOptions.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';

function fixture(mode = 'fixed') {
  const f = sequenceEventsFixture();
  const group = { ...rule(f.sequence, f.eventDay.id), kind: 'probability', display_name: 'Cold', probability_percent: 10, cooldown_days: 7, sourceMode: mode, dayCandidates: [{ dayId: f.eventDay.id, weight: 1 }, { dayId: f.main.id, weight: 3 }] };
  f.sequence.eventGroups = [group]; return { ...f, group };
}
async function load(page, draft) {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'sources.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await navigate(page, 'sequences');
}
async function save(page) { const download = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await download).path(), 'utf8')); }
async function checkWeightAlignment(dialog) {
  const rects = await dialog.locator('.event-candidate-weight label').first().evaluate((label) => {
    const range = document.createRange(); range.selectNodeContents(label.firstChild);
    const text = range.getBoundingClientRect(), input = label.querySelector('input').getBoundingClientRect();
    return { text: (text.top + text.bottom) / 2, input: (input.top + input.bottom) / 2 };
  });
  expect(Math.abs(rects.text - rects.input)).toBeLessThan(3);
}

test('candidate dialog preserves selections through searches and cancellation; modes preserve weights and order', async ({ page }) => {
  const { draft, sequence, main, eventDay } = fixture(); await load(page, draft);
  await page.getByRole('button', { name: 'Manage events (1)', exact: true }).click();
  const dialog = page.getByRole('dialog'), mode = dialog.getByRole('combobox', { name: 'Day schedule source', exact: true });
  await expect(dialog.getByRole('button', { name: 'Day schedule source', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.locator('.event-day-source-toggle')).toContainText('Inspection');
  await dialog.getByRole('button', { name: 'Day schedule source', exact: true }).click();
  await mode.selectOption('random');
  await expect(dialog.locator('.event-day-candidate')).toHaveCount(1);
  await dialog.getByRole('combobox', { name: 'Candidate day schedules', exact: true }).click();
  await showAllDayPurposes(page);
  await dialog.getByRole('option', { name: 'Workday', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search event day schedules', exact: true }).fill('Inspection');
  await expect(dialog.getByRole('option', { name: 'Inspection', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.locator('.event-day-candidate')).toHaveCount(1);
  await dialog.getByRole('combobox', { name: 'Candidate day schedules', exact: true }).click();
  await showAllDayPurposes(page);
  await dialog.getByRole('option', { name: 'Workday', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog.locator('.event-day-candidate')).toHaveCount(2);
  await dialog.getByRole('spinbutton', { name: 'Weight: Workday', exact: true }).fill('3');
  await checkWeightAlignment(dialog);
  await expect(dialog.locator('.event-day-candidate output')).toHaveText(['25.0%', '75.0%']);
  const toggle = dialog.getByRole('button', { name: 'Day schedule source', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toContainText('2 day schedules');
  await toggle.click();
  await dialog.getByRole('spinbutton', { name: 'Weight: Workday', exact: true }).fill('0');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Weight: Workday', exact: true }).fill('3');
  await page.screenshot({ path: 'test-results/event-source-random.png' });
  await mode.selectOption('sequential');
  await dialog.getByRole('button', { name: 'Move up: Workday', exact: true }).click();
  await expect(dialog.locator('.event-day-candidate strong')).toHaveText(['Workday', 'Inspection']);
  await expect(dialog.getByRole('button', { name: 'Move up: Workday', exact: true })).toBeDisabled();
  await mode.selectOption('random');
  await expect(dialog.getByRole('spinbutton', { name: 'Weight: Workday', exact: true })).toHaveValue('3');
  await mode.selectOption('fixed');
  await expect(dialog.getByRole('combobox', { name: 'Event day schedule', exact: true })).toContainText('Inspection');
  await mode.selectOption('sequential');
  await expect(dialog.locator('.event-day-candidate strong')).toHaveText(['Workday', 'Inspection']);
  await dialog.getByRole('combobox', { name: 'Event type', exact: true }).selectOption('periodic');
  await expect(dialog.locator('.event-day-candidate strong')).toHaveText(['Workday', 'Inspection']);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = (await save(page)).week_sequences[sequence.id].event_groups[0];
  expect(data.day_source).toEqual({ mode: 'sequential', candidates: [{ day_schedule_id: main.id }, { day_schedule_id: eventDay.id }] });
  expect(data.day_schedule_id).toBeUndefined();
});

test('multi-day preview shows the first name and more without day contents', async ({ page }) => {
  const { draft } = fixture('random'); await load(page, draft);
  await page.getByRole('button', { name: 'Edit event group: Cold', exact: true }).first().hover();
  const preview = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await expect(preview).toContainText('Inspection ...and more');
  await expect(preview.locator('.day-preview-heading')).toHaveText('Cold');
  await expect(preview).not.toContainText('Workday');
  await expect(preview.locator('.day-preview-slots')).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'Open day schedule', exact: true })).toHaveCount(0);
});

for (const mode of ['fixed', 'random', 'sequential']) test(`single day preview separates event identity from day contents (${mode})`, async ({ page }) => {
  const { draft, group, eventDay } = fixture(mode);
  if (mode === 'random') await page.setViewportSize({ width: 390, height: 844 });
  group.dayCandidates = [{ dayId: eventDay.id, weight: 1 }];
  group.icon = 'tabler:heart'; group.executionMode = 'interrupt_main';
  await load(page, draft);
  await page.getByRole('button', { name: 'Edit event group: Cold', exact: true }).first().hover();
  const preview = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await expect(preview.locator('.day-preview-heading')).toHaveText('Cold');
  await expect(preview.locator('.day-preview-heading .slot-icon')).toHaveAttribute('data-icon', 'tabler:heart');
  await expect(preview.locator('.event-preview-summary')).not.toContainText('Cold');
  await expect(preview).toContainText('Interrupt main schedule');
  await expect(preview.locator('.event-preview-day')).toContainText('Inspection');
  await expect(preview.locator('.day-preview-slots')).toContainText('Inspection task');
  const order = await preview.evaluate((panel) => [...panel.children].map((child) => child.className));
  expect(order.indexOf('event-preview-day entity-name')).toBeGreaterThan(order.indexOf('field-hint event-preview-summary'));
  await preview.hover();
  if (mode === 'random') await page.screenshot({ path: 'test-results/event-source-single-preview.png' });
  await preview.locator('.day-preview-source-open').click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Inspection');
});

test('Chinese mobile candidate editing supports ordering, empty-list errors and cancel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft, sequence } = fixture('random'); await load(page, draft);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.getByRole('button', { name: '事件管理（1）', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '日行程來源', exact: true }).click();
  await checkWeightAlignment(dialog);
  await dialog.locator('.event-candidate-weight').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/event-source-weights-mobile.png' });
  await dialog.getByRole('combobox', { name: '日行程來源', exact: true }).selectOption('sequential');
  await dialog.getByRole('button', { name: '上移: Workday', exact: true }).click();
  await expect(dialog.locator('.event-day-candidate strong')).toHaveText(['Workday', 'Inspection']);
  await dialog.locator('.event-day-source').scrollIntoViewIfNeeded();
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/event-source-editor-mobile.png' });
  await dialog.getByRole('button', { name: '移除候選: Workday', exact: true }).click();
  await dialog.getByRole('button', { name: '移除候選: Inspection', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '套用', exact: true })).toBeDisabled();
  await expect(dialog.locator('.event-source-error')).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  const group = (await save(page)).week_sequences[sequence.id].event_groups[0];
  expect(group.day_source.mode).toBe('random'); expect(group.day_source.candidates).toHaveLength(2);
});

test('removing a previously selected simulation candidate falls back to a valid day', async ({ page }) => {
  const { draft, main } = fixture('random'); await load(page, draft); await switchMode(page, 'simulation');
  await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('day');
  await page.getByRole('checkbox', { name: 'Occurrence: Cold', exact: true }).check();
  await page.getByRole('combobox', { name: 'Selected day schedule: Cold', exact: true }).selectOption(main.id);
  await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Manage events (1)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Day schedule source', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove candidate: Workday', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await switchMode(page, 'simulation');
  await expect(page.getByRole('combobox', { name: 'Selected day schedule: Cold', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-trace').first()).toContainText('Inspection task');
});

for (const mobile of [false, true]) test(`manual occurrence and day selection drive simulation (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const { draft, eventDay, main } = fixture('random'); await load(page, draft); await switchMode(page, 'simulation');
  await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('day');
  const occurs = page.getByRole('checkbox', { name: 'Occurrence: Cold', exact: true });
  const choice = page.getByRole('combobox', { name: 'Selected day schedule: Cold', exact: true });
  await expect(occurs).not.toBeChecked(); await expect(choice).toBeDisabled();
  await occurs.check(); await choice.selectOption(main.id);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-trace').first()).toContainText('Selected day schedule → Workday');
  await expect(page.locator('.simulation-trace').first()).not.toContainText('Inspection task');
  if (mobile) await page.getByRole('tab', { name: 'Inputs', exact: true }).click();
  await choice.selectOption(eventDay.id);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-trace').first()).toContainText('Inspection task');
  if (mobile) await page.getByRole('tab', { name: 'Inputs', exact: true }).click();
  await occurs.uncheck();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-trace').first()).not.toContainText('Inspection task');
  if (mobile) await page.getByRole('tab', { name: 'Inputs', exact: true }).click();
  await expect(choice).toHaveValue(eventDay.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/event-source-simulation-${mobile ? 'mobile' : 'desktop'}.png` });
  expect(JSON.stringify(await save(page))).not.toContain('eventDayChoices');
});
