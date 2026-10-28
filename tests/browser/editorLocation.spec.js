import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../../src/core/blueprint/index.js';
import { navigate } from './navigation.js';

const { data, errors } = importBlueprint(await readFile(new URL('../fixtures/life-simulation.yaml', import.meta.url), 'utf8'));
expect(errors).toEqual([]);
async function load(page, hash = '') {
  await page.goto('/' + hash);
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
async function hashTo(page, hash) { await page.evaluate((value) => { window.location.hash = value; }, hash); }

test('startup links survive import, renames replace history, and Back/Forward restore objects', async ({ page }) => {
  await load(page, '#/user/expressions/weekly_pay');
  await expect(page.getByRole('treeitem', { name: '本期薪資', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/user\/expressions\/weekly_pay$/);
  await navigate(page, 'days');
  await expect(page).toHaveURL(/#\/user\/days\//);
  await page.goBack();
  await expect(page).toHaveURL(/#\/user\/expressions\/weekly_pay$/);
  await expect(page.getByRole('treeitem', { name: '本期薪資', exact: true })).toHaveAttribute('aria-selected', 'true');
  const before = await page.evaluate(() => history.length);
  await page.getByRole('textbox', { name: 'Name (symbol)', exact: true }).fill('weekly_income');
  await expect(page).toHaveURL(/#\/user\/expressions\/weekly_income$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
  await page.goForward();
  await expect(page).toHaveURL(/#\/user\/days\//);
  await page.goBack();
  await expect(page).toHaveURL(/#\/user\/expressions\/weekly_income$/);
});

test('event link opens selected event, draft navigation can stay or discard, and closing removes event path', async ({ page }) => {
  await load(page, '#/user/sequences/life/events/cold');
  const manager = page.getByRole('dialog', { name: 'Event manager', exact: true });
  await expect(manager).toBeVisible();
  await expect(manager.getByRole('option', { name: '感冒', exact: true })).toHaveAttribute('aria-selected', 'true');
  await manager.getByRole('textbox', { name: 'Event name', exact: true }).fill('Edited cold');
  await hashTo(page, '#/user/days/working');
  const confirmation = page.getByRole('dialog', { name: 'Leave this draft?', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(manager.getByRole('textbox', { name: 'Event name', exact: true })).toHaveValue('Edited cold');
  await expect(page).toHaveURL(/events\/cold$/);
  await hashTo(page, '#/user/days/working');
  await confirmation.getByRole('button', { name: 'Discard and open', exact: true }).click();
  await expect(manager).not.toBeVisible();
  await expect(page).toHaveURL(/#\/user\/days\/working$/);
  await hashTo(page, '#/user/sequences/life/events/cold');
  await expect(manager.getByRole('textbox', { name: 'Event name', exact: true })).toHaveValue('感冒');
  await manager.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/#\/user\/sequences\/life$/);
});

test('missing and malformed links remain navigable; copy link, Chinese and narrow layouts work', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await load(page, '#/user/expressions/missing');
  await expect(page.getByRole('alert')).toContainText('missing');
  // A second bad link on the same page must not leave URL synchronization pending.
  await hashTo(page, '#/user/expressions/still_missing');
  await expect(page.getByRole('alert')).toContainText('still_missing');
  await page.getByRole('treeitem', { name: '本期薪資', exact: true }).click();
  await expect(page).toHaveURL(/expressions\/weekly_pay$/);
  await expect(page.getByRole('alert')).not.toBeVisible();
  await page.getByRole('button', { name: 'Copy link to this editor', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#\/user\/expressions\/weekly_pay$/);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '複製此編輯位置連結', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-location-narrow.png' });
  await hashTo(page, '#/bogus');
  await expect(page.getByRole('alert')).toContainText('連結無效');
  await page.getByRole('combobox', { name: '編輯頁面', exact: true }).selectOption('sequences');
  await expect(page).toHaveURL(/#\/user\/sequences\/life$/);
});

test('Back protects event drafts without breaking Forward; environment and simulation routes resolve', async ({ page }) => {
  await load(page, '#/user/expressions/weekly_pay');
  await expect(page).toHaveURL(/weekly_pay$/);
  await hashTo(page, '#/user/sequences/life/events/cold');
  const manager = page.getByRole('dialog', { name: 'Event manager', exact: true });
  await manager.getByRole('textbox', { name: 'Event name', exact: true }).fill('Draft');
  await page.goBack();
  const confirmation = page.getByRole('dialog', { name: 'Leave this draft?', exact: true });
  await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(/events\/cold$/);
  await page.goBack();
  await confirmation.getByRole('button', { name: 'Discard and open', exact: true }).click();
  await expect(page).toHaveURL(/expressions\/weekly_pay$/);
  await page.goForward();
  await expect(manager).toBeVisible();
  await expect(manager.getByRole('textbox', { name: 'Event name', exact: true })).toHaveValue('感冒');
  await page.screenshot({ path: 'test-results/editor-location-event.png' });
  await hashTo(page, '#/environment/tasks/increment_variable');
  await expect(manager).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name (symbol)', exact: true }).first()).toHaveValue('increment_variable');
  await hashTo(page, '#/simulation/continuous');
  await expect(page.getByRole('tab', { name: 'Continuous simulation', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('nested variables and enum links reveal their selected nodes and a missing day can be reselected', async ({ page }) => {
  const nested = importBlueprint(`
variables:
  stats: { kind: group }
  stamina: { parent: stats, order: 0, initial: 60 }
enums:
  constants: { kind: group }
  weekdays: { parent: constants, order: 0, options: [{value: Monday}, {value: Tuesday}] }
`);
  expect(nested.errors).toEqual([]);
  await page.goto('/#/user/variables/stamina');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'nested.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(nested.data)) });
  await expect(page.getByRole('textbox', { name: 'Name (symbol)', exact: true })).toHaveValue('stamina');
  const variable = Object.entries(nested.data.operand_nodes).find(([, node]) => node.name === 'stamina')[0];
  await expect(page.locator(`[data-node-id="${variable}"]`)).toHaveAttribute('aria-selected', 'true');
  await hashTo(page, '#/user/enums/weekdays');
  await expect(page.getByRole('textbox', { name: 'Name (symbol)', exact: true })).toHaveValue('weekdays');
  const enumeration = Object.entries(nested.data.enum_definitions).find(([, node]) => node.name === 'weekdays')[0];
  await expect(page.locator(`[data-node-id="${enumeration}"]`)).toHaveAttribute('aria-selected', 'true');
  // Switching projects keeps the URL usable without retaining old UUID selection.
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await hashTo(page, '#/user/days/missing');
  await expect(page.getByRole('alert')).toContainText('missing');
  await page.locator('.schedule-list-entry button').filter({ hasText: '工作日' }).first().click();
  await expect(page).toHaveURL(/#\/user\/days\/working$/);
  await expect(page.getByRole('alert')).not.toBeVisible();
});
