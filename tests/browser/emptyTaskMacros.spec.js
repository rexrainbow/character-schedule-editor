import { exportRuntime } from './navigation.js';
import { createActionSlot as createSlot } from '../slotFixture.js';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProject, compileProject } from '../../src/core/model.js';
import { createTaskMacro } from '../../src/core/taskMacroModel.js';
import { navigate, exportProject } from './navigation.js';

async function download(page, action) {
  const pending = page.waitForEvent('download'); await action();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

test('empty macro modes are callable and exportable; branch content can be removed and rebuilt', async ({ page }) => {
  const draft = createProject(), sequence = createTaskMacro('Debug sequence'), branch = { ...createTaskMacro('Debug branch', 'branch'), branches: [] };
  draft.taskMacros = [sequence, branch];
  draft.slots = draft.taskMacros.map((macro) => { const slot = createSlot([], macro.display_name); slot.branches[0].task = { task_macro_id: macro.id, arguments: {} }; return slot; });
  await page.goto('/');
  await page.locator('.app-header input[type=file]').first().setInputFiles({ name: 'empty-macros.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(compileProject(draft).data)) });
  await navigate(page, 'taskMacros');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/This macro has no actions/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Runtime debug');
  await page.locator('.operand-sidebar').getByRole('button', { name: 'Debug branch 0', exact: true }).click();
  await page.getByRole('button', { name: 'Add ELSE branch', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Branch 1', exact: true })).toContainText('ELSE');
  await expect(page.getByRole('alert')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Delete branch', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const project = await download(page, () => exportProject(page));
  expect(project.task_macros[sequence.id].steps).toEqual([]);
  expect(project.task_macros[branch.id].branches).toEqual([]);
  const runtime = await download(page, () => exportRuntime(page));
  expect(runtime.task_macros[sequence.id].display_name).toBe('Runtime debug');
  expect(runtime.task_macros[sequence.id].steps).toEqual([]);
  expect(runtime.task_macros[branch.id].branches).toEqual([]);
  expect(runtime.slots[draft.slots[0].id].branches[0].task.task_macro_id).toBe(sequence.id);
  expect(runtime.environment_requirements.tasks).toEqual([]);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await expect(page.getByText('此巨集沒有動作，可匯出作為除錯佔位；runtime 可印出巨集名稱後立即完成。', { exact: true })).toBeVisible();
});
