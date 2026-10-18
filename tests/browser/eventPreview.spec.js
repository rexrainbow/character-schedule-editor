import { test, expect } from '@playwright/test';
import { sequenceEventsFixture, rule } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/model.js';
import { eventTooltip } from '../../src/sequenceEvents.js';
import { translator } from '../../src/i18n.js';
import { navigate } from './navigation.js';

async function load(page) {
  const fixture = sequenceEventsFixture(), { draft, sequence, eventDay } = fixture;
  sequence.eventGroups = [{ ...rule(sequence, eventDay.id, 0, 20, 7, 5), display_name: 'Supervisor visit' }];
  await page.goto('/'); const compiled = compileProject(draft); expect(compiled.errors).toEqual([]);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'preview.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compiled.data)) });
  await navigate(page, 'sequences'); return fixture;
}

test('event hover reuses day details, preserves event metadata and links directly to the referenced day', async ({ page }) => {
  const { draft, sequence } = await load(page);
  const icon = page.locator('.sequence-event-icon').first();
  await icon.hover();
  const panel = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.event-preview-summary')).toHaveText(eventTooltip(sequence.eventGroups[0], draft.days, translator('en')));
  await expect(panel).toContainText('Inspection');
  await expect(panel).toContainText('Day start event');
  await expect(panel).toContainText('Inspection task');
  await expect(panel.locator('.day-preview-slots li')).toHaveCount(4);
  await panel.hover();
  await expect(icon).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: 'test-results/event-day-preview.png', fullPage: true });
  await panel.getByRole('button', { name: 'Open day schedule: Monday / Inspection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Inspection');
  await expect(panel).toHaveCount(0);
});

test('event preview supports slot navigation, Escape, keyboard focus and the existing event-manager click', async ({ page }) => {
  await load(page);
  const icon = page.locator('.sequence-event-icon').first();
  const panel = page.getByRole('dialog', { name: 'Day schedule information', exact: true });
  await icon.focus(); await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Open day schedule: Monday / Inspection', exact: true }).focus();
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(icon).toBeFocused();
  await icon.hover(); await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Open Day start event: Inspection task', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('Inspection task');
  await navigate(page, 'sequences');
  await page.locator('.sequence-event-icon').first().click();
  await expect(page.getByRole('dialog', { name: 'Event manager', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Event manager', exact: true })).toContainText('Supervisor visit');
  await expect(panel).toHaveCount(0);
});
