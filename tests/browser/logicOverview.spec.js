import { test, expect } from '@playwright/test';
import { priorityMacroFixture } from '../priorityMacroFixture.js';
import { compileProject, createDay } from '../../src/core/model.js';
import { navigate } from './navigation.js';
import { translator } from '../../src/i18n/index.js';
async function load(page) {
  const fixture = priorityMacroFixture(), day = createDay(fixture.draft, 'Routine'); day.slotIds[0] = fixture.slot.id; fixture.draft.days = [day];
  await page.goto('/'); await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'logic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(fixture.draft).data)) });
  return fixture;
}

test('overview starts collapsed, expands nested priorities, updates with edits and remembers only UI preferences', async ({ page }) => {
  await load(page); await navigate(page, 'slots');
  const toggle = page.getByRole('button', { name: 'Logic overview', exact: true }), text = page.locator('.logic-overview pre');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(text).toHaveCount(0);
  await toggle.click(); await expect(text).toHaveText('Choose activity');
  await page.getByRole('combobox', { name: 'Expansion depth', exact: true }).selectOption('one');
  await expect(text).toContainText('IF (Engine.Counter >= 20) → Eligible increase (Amount: 20)');
  await expect(text).not.toContainText('Increase value');
  await page.getByRole('combobox', { name: 'Expansion depth', exact: true }).selectOption('all');
  await expect(text).toContainText('Increase value (Engine.Counter, 20)');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('builtin:reset_variable');
  await expect(text).toContainText('Reset initial value');
  await expect(text).not.toContainText('ELSE →');
  await expect(page.locator('option[value="builtin:schedule_takeover"]')).toHaveCount(0);
  await toggle.click(); await expect(text).toHaveCount(0); await toggle.click();
  await page.reload(); await load(page); await navigate(page, 'slots');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('combobox', { name: 'Expansion depth', exact: true })).toHaveValue('all');
  await expect(text).toContainText('Increase value (Engine.Counter, 20)');
});

test('Chinese mobile day-cell editor shows the same overview without committing draft changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW'); const t = translator('zh-TW');
  await page.getByRole('button', { name: t('cell', { count: 1 }), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('editSlot'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: t('logicOverview'), exact: true }).click();
  await dialog.getByRole('combobox', { name: t('logicDepth'), exact: true }).selectOption('all');
  await expect(dialog.locator('.logic-overview pre')).toContainText(t('logicPriorityHint'));
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  page.once('dialog', (nativeDialog) => nativeDialog.accept());
  await dialog.getByRole('combobox', { name: t('task'), exact: true }).selectOption('builtin:reset_variable');
  await expect(dialog.locator('.logic-overview pre')).toContainText(t('resetVariable'));
  await dialog.getByRole('button', { name: t('back'), exact: true }).click();
  await page.keyboard.press('Escape'); await navigate(page, 'slots', 'zh-TW');
  await expect(page.locator('.logic-overview pre')).toContainText('Choose activity');
  await expect(page.locator('.logic-overview pre')).not.toContainText(t('resetVariable'));
});

test('macro overview follows selection and edits with shared depth controls in English and Chinese mobile', async ({ page }) => {
  await load(page); await navigate(page, 'taskMacros');
  const toggle = page.getByRole('button', { name: 'Logic overview', exact: true }), text = page.locator('.logic-overview pre');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await toggle.click();
  await expect(text).toContainText('IF (Engine.Counter >= Amount)');
  await expect(text).toContainText('Increase value (Engine.Counter, Amount)');
  await page.locator('.operand-sidebar').getByRole('button', { name: /Choose activity/ }).click();
  await expect(text).toContainText('Eligible increase (Amount: 20)'); await expect(text).not.toContainText('Increase value');
  const depth = page.getByRole('combobox', { name: 'Expansion depth', exact: true });
  await depth.selectOption('one'); await expect(text).toContainText('Increase value (Engine.Counter, 20)');
  await depth.selectOption('all');
  await page.locator('.operand-sidebar').getByRole('button', { name: /Eligible increase/ }).click();
  await page.getByRole('textbox', { name: 'Parameter name', exact: true }).fill('Energy cost');
  await expect(text).toContainText('IF (Engine.Counter >= Energy cost)');
  await expect(text).toContainText('Increase value (Engine.Counter, Energy cost)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-TW'); const t = translator('zh-TW');
  await expect(page.getByRole('combobox', { name: t('logicDepth'), exact: true })).toHaveValue('all');
  await expect(text).toContainText(t('incrementVariable'));
  await text.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/macro-logic-overview-mobile.png' });
  await page.getByRole('button', { name: t('logicOverview'), exact: true }).click(); await expect(text).toHaveCount(0);
});
