import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
import { createScheduleEvent } from '../../src/core/scheduledEvents.js';

async function load(page, mode = 'interrupt_main', booking = false) {
  const f = sequenceEventsFixture(), { draft, eventDay, activity, sequence } = f;
  draft.project.settings.slots_per_day = 4;
  for (const day of draft.days) day.slotIds = Array(4).fill(null);
  const day = draft.days.find((day) => day.id === eventDay.id);
  day.slotIds = [null, null, activity.id, activity.id];
  const condition = { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: true }, operand_b: { type: 'constant', value: true } };
  day.slotReleases = [null, condition, condition, null].map((condition) => ({ builtin: 'release_slot', condition }));
  if (booking) activity.branches = [{ condition: null, task: { ...createScheduleEvent(), day_schedule_id: day.id, execution_mode: mode } }];
  draft.weeks[0].days.mon = day.id;
  sequence.eventGroups = [{ ...rule(sequence, day.id, 0, 0, 0), display_name: 'Release examples', executionMode: mode }];
  const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'release-preview.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await navigate(page, 'sequences');
  return compiled.data;
}

for (const mobile of [false, true]) test(`readonly release states integrate with their slot without changing data (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const before = await load(page);
  if (mobile) await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  const t = translator(mobile ? 'zh-TW' : 'en');
  await page.locator('.sequence-event-icon').first().focus();
  const preview = page.getByRole('dialog', { name: t('dayPreview'), exact: true });
  await expect(preview.locator('.slot-release-preview')).toHaveCount(4);
  await expect(preview.locator('.release-only')).toHaveCount(2);
  await expect(preview.locator('.has-assignment')).toHaveCount(2);
  await expect(preview.locator('.release-unreachable-warning')).toHaveText(t('releaseAssignmentUnreachable'));
  await expect(preview.locator('.unreachable .release-assignment')).toContainText('Inspection task');
  await expect(preview.locator('.release-state').nth(1)).toContainText(t('releaseConditionalPreview'));
  await expect(preview.locator('.release-state').nth(1)).toContainText('true == true');
  await page.keyboard.press('Escape');
  await page.locator('.sequence-event-icon').first().click();
  await page.getByRole('dialog').getByRole('button', { name: t('viewEventCandidates'), exact: true }).click();
  const viewer = page.getByRole('dialog', { name: t('eventCandidatesViewer'), exact: true });
  const rows = viewer.locator('.event-candidate-rows');
  await expect(rows.locator('.release-only')).toHaveCount(2);
  await rows.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(viewer.locator('.release-unreachable-warning')).toBeVisible();
  const card = viewer.locator('.has-assignment').last();
  const assigned = await card.locator('.release-assignment').boundingBox(), release = await card.locator('.release-state').boundingBox();
  if (mobile) expect(release.y).toBeGreaterThanOrEqual(assigned.y + assigned.height);
  else expect(release.x).toBeGreaterThan(assigned.x);
  await page.screenshot({ path: `test-results/slot-release-preview-${mobile ? 'mobile' : 'desktop'}.png` });
  await viewer.getByRole('button', { name: t('returnEventManager'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('cancel'), exact: true }).click();
  const pending = page.waitForEvent('download'); await exportProject(page, mobile ? 'zh-TW' : 'en');
  expect(JSON.parse(await readFile(await (await pending).path(), 'utf8'))).toEqual(before);
});

test('overlay events and week cells mark release inactive without unreachable warnings', async ({ page }) => {
  await load(page, 'overlay');
  await page.locator('.sequence-event-icon').first().focus();
  const preview = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await expect(preview.locator('.slot-release-preview.inactive')).toHaveCount(4);
  await expect(preview.locator('.release-unreachable-warning')).toHaveCount(0);
  await expect(preview).toContainText('Inactive in this context');
  await page.keyboard.press('Escape'); await navigate(page, 'weeks');
  const cell = page.getByRole('button', { name: 'Monday / Slot 4', exact: true });
  await expect(cell.locator('.slot-release-preview.inactive')).toBeVisible();
  await expect(cell.locator('.release-unreachable-warning')).toHaveCount(0);
});

test('reservation source viewer uses the current task execution mode for release warnings', async ({ page }) => {
  await load(page, 'interrupt_main', true); await navigate(page, 'slots');
  await page.getByRole('button', { name: 'View candidate day schedules', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Event day schedule viewer', exact: true });
  await viewer.locator('.event-candidate-rows').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(viewer.locator('.release-unreachable-warning')).toBeVisible();
  await viewer.getByRole('button', { name: 'Back to schedule event', exact: true }).click();
  await page.getByRole('combobox', { name: 'Execution mode', exact: true }).selectOption('overlay');
  await page.getByRole('button', { name: 'View candidate day schedules', exact: true }).click();
  await expect(viewer.locator('.slot-release-preview.inactive')).toHaveCount(4);
  await expect(viewer.locator('.release-unreachable-warning')).toHaveCount(0);
});
