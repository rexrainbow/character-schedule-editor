import { translator } from '../../src/i18n/index.js';

export async function exportProject(page) {
  const t = translator(await page.locator('html').getAttribute('lang'));
  await page.getByRole('button', { name: t('projectMenu'), exact: true }).click();
  await page.getByRole('menuitem', { name: t('export'), exact: true }).click();
}

export async function switchMode(page, mode, locale = 'en') {
  const t = translator(locale);
  await page.getByRole('button', { name: t('projectMenu'), exact: true }).click();
  await page.getByRole('menuitemradio', { name: t(mode === 'environment' ? 'environmentMode' : mode === 'simulation' ? 'simulationMode' : 'userMode'), exact: true }).click();
}

export async function navigate(page, key, locale = 'en', mode) {
  const t = translator(locale);
  const scope = mode ?? (['operands', 'tasks'].includes(key) ? 'environment' : 'user');
  await switchMode(page, scope, locale);
  const picker = page.getByRole('combobox', { name: t('editorPage'), exact: true });
  const label = key === 'operands' ? t(scope === 'environment' ? 'environmentVariables' : 'applicationVariables') : key === 'tasks' ? t('taskDefinitions') : key === 'expressions' && scope === 'environment' ? t('environmentExpressions') : t(key);
  if (await picker.isVisible()) await picker.selectOption(key);
  else await page.getByRole('tab', { name: label, exact: true }).click();
}
