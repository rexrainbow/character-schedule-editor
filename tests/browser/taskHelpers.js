import { navigate as navigatePage } from './navigation.js';
import { translator } from '../../src/i18n.js';
export async function selectFirstDefinedTask(select) {
  if (!await select.count()) {
    const page = select.page(), t = translator(await page.locator('html').getAttribute('lang'));
    await page.getByRole('button', { name: t('addElseBranch'), exact: true }).click();
  }
  const value = await select.locator('option[value]:not([value=""]):not([value^="builtin:"]):not([value^="macro:"])').first().getAttribute('value');
  await select.selectOption(value);
}
export async function defineSimpleTask(page, t = translator('en')) {
  const locale = await page.locator('html').getAttribute('lang');
  const previousMode = await page.locator('.app-shell').getAttribute('data-mode');
  const previous = await page.locator('.mobile-page-picker').inputValue();
  async function navigate(key) { await navigatePage(page, key, locale); }
  await navigate('tasks');
  await page.locator('.operand-sidebar').getByRole('button', { name: t('addTask'), exact: true }).click();
  await page.getByRole('textbox', { name: t('name'), exact: true }).fill('Test task');
  await navigatePage(page, previous, locale, previousMode);
}
