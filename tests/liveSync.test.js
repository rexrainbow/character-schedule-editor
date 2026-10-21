import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProjectService } from '../src/node/projectService.js';
import { startWebServer } from '../src/node/web/server.js';
import { createRemoteProjectClient } from '../src/browser/remoteProjectClient.js';
import { draftChanges, applyDraftChanges, stringifyWire, parseWire, sameData } from '../src/core/draftChanges.js';
import { createProject } from '../src/core/model.js';
import { editProject } from '../src/core/projectApi.js';

async function setup(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'schedule-sync-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
  let web;
  t.after(async () => { await web?.close(); await rm(root, { recursive: true, force: true }); });
  const dist = join(root, 'test-web'); await mkdir(dist); await writeFile(join(dist, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
  const service = await createProjectService({ root }); web = await startWebServer(service, { port: 0, dist });
  const config = await (await fetch(`${web.url}/__schedule/config`)).json();
  const client = createRemoteProjectClient({ ...config, base: `${web.url}/__schedule` }, {
    createEvents: () => { const event = {}; const stop = service.subscribe((message) => event.onmessage?.({ data: stringifyWire(message) })); event.close = stop; return event; },
    ...options,
  });
  const stop = client.start(); t.after(stop);
  await until(client, (state) => state.ready);
  return { root, service, web, client, config };
}
function until(client, predicate) {
  if (predicate(client.getConnectionState())) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { stop(); reject(new Error('Timed out waiting for connection state: ' + JSON.stringify(client.getConnectionState()))); }, 5000);
    const stop = client.subscribeConnection(() => { if (predicate(client.getConnectionState())) { clearTimeout(timeout); stop(); resolve(); } });
  });
}

test('object changes preserve ordering, removals and unfinished numeric fields on the wire', () => {
  const before = createProject(), after = structuredClone(before);
  after.days = [{ id: 'a', name: 'One', slotIds: [null] }, { id: 'b', name: 'Two', slotIds: [null] }];
  after.operandNodes = { test: { initial_value: NaN } };
  const changes = parseWire(stringifyWire(draftChanges(before, after)));
  assert.ok(sameData(applyDraftChanges(before, changes), after));
  const next = structuredClone(after); next.days.reverse(); delete next.operandNodes.test;
  assert.ok(sameData(applyDraftChanges(after, draftChanges(after, next)), next));
  assert.throws(() => applyDraftChanges(before, [{ collection: '__proto__', kind: 'put', id: 'x', value: {} }]));
  assert.throws(() => applyDraftChanges(after, [{ collection: 'days', kind: 'order', ids: ['a', 'a'] }]));
  assert.deepEqual(before.days, []);
});

test('GUI edits reach the authoritative service and MCP edits return to the client', async (t) => {
  const { service, client } = await setup(t);
  const added = editProject(client.getSnapshot()).days.create({ name: 'GUI day' }); client.replaceDraft(added.draft);
  assert.equal(await client.flush(), true);
  const state = await service.state(); assert.equal(state.value.days[0].name, 'GUI day');
  await service.execute({ command: { object: 'days', action: 'update', id: added.id, values: { display_name: 'Agent day' } }, expectedRevision: state.revision });
  await until(client, (connection) => connection.revision === state.revision + 1);
  assert.equal(client.getSnapshot().days[0].name, 'Agent day');
});

test('queued typing preserves every local edit and independent GUI modes preserve MCP mode', async (t) => {
  const { service, client } = await setup(t);
  const added = editProject(client.getSnapshot()).days.create({ name: 'First' }); client.replaceDraft(added.draft);
  client.replaceDraft(editProject(client.getSnapshot()).days.update(added.id, { name: 'Second' }).draft);
  client.replaceDraft(editProject(client.getSnapshot()).days.update(added.id, { name: 'Final' }).draft);
  assert.equal(await client.flush(), true);
  assert.equal((await service.state()).value.days[0].name, 'Final');
  assert.equal(client.getConnectionState().revision, 3);
  client.setMode('environment');
  client.replaceDraft(editProject(client.getSnapshot()).tasks.create({ display_name: 'Engine task' }).draft);
  assert.equal(await client.flush(), true);
  const state = await service.state();
  assert.equal(state.value.tasks[0].display_name, 'Engine task'); assert.equal(state.mode, 'user');
});

test('NaN editor values survive actual HTTP synchronization and remain unsavable', async (t) => {
  const { service, client } = await setup(t);
  const added = editProject(client.getSnapshot()).variables.create({ display_name: 'Health', scope: 'application', initial_value: 0 });
  client.replaceDraft(added.draft); await client.flush();
  client.replaceDraft(editProject(client.getSnapshot()).variables.update(added.id, { initial_value: NaN }).draft);
  assert.equal(await client.flush(), true);
  assert.ok(Number.isNaN((await service.state()).value.operandNodes[added.id].initial_value));
  assert.ok(Number.isNaN(client.getSnapshot().operandNodes[added.id].initial_value));
  assert.equal((await service.saveProject({ path: 'incomplete.json', expectedRevision: 2 })).ok, false);
});

test('an open form holds remote updates; a stale edit is retained locally, never overwrites the server', async (t) => {
  const { service, client } = await setup(t);
  const added = editProject(client.getSnapshot()).days.create({ name: 'Original' }); client.replaceDraft(added.draft); await client.flush();
  client.setHold(true);
  const revision = (await service.status()).revision;
  await service.execute({ command: { object: 'days', action: 'update', id: added.id, values: { display_name: 'Agent edit' } }, expectedRevision: revision });
  await until(client, (connection) => connection.remoteUpdates);
  assert.equal(client.getSnapshot().days[0].name, 'Original');
  client.replaceDraft(editProject(client.getSnapshot()).days.update(added.id, { name: 'My form' }).draft);
  assert.equal(await client.flush(), false); assert.equal(client.getConnectionState().conflict, true);
  assert.equal(client.getSnapshot().days[0].name, 'My form');
  assert.equal((await service.state()).value.days[0].name, 'Agent edit');
  client.setHold(false);
  assert.equal(client.getSnapshot().days[0].name, 'My form');
  assert.equal((await client.reload()).ok, true); assert.equal(client.getSnapshot().days[0].name, 'Agent edit');
});

test('unfinished GUI fields are synchronized but block strict MCP edits and saves until fixed', async (t) => {
  const { service, client } = await setup(t);
  const added = editProject(client.getSnapshot()).days.create({ name: 'Incomplete', symbol: '' }); client.replaceDraft(added.draft);
  assert.equal(await client.flush(), true);
  assert.equal((await service.state()).value.days[0].symbol, '');
  assert.equal((await service.execute({ command: { object: 'days', action: 'create', values: { display_name: 'Agent' } }, expectedRevision: 1 })).ok, false);
  assert.equal((await service.saveProject({ path: 'invalid.json', expectedRevision: 1 })).ok, false);
  client.replaceDraft(editProject(client.getSnapshot()).days.update(added.id, { symbol: 'complete' }).draft); await client.flush();
  assert.equal((await service.saveProject({ path: 'complete.json', expectedRevision: 2 })).ok, true);
});

test('network failure keeps local edits and does not resubmit them after reconnect', async (t) => {
  let offline = false;
  const { service, client } = await setup(t, { fetchImpl: (...args) => { if (offline) throw new Error('offline'); return fetch(...args); } });
  offline = true;
  const added = editProject(client.getSnapshot()).days.create({ name: 'Offline edit' }); client.replaceDraft(added.draft);
  assert.equal(await client.flush(), false); assert.equal(client.getSnapshot().days[0].name, 'Offline edit');
  offline = false;
  assert.equal((await service.state()).value.days.length, 0);
  assert.equal((await client.reload()).ok, true); assert.equal(client.getSnapshot().days.length, 0);
});

test('an unresponsive submission times out without losing or automatically retrying local input', async (t) => {
  let submissions = 0;
  const { service, client } = await setup(t, { requestTimeout: 500, fetchImpl: (url, options) => {
    if (!url.endsWith('/api/guiChanges')) return fetch(url, options);
    submissions++;
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const added = editProject(client.getSnapshot()).days.create({ name: 'Timed-out input' }); client.replaceDraft(added.draft);
  assert.equal(await client.flush(), false);
  assert.equal(client.getSnapshot().days[0].name, 'Timed-out input');
  assert.equal((await service.state()).value.days.length, 0);
  assert.equal(submissions, 1); assert.equal(client.getConnectionState().connected, false);
});

test('reconnecting invalidates an older initial snapshot response', async (t) => {
  const { service, web, config } = await setup(t, { createEvents: null });
  const oldState = await service.state(); let release, initial = true;
  const delayed = new Promise((resolve) => { release = resolve; });
  const client = createRemoteProjectClient({ ...config, base: `${web.url}/__schedule` }, { createEvents: null, fetchImpl: (url, options) => {
    if (initial && url.endsWith('/api/state')) { initial = false; return delayed; }
    return fetch(url, options);
  } });
  const stop = client.start(); t.after(stop);
  const created = await service.execute({ command: { object: 'days', action: 'create', values: { display_name: 'Latest' } }, expectedRevision: 0 }); assert.equal(created.ok, true);
  assert.equal((await client.reload()).ok, true);
  release(new Response(stringifyWire(oldState)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.getSnapshot().days[0].name, 'Latest');
});

test('web entry injects connection only locally and checks origin, token and service instance', async (t) => {
  const { web, config } = await setup(t, { createEvents: null });
  assert.match(await (await fetch(web.url)).text(), /window\.__SCHEDULE_CONNECTION__/);
  assert.equal((await fetch(`${web.url}/__schedule/config`, { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${web.url}/__schedule/catalog`)).status, 401);
  const denied = await fetch(`${web.url}/__schedule/api/state`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`, 'X-Schedule-Instance': 'old-instance' }, body: '{}' });
  assert.equal(denied.status, 409);
});
