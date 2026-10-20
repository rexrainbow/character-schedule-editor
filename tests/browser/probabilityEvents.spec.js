import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, switchMode, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
function fixture() {
  const f = sequenceEventsFixture();
  f.group = { ...rule(f.sequence, f.eventDay.id), kind: 'probability', display_name: 'Cold', icon: 'tabler:heart', probability_percent: 10, cooldown_days: 7 };
  f.sequence.eventGroups = [f.group];
  f.draft.builtinTasks = { adjust_probability_event: { engine_key: 'events.adjust' } };
  return f;
}
async function load(page, draft) {
  await page.goto('/'); const result = compileProject(draft); expect(result.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'probability.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.data)) });
}
async function save(page) { const pending = page.waitForEvent('download'); await exportProject(page); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
test('event type drafts, independent icons and canonical output survive type switching', async ({ page }) => {
  const { draft, sequence, group } = fixture(); await load(page, draft); await navigate(page, 'sequences');
  await expect(page.locator('.sequence-event-icon').first().locator('.slot-icon')).toHaveAttribute('data-icon', 'tabler:heart');
  await expect(page.locator('.sequence-event-icon').first()).toHaveClass(/probability-event-candidate/);
  await page.getByRole('button', { name: 'Manage events (1)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: 'Probability (%)', exact: true }).fill('25');
  await dialog.getByRole('combobox', { name: 'Event type', exact: true }).selectOption('once');
  await expect(dialog.getByRole('combobox', { name: 'Count dates by', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Choose event end date', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Event type', exact: true }).selectOption('probability');
  await expect(dialog.getByRole('spinbutton', { name: 'Probability (%)', exact: true })).toHaveValue('25');
  await dialog.getByRole('spinbutton', { name: 'Cooldown (eligible days)', exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = await save(page), actual = data.week_sequences[sequence.id].event_groups[0];
  expect(actual).toMatchObject({ id: group.id, kind: 'probability', probability_percent: 25, cooldown_days: 3, icon: 'tabler:heart' });
  expect(actual.interval_days).toBeUndefined();
});
test('day simulation defaults to not occurring and uses manual selection without changing project data', async ({ page }) => {
  const { draft, group } = fixture(); await load(page, draft); await switchMode(page, 'simulation');
  await page.getByRole('combobox', { name: 'Simulation target', exact: true }).selectOption('day');
  const choice = page.getByRole('checkbox', { name: 'Occurrence: Cold', exact: true });
  await expect(choice).not.toBeChecked(); await expect(page.locator('.simulation-day-plan')).not.toContainText('Cold');
  await choice.check(); await expect(page.locator('.simulation-day-plan')).toContainText('Cold');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-trace').first()).toContainText('Cold: Occurs');
  await expect(page.locator('.simulation-trace').first()).toContainText('Inspection task');
  expect(JSON.stringify(await save(page))).not.toContain('probabilityChoices');
  await choice.uncheck(); await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.locator('.simulation-trace').first()).toContainText('Cold: Does not occur');
  await expect(page.locator('.simulation-trace').first()).not.toContainText('Inspection task');
});
test('event selector and property operands share one modal, and referenced probability events cannot change type', async ({ page }) => {
  const { draft, activity, group } = fixture();
  activity.branches = [{ condition: null, task: { builtin: 'adjust_probability_event', event: { type: 'current_event_reference' }, property: 'probability_percent', operation: 'increase', value: { type: 'constant', value: 5 } } }];
  await load(page, draft); await navigate(page, 'slots');
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  await page.getByRole('radio', { name: /Cold/ }).click(); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Value', exact: true }).click();
  await page.getByRole('tab', { name: 'Event properties', exact: true }).click();
  await page.getByRole('button', { name: 'Choose event', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('radio', { name: /Cold/ }).click(); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Event property', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Event property', exact: true }).selectOption('cooldown_remaining');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = await save(page); expect(data.slots[activity.id].branches[0].task.value).toMatchObject({ type: 'event_property', property: 'cooldown_remaining', event: { event_group_id: group.id } });
  await navigate(page, 'sequences'); await page.getByRole('button', { name: 'Manage events (1)', exact: true }).click();
  await page.getByRole('combobox', { name: 'Event type', exact: true }).selectOption('periodic');
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Choose a probability event.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const t = translator('zh-TW'); await page.getByRole('button', { name: t('manageEventGroups', { count: 1 }), exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: t('eventProperty_probability_percent'), exact: true })).toHaveValue('10');
  await page.screenshot({ path: 'test-results/probability-events-mobile.png' });
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
