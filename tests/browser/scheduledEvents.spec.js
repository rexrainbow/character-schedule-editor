import { showAllDayPurposes } from './dayOptions.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/core/model.js';
import { createScheduleEvent } from '../../src/core/scheduledEvents.js';
import { navigate, switchMode, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';

function fixture() {
  const f = sequenceEventsFixture();
  f.draft.weeks[0].days.mon = f.eventDay.id;
  f.draft.builtinTasks = { schedule_event: { engine_key: 'events.schedule' } };
  return f;
}
async function load(page, draft) {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'booking.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
async function run(page, locale = 'en') { await switchMode(page, 'simulation', locale); const t = translator(locale); await page.getByRole('combobox', { name: t('simulationTarget'), exact: true }).selectOption('day'); await page.getByRole('button', { name: t('simulationRun'), exact: true }).click(); }

test('flow-control task selects date and weighted day candidates, exports and produces future reservations', async ({ page }) => {
  const { draft, activity } = fixture(); await load(page, draft); await navigate(page, 'slots');
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Task', exact: true });
  await expect(select.locator('optgroup[label="Flow control"] option[value="builtin:schedule_event"]')).toHaveCount(1);
  await select.selectOption('builtin:schedule_event');
  await page.getByRole('textbox', { name: 'Reservation event name', exact: true }).fill('Date night');
  await page.getByRole('combobox', { name: 'Reservation date', exact: true }).selectOption('weeks_weekday');
  await page.getByRole('combobox', { name: 'Reservation weekday', exact: true }).selectOption('thu');
  await page.getByRole('combobox', { name: 'Day schedule source', exact: true }).selectOption('random');
  await expect(page.getByRole('combobox', { name: 'Day schedule source', exact: true }).locator('option')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Candidate day schedules', exact: true }).click();
  await showAllDayPurposes(page);
  await page.getByRole('dialog').getByRole('option', { name: 'Inspection', exact: true }).click();
  await page.getByRole('dialog').getByRole('option', { name: 'Workday', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Weight: Inspection', exact: true }).fill('3');
  await page.getByRole('combobox', { name: 'Execution mode', exact: true }).selectOption('interrupt_main');
  await page.getByRole('button', { name: 'View candidate day schedules', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Event day schedule viewer', exact: true });
  await expect(viewer.locator('.event-candidate-choice').first()).toContainText('75.0%');
  await viewer.getByRole('button', { name: 'Back to schedule event', exact: true }).click();
  await page.getByRole('button', { name: 'Logic overview', exact: true }).click();
  await expect(page.locator('.logic-overview pre')).toContainText('Date night');
  await expect(page.locator('.logic-overview pre')).toContainText('Inspection');
  const saved = await save(page), use = saved.slots[activity.id].branches[0].task;
  expect(use.builtin).toBe('schedule_event'); expect(use.date).toEqual({ mode: 'weeks_weekday', offset: { type: 'constant', value: 1 }, weekday: 'thu' });
  await navigate(page, 'days');
  await expect(page.locator('.day-use-group-interrupt')).toHaveCount(0); // Assigning a reservation never edits intended uses.
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export runtime data', exact: true }).click();
  const runtime = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(runtime.slots[activity.id].branches[0].task.flow_control).toBe('schedule_event');
  expect(runtime.slots[activity.id].branches[0].task.icon).toBeUndefined();
  await run(page);
  const reservations = page.locator('.simulation-reservations');
  await expect(reservations).toContainText('Date night'); await expect(reservations).toContainText('Week 2 / Thursday');
  await expect(reservations).toContainText('75.0%'); await expect(reservations).toContainText('Interrupt main schedule');
  await page.screenshot({ path: 'test-results/scheduled-event-simulation.png' });
  expect(await save(page)).toEqual(saved);
});

test('reservation definition has protected flow-control fields and candidate references block day deletion', async ({ page }) => {
  const { draft, activity, eventDay } = fixture();
  activity.branches = [{ condition: null, task: { ...createScheduleEvent(), day_schedule_id: eventDay.id } }];
  await load(page, draft); await navigate(page, 'tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Schedule event', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Book appointment');
  await page.getByRole('textbox', { name: 'Engine key', exact: true }).fill('events.book');
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).nth(2).fill('Delay');
  await navigate(page, 'slots'); await expect(page.getByRole('combobox', { name: 'Task', exact: true })).toHaveValue('builtin:schedule_event');
  await expect(page.getByRole('button', { name: 'Delay', exact: true })).toBeVisible();
  await navigate(page, 'days'); await page.locator('.sidebar').getByRole('button', { name: 'Inspection', exact: true }).first().click();
  await page.getByRole('button', { name: 'Day actions', exact: true }).click();
  page.once('dialog', async (message) => { expect(message.message()).toContain('schedule-event task'); await message.accept(); });
  await page.getByRole('menuitem', { name: 'Delete day', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Inspection');
});

test('Chinese mobile date expressions edit and single-slot simulation explains the missing date context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { draft, activity, eventDay } = fixture();
  activity.branches = [{ condition: null, task: { ...createScheduleEvent(), day_schedule_id: eventDay.id } }];
  await load(page, draft); await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const t = translator('zh-TW'); await navigate(page, 'slots', 'zh-TW');
  await page.getByRole('button', { name: t('scheduleField_offset'), exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('tab', { name: t('constant'), exact: true }).click();
  await dialog.getByRole('spinbutton', { name: t('constantValue'), exact: true }).fill('2');
  await dialog.getByRole('button', { name: t('apply'), exact: true }).click();
  await page.locator('.schedule-event-editor').screenshot({ path: 'test-results/scheduled-event-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await switchMode(page, 'simulation', 'zh-TW'); await page.getByRole('button', { name: t('simulationRun'), exact: true }).click();
  await expect(page.locator('.simulation-results')).toContainText(t('scheduleContextRequired'));
  await run(page, 'zh-TW'); await expect(page.locator('.simulation-reservations')).toContainText('星期三');
});
