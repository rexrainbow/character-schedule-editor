import { test, expect } from '@playwright/test';
import { dayUsesFixture } from '../dayUsesFixture.js';
import { compileProject } from '../../src/core/model.js';
import { createScheduleEvent } from '../../src/core/scheduledEvents.js';
import { navigate } from './navigation.js';

async function load(page) {
  const f = dayUsesFixture();
  f.draft.slots.find((slot) => slot.id === f.activity.id).branches = [{ condition: null, task: { ...createScheduleEvent(), day_schedule_id: f.eventDay.id } }];
  const compiled = compileProject(f.draft); expect(compiled.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'purposes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  return f;
}
const purpose = (page) => page.getByRole('dialog').getByRole('combobox', { name: 'Filter by use', exact: true });

test('week and override selectors default to main but allow other purposes and retain hidden assignments', async ({ page }) => {
  await load(page); await navigate(page, 'weeks');
  await page.getByRole('button', { name: 'Choose day for Monday', exact: true }).click();
  await expect(purpose(page)).toHaveValue('main');
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Inspection', exact: true })).toHaveCount(0);
  await purpose(page).selectOption('overlay');
  await page.getByRole('dialog').getByRole('radio', { name: 'Inspection', exact: true }).click();
  await purpose(page).selectOption('main');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose day for Monday', exact: true }).locator('..')).toContainText('Inspection');
  await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await expect(purpose(page)).toHaveValue('main');
  await purpose(page).selectOption('');
  await page.getByRole('dialog').getByRole('radio', { name: 'Interrupt day', exact: true }).click();
  await purpose(page).selectOption('main');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Week 1 / Monday', exact: true }).click();
  await expect(purpose(page)).toHaveValue('main');
  await purpose(page).selectOption('');
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Interrupt day', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('event manager defaults follow mode while multi-selection survives filters and mode changes', async ({ page }) => {
  await load(page); await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Manage events (3)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add event group', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Event day schedule', exact: true }).click();
  await expect(purpose(page)).toHaveValue('overlay');
  await expect(dialog.getByRole('option', { name: 'Interrupt day', exact: true })).toHaveCount(0);
  await dialog.getByRole('option', { name: 'Inspection', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Execution mode', exact: true }).selectOption('interrupt_main');
  await expect(dialog.getByRole('combobox', { name: 'Event day schedule', exact: true })).toContainText('Inspection');
  await dialog.getByRole('combobox', { name: 'Event day schedule', exact: true }).click();
  await expect(purpose(page)).toHaveValue('interrupt');
  await expect(dialog.getByRole('option', { name: 'Interrupt day', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Day schedule source', exact: true }).selectOption('random');
  await dialog.getByRole('combobox', { name: 'Candidate day schedules', exact: true }).click();
  await dialog.getByRole('option', { name: 'Interrupt day', exact: true }).click();
  await purpose(page).selectOption('unclassified');
  await dialog.getByRole('option', { name: 'Unused day', exact: true }).click();
  await purpose(page).selectOption('interrupt');
  await expect(dialog.getByRole('option', { name: 'Interrupt day', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Weight: Interrupt day', exact: true })).toBeVisible();
  await expect(dialog.getByRole('spinbutton', { name: 'Weight: Unused day', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Execution mode', exact: true }).selectOption('overlay');
  await dialog.getByRole('combobox', { name: 'Candidate day schedules', exact: true }).click();
  await expect(purpose(page)).toHaveValue('overlay');
  await purpose(page).selectOption('');
  await expect(dialog.getByRole('option', { name: 'Unused day', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('option', { name: 'Unused day', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Weight: Unused day', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/day-purpose-event-source.png' });
});

test('schedule-event task uses purpose defaults without changing its selected source', async ({ page }) => {
  await load(page); await navigate(page, 'slots');
  await page.getByRole('button', { name: 'Day schedule source', exact: true }).click();
  await page.getByRole('combobox', { name: 'Event day schedule', exact: true }).click();
  await expect(purpose(page)).toHaveValue('overlay');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('combobox', { name: 'Execution mode', exact: true }).selectOption('interrupt_lower');
  await expect(page.getByRole('combobox', { name: 'Event day schedule', exact: true })).toContainText('Inspection');
  await page.getByRole('combobox', { name: 'Event day schedule', exact: true }).click();
  await expect(purpose(page)).toHaveValue('interrupt');
  await purpose(page).selectOption('');
  await expect(page.getByRole('dialog').getByRole('option', { name: 'Inspection', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('dialog').getByRole('option', { name: 'Workday', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Event day schedule', exact: true })).toContainText('Workday');
});
