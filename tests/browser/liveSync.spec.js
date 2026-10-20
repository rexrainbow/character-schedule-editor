import { test as base, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createProjectService } from '../../src/node/projectService.js';
import { startWebServer } from '../../src/node/web/server.js';
import { sequenceEventsFixture } from '../sequenceEventsFixture.js';
import { compileProject } from '../../src/core/model.js';
import { navigate, exportProject } from './navigation.js';
import { translator } from '../../src/i18n/index.js';

const entry = fileURLToPath(new URL('../../src/node/main.js', import.meta.url));
const test = base.extend({ live: async ({}, use) => {
  const root = await mkdtemp(join(tmpdir(), 'schedule-gui-'));
  expect(resolve(root).startsWith(resolve(tmpdir()))).toBe(true);
  const fixture = sequenceEventsFixture(), document = compileProject(fixture.draft).data;
  await writeFile(join(root, 'project.json'), JSON.stringify(document));
  await writeFile(join(root, 'other.json'), JSON.stringify({ ...document, project: { ...document.project, name: 'Other project' } }));
  const service = await createProjectService({ root }); await service.openProject({ path: 'project.json', expectedRevision: 0 });
  let web = await startWebServer(service, { port: 0 });
  const mcp = new Client({ name: 'gui-test', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--connect', web.url], stderr: 'pipe' }));
  const call = async (name, args = {}) => (await mcp.callTool({ name, arguments: args })).structuredContent;
  const mutate = async (command) => { const { revision } = await call('project_status'); return call('project_execute', { command, expectedRevision: revision }); };
  try { await use({ ...fixture, root, service, url: web.url, call, mutate, async restart() { const port = Number(new URL(web.url).port); await web.close(); web = await startWebServer(service, { port }); }, stop: () => web.close() }); }
  finally { await mcp.close(); await web.close(); await rm(root, { recursive: true, force: true }); }
} });
async function open(page, live) {
  await page.goto(live.url);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-connection', 'remote');
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Workday');
}

test('one GUI shares edits in both directions with a real MCP stdio bridge and preserves navigation', async ({ page, live }) => {
  await open(page, live);
  await page.getByRole('textbox', { name: 'Day name', exact: true }).fill('GUI workday');
  await expect.poll(async () => (await live.call('project_query', { command: { object: 'days', action: 'get', id: live.main.id } })).value.name).toBe('GUI workday');
  expect((await live.mutate({ object: 'days', action: 'update', id: live.main.id, values: { name: 'Agent workday' } })).ok).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Agent workday');
  await navigate(page, 'slots');
  await page.getByRole('textbox', { name: translator('en')('search'), exact: true }).fill('Inspection');
  expect((await live.mutate({ object: 'days', action: 'update', id: live.main.id, values: { tags: ['Remote tag'] } })).ok).toBe(true);
  await expect(page.getByRole('textbox', { name: translator('en')('search'), exact: true })).toHaveValue('Inspection');
  await expect(page.getByRole('tab', { name: 'Slots', exact: true })).toHaveAttribute('aria-selected', 'true');
  const another = await page.context().newPage(); await another.goto(live.url);
  await expect(another.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Agent workday');
  await another.close();
  await page.screenshot({ path: 'test-results/live-sync-desktop.png' });
});

test('remote updates retain modal inputs; stale apply stays local and can be exported before reload', async ({ page, live }) => {
  await open(page, live); await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await page.getByRole('button', { name: 'Create slot', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Display name', exact: true }).fill('My form draft');
  expect((await live.mutate({ object: 'days', action: 'update', id: live.main.id, values: { name: 'Agent version' } })).ok).toBe(true);
  await expect(dialog.locator('.connection-draft-hint')).toContainText('This form is retained');
  await expect(dialog.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('My form draft');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.connection-warning')).toContainText('Your local edits are retained');
  expect((await live.service.state()).value.slots.some((slot) => slot.name === 'My form draft')).toBe(false);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export local project', exact: true }).click();
  const local = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(Object.values(local.slots).some((slot) => slot.display_name === 'My form draft')).toBe(true);
  page.once('dialog', (dialog) => dialog.dismiss()); await page.getByRole('button', { name: 'Load server version', exact: true }).click();
  await expect(page.locator('.connection-warning')).toBeVisible();
  await page.screenshot({ path: 'test-results/live-sync-conflict.png' });
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Load server version', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Agent version');
  await expect(page.locator('.connection-warning')).toHaveCount(0);
});

test('cancelling a held modal receives the latest server version without a conflict', async ({ page, live }) => {
  await open(page, live); await page.getByRole('button', { name: 'Slot 1', exact: true }).click();
  await live.mutate({ object: 'days', action: 'update', id: live.main.id, values: { name: 'Updated while choosing' } });
  await expect(page.getByRole('dialog').locator('.connection-draft-hint')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Day name', exact: true })).toHaveValue('Updated while choosing');
  await expect(page.locator('.connection-warning')).toHaveCount(0);
});

test('server save/open use local paths, and downloading a project does not mark server edits saved', async ({ page, live }) => {
  await open(page, live);
  await page.getByRole('textbox', { name: 'Day name', exact: true }).fill('Persisted edit');
  await expect.poll(async () => (await live.service.state()).value.days[0].name).toBe('Persisted edit');
  const download = page.waitForEvent('download'); await exportProject(page); await download;
  await expect(page.locator('.app-footer')).toContainText('Unsaved changes');
  await page.getByRole('button', { name: 'Project menu', exact: true }).click(); await page.getByRole('menuitem', { name: 'Save server project', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save server project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(Object.values(JSON.parse(await readFile(join(live.root, 'project.json'), 'utf8')).day_schedules)[0].display_name).toBe('Persisted edit');
  await expect(page.locator('.app-footer')).toContainText('Saved / no changes');
  await page.getByRole('button', { name: 'Project menu', exact: true }).click(); await page.getByRole('menuitem', { name: 'Open server project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project file path', exact: true }).fill('other.json');
  await page.getByRole('dialog').getByRole('button', { name: 'Open server project', exact: true }).click();
  await expect(page.locator('.project-identity h1')).toHaveText('Other project');
});

test('disconnect retains input, reconnect is explicit and Chinese mobile remains usable', async ({ page, live }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, live);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-TW');
  await live.stop(); await expect(page.locator('.connection-warning')).toBeVisible();
  await page.getByRole('textbox', { name: '日行程名稱', exact: true }).fill('斷線草稿');
  await expect(page.getByRole('textbox', { name: '日行程名稱', exact: true })).toHaveValue('斷線草稿');
  await live.restart();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: '載入伺服器版本', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '日行程名稱', exact: true })).toHaveValue('Workday');
  expect((await live.service.state()).value.days[0].name).toBe('Workday');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/live-sync-mobile.png' });
});

test('static web entry never probes a server, even when a connection URL is in the query string', async ({ page }) => {
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.goto('/?server=http://127.0.0.1:5175');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-connection', 'local');
  expect(await page.evaluate(() => window.__SCHEDULE_CONNECTION__)).toBeUndefined();
  expect(requests.some((url) => url.includes('/__schedule/'))).toBe(false);
});
