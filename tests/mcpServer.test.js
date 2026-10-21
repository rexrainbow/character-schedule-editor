import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { sequenceEventsFixture } from './sequenceEventsFixture.js';
import { compileProject } from '../src/core/model.js';

const entry = fileURLToPath(new URL('../src/node/main.js', import.meta.url));
async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'schedule-mcp-test-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('real MCP stdio process discovers tools, edits a probability event, saves, exports and reopens', { timeout: 20000 }, async (t) => {
  const root = await directory(t), { draft, eventDay, sequence } = sequenceEventsFixture();
  await writeFile(join(root, 'input.json'), JSON.stringify(compileProject(draft).data));
  const client = new Client({ name: 'schedule-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--root', root, '--project', 'input.json', '--language', 'zh-TW'], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  await client.connect(transport); t.after(() => client.close());
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args });
    assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
    return response;
  };
  const tools = await client.listTools(); assert.ok(tools.tools.some((tool) => tool.name === 'project_batch'));
  assert.equal(tools.tools.find((tool) => tool.name === 'project_query').annotations.readOnlyHint, true);
  const resource = await client.readResource({ uri: 'schedule://schema/project' });
  assert.ok(JSON.parse(resource.contents[0].text).$defs.day_schedule);
  assert.equal((await call('project_status')).structuredContent.revision, 1);
  const catalog = (await call('project_commands', { object: 'events', action: 'create' })).structuredContent.value;
  assert.equal(catalog.length, 1); assert.ok(catalog[0].schema.required.includes('sequenceId'));
  const denied = await call('project_query', { command: { object: 'days', action: 'remove', id: eventDay.id } });
  assert.equal(denied.isError, true); assert.equal(denied.structuredContent.errors[0].code, 'mutationInQuery');
  const added = await call('project_execute', { expectedRevision: 1, command: { object: 'events', action: 'create', sequenceId: sequence.id, values: { display_name: 'Cold', dayId: eventDay.id, kind: 'probability', end: { week: 3, weekday: 'sun' }, probability_percent: 10, cooldown_days: 7, countFilter: { kind: 'all' } } } });
  assert.equal(added.structuredContent.ok, true); assert.equal(added.structuredContent.revision, 2);
  const stale = await call('project_execute', { expectedRevision: 1, command: { object: 'days', action: 'update', id: eventDay.id, values: { display_name: 'Stale edit' } } });
  assert.equal(stale.isError, true); assert.equal(stale.structuredContent.errors[0].code, 'revisionConflict');
  const saved = await call('project_save', { path: 'output.json', expectedRevision: 2 }); assert.equal(saved.structuredContent.ok, true); assert.equal(saved.structuredContent.dirty, false);
  const data = JSON.parse(await readFile(join(root, 'output.json'), 'utf8'));
  assert.equal(data.week_sequences[sequence.id].event_groups[0].probability_percent, 10);
  const report = await call('project_export', { format: 'report', path: 'report.md', expectedRevision: 2 }); assert.equal(report.structuredContent.ok, true);
  assert.match(await readFile(join(root, 'report.md'), 'utf8'), /Cold/);
  assert.equal((await call('project_open', { path: 'output.json', expectedRevision: 2 })).structuredContent.revision, 3);
  assert.equal((await call('project_query', { command: { object: 'events', action: 'list', sequenceId: sequence.id } })).structuredContent.value.length, 1);
  assert.equal(stderr, '');
});

test('stdio --web exposes a GUI sharing the same project instance', { timeout: 20000 }, async (t) => {
  const root = await directory(t), client = new Client({ name: 'combined-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--root', root, '--web', '--port', '0'], stderr: 'pipe' });
  await client.connect(transport); t.after(() => client.close());
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent;
  const status = await call('project_status'); assert.match(status.webUrl, /^http:\/\/127\.0\.0\.1:/);
  assert.match(await (await fetch(status.webUrl)).text(), /window\.__SCHEDULE_CONNECTION__/);
  const config = await (await fetch(`${status.webUrl}/__schedule/config`)).json();
  const id = crypto.randomUUID();
  const response = await fetch(`${status.webUrl}/__schedule/api/guiChanges`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'X-Schedule-Instance': config.instanceId }, body: JSON.stringify({ expectedRevision: status.revision, mode: 'user', changes: [{ collection: 'days', kind: 'put', id, value: { id, name: 'GUI shared day', icon: 'tabler:calendar', slotIds: [null, null, null] } }] }) });
  assert.equal((await response.json()).ok, true);
  assert.equal((await call('project_query', { command: { object: 'days', action: 'get', id } })).value.display_name, 'GUI shared day');
});
