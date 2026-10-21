import { exportRuntime } from './navigation.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { flowControlFixture } from '../flowControlFixture.js';
import { compileProject } from '../../src/core/model.js';
import { createRelease } from '../../src/core/builtinTaskModel.js';
import { navigate, switchMode, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
async function load(page, draft) {
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'release.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
}
async function runDay(page, locale = 'en') {
  const t = translator(locale); await switchMode(page, 'simulation', locale);
  await page.getByRole('combobox', { name: t('simulationTarget'), exact: true }).selectOption('day');
  await page.getByRole('button', { name: t('simulationRun'), exact: true }).click();
}
async function download(page, action) { const pending = page.waitForEvent('download'); await action(); return JSON.parse(await readFile(await (await pending).path(), 'utf8')); }
async function releaseDialog(page, locale = 'en') {
  const t = translator(locale); await navigate(page, 'days', locale);
  await page.locator('.sidebar').getByRole('button', { name: 'High', exact: true }).click();
  if (await page.locator('.event-visibility').getAttribute('aria-expanded') !== 'true') await page.locator('.event-visibility').click();
  await page.getByRole('button', { name: t('releaseSlotFor', { count: 1 }), exact: true }).click(); return page.getByRole('dialog');
}
test('container selects one of three modes and validates interruption priority without takeover controls', async ({ page }) => {
  const { draft, sequence } = flowControlFixture(); await load(page, draft); await navigate(page, 'sequences');
  await page.getByRole('button', { name: 'Manage events (5)', exact: true }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.event-takeovers')).toHaveCount(0);
  const modes = dialog.getByRole('combobox', { name: 'Execution mode', exact: true }); await expect(modes.locator('option')).toHaveCount(3);
  await modes.selectOption('interrupt_main'); await dialog.getByRole('spinbutton', { name: 'Priority', exact: true }).fill('-1');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Priority', exact: true }).fill('10'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const data = await download(page, () => exportProject(page)); expect(data.week_sequences[sequence.id].event_groups[0].execution_mode).toBe('interrupt_main');
  await navigate(page, 'slots'); await expect(page.locator('option[value="builtin:release_slot"], option[value="builtin:schedule_takeover"]')).toHaveCount(0);
});
test('dedicated day slot adds unconditional release, exports one-parameter runtime control and simulates partial interruption', async ({ page }) => {
  const { draft, days } = flowControlFixture(); await load(page, draft); const dialog = await releaseDialog(page);
  await expect(dialog.getByRole('checkbox', { name: 'Use a release condition', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.day-slot-release.configured')).toHaveCount(1);
  const data = await download(page, () => exportProject(page)); expect(data.day_schedules[days.High.id].slot_releases).toEqual([createRelease(), null, null]);
  const runtime = await download(page, () => exportRuntime(page));
  expect(runtime.days[days.High.id].slot_releases[0]).toEqual({ task_key: 'control_release', flow_control: 'release_slot', condition: null });
  expect(runtime.environment_requirements.tasks.find((t) => t.name === 'control_release').parameters).toHaveLength(1);
  await page.screenshot({ path: 'test-results/day-slot-release-desktop.png' });
  await runDay(page); await expect(page.locator('.simulation-cancel-reason')).toHaveCount(26);
  await expect(page.locator('.simulation-results')).toContainText('Slot released; skip this event');
});
test('release conditions use the shared Boolean editor and false keeps interruption active', async ({ page }) => {
  const { draft, days } = flowControlFixture(); days.High.slotReleases = [{ ...createRelease(), condition: { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: true }, operand_b: { type: 'constant', value: true } } }, null, null];
  await load(page, draft); const dialog = await releaseDialog(page);
  await dialog.getByRole('button', { name: translator('en')('operandA'), exact: true }).click();
  const operand = page.getByRole('dialog').last(); await operand.getByRole('tab', { name: 'Constant', exact: true }).click();
  await operand.getByRole('combobox', { name: 'Constant value', exact: true }).selectOption('false'); await operand.getByRole('button', { name: 'Apply', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await runDay(page); await expect(page.locator('.simulation-cancel-reason')).toHaveCount(36);
  await expect(page.locator('.simulation-results')).toContainText('Release condition did not match');
});
test('Chinese mobile release dialog preserves drafts on cancel and removing a rule shrinks the row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const { draft, days } = flowControlFixture(); days.High.slotReleases = [createRelease(), null, null];
  await load(page, draft); await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW'); const t = translator('zh-TW');
  let dialog = await releaseDialog(page, 'zh-TW'); await dialog.getByRole('checkbox', { name: t('releaseConditional'), exact: true }).check();
  await expect(dialog.getByRole('button', { name: t('apply'), exact: true })).toBeDisabled();
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/day-slot-release-mobile.png' });
  await dialog.getByRole('button', { name: t('cancel'), exact: true }).click();
  await expect(page.locator('.day-slot-release.configured')).toHaveCount(1);
  const tall = await page.locator('.day-time-block').first().evaluate((e) => e.offsetHeight);
  await page.getByRole('button', { name: t('releaseSlotFor', { count: 1 }), exact: true }).click(); dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: t('removeSlotRelease'), exact: true }).click();
  await expect(page.locator('.day-slot-release.configured')).toHaveCount(0);
  expect(await page.locator('.day-time-block').first().evaluate((e) => e.offsetHeight)).toBeLessThan(tall);
});
