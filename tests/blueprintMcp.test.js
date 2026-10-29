import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createProjectService } from '../src/node/projectService.js';
import { startWebServer } from '../src/node/web/server.js';
import { connectProjectService } from '../src/node/web/client.js';
import { weightedBlueprint } from './weightedMacroFixture.js';

const entry = fileURLToPath(new URL('../src/node/main.js', import.meta.url));
async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'schedule-blueprint-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const example = () => readFile(new URL('../docs/recipes/examples/life-simulation.yaml', import.meta.url), 'utf8');

test('MCP creates, previews, imports, edits, exports YAML, rebuilds and saves with fresh identities', { timeout: 30000 }, async (t) => {
  const root = await directory(t), client = new Client({ name: 'blueprint-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--root', root], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  await client.connect(transport); t.after(() => client.close());
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent;
  assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'project_import_yaml'));
  assert.match(client.getInstructions(), /schedule:\/\/guide\/engine-semantics/);
  const resources = (await client.listResources()).resources;
  assert.ok(resources.some((resource) => resource.uri === 'schedule://guide/engine-semantics'));
  assert.ok(resources.some((resource) => resource.uri === 'schedule://guide/system-semantics'));
  const semantics = (await client.readResource({ uri: 'schedule://guide/engine-semantics' })).contents[0].text;
  assert.equal(semantics, await readFile(new URL('../docs/ENGINE_SEMANTICS.md', import.meta.url), 'utf8'));
  const overview = (await client.readResource({ uri: 'schedule://guide/system-semantics' })).contents[0].text;
  assert.equal(overview, await readFile(new URL('../docs/SYSTEM_SEMANTICS.md', import.meta.url), 'utf8'));
  assert.match(JSON.parse((await client.readResource({ uri: 'schedule://schema/blueprint' })).contents[0].text).description, /engine-semantics/);
  assert.match((await client.listTools()).tools.find((tool) => tool.name === 'project_import_yaml').description, /engine-semantics/);
  assert.equal(JSON.parse((await client.readResource({ uri: 'schedule://schema/blueprint' })).contents[0].text).title, 'Character Schedule Blueprint');
  assert.match((await client.readResource({ uri: 'schedule://guide/blueprint' })).contents[0].text, /vars\./);
  const yaml = (await client.readResource({ uri: 'schedule://guide/blueprint-example' })).contents[0].text;
  const created = await call('project_new', { name: 'Empty', expectedRevision: 0 }); assert.equal(created.ok, true);
  const preview = await call('project_import_yaml', { yaml, preview: true }); assert.equal(preview.ok, true); assert.equal(preview.revision, created.revision); assert.equal(preview.value.counts.operand_nodes, 4);
  const imported = await call('project_import_yaml', { yaml, expectedRevision: created.revision }); assert.equal(imported.ok, true); assert.equal(imported.dirty, true); assert.equal(imported.file, null);
  const variables = await call('project_query', { command: { object: 'variables', action: 'list' } });
  const money = variables.value.find((item) => item.display_name === '金錢');
  assert.equal(money.name, 'money');
  assert.equal((await call('project_query', { command: { object: 'variables', action: 'get', name: 'money' } })).value.id, money.id);
  const edited = await call('project_execute', { expectedRevision: imported.revision, command: { object: 'variables', action: 'update', name: 'money', values: { initial_value: 150 } } }); assert.equal(edited.ok, true);
  const exported = await call('project_export', { format: 'yaml', path: 'blueprint.yml', expectedRevision: edited.revision }); assert.equal(exported.ok, true);
  const text = await readFile(join(root, 'blueprint.yml'), 'utf8'); assert.match(text, /initial: 150/); assert.doesNotMatch(text, new RegExp(money.id));
  assert.equal((await call('project_import_yaml', { path: 'blueprint.yml', expectedRevision: imported.revision, discardChanges: true })).errors[0].code, 'revisionConflict');
  assert.equal((await call('project_import_yaml', { path: 'blueprint.yml', expectedRevision: edited.revision })).errors[0].code, 'unsavedChanges');
  const invalid = await call('project_import_yaml', { yaml: 'expressions: {x: {type: number, value: vars.missing}}', expectedRevision: edited.revision, discardChanges: true }); assert.equal(invalid.ok, false); assert.equal(invalid.revision, edited.revision);
  const rebuilt = await call('project_import_yaml', { path: 'blueprint.yml', expectedRevision: edited.revision, discardChanges: true }); assert.equal(rebuilt.ok, true);
  const newVariables = await call('project_query', { command: { object: 'variables', action: 'list' } }); assert.ok(newVariables.value.every((item) => item.id !== money.id));
  assert.equal(newVariables.value.find((item) => item.display_name === '金錢').initial_value, 150);
  const second = await call('project_export', { format: 'yaml' }); assert.equal(second.value, text);
  const saved = await call('project_save', { path: 'rebuilt.json', expectedRevision: rebuilt.revision }); assert.equal(saved.ok, true); assert.equal(saved.dirty, false);
  assert.equal((await call('project_export', { format: 'runtime' })).ok, true);
  const weighted = await call('project_import_yaml', { yaml: weightedBlueprint, expectedRevision: saved.revision });
  assert.equal(weighted.ok, true);
  const lottery = await call('project_query', { command: { object: 'taskMacros', action: 'get', name: 'lottery' } });
  assert.equal(lottery.value.mode, 'random'); assert.equal(lottery.value.candidates.length, 2);
  assert.equal((await call('project_export', { format: 'runtime' })).ok, true);
  const noFallback = await call('project_execute', { expectedRevision: weighted.revision, command: { object: 'taskMacros', action: 'update', name: 'lottery', values: { fallback: null } } });
  assert.equal(noFallback.ok, true); assert.match((await call('project_export', { format: 'yaml' })).value, /fallback: null/);
  assert.equal(stderr, '');
});

test('local HTTP bridge imports into the shared service, not a second project', async (t) => {
  const root = await directory(t), dist = join(root, 'web'); await mkdir(dist); await writeFile(join(dist, 'index.html'), '<html><head></head><body></body></html>');
  const service = await createProjectService({ root }), web = await startWebServer(service, { port: 0, dist }); t.after(() => web.close());
  const bridge = await connectProjectService(web.url);
  const result = await bridge.importBlueprint({ yaml: await example(), expectedRevision: 0 }); assert.equal(result.ok, true);
  assert.equal((await service.state()).value.project.name, '生活與薪資測試');
  assert.equal((await bridge.exportData({ format: 'yaml' })).value, (await service.exportData({ format: 'yaml' })).value);
});

test('YAML paths stay under root, preview is read-only, and simulation mode cannot replace', async (t) => {
  const root = await directory(t), service = await createProjectService({ root, mode: 'simulation' });
  const preview = await service.importBlueprint({ yaml: await example(), preview: true }); assert.equal(preview.ok, true); assert.equal(preview.revision, 0);
  assert.equal((await service.importBlueprint({ yaml: await example(), expectedRevision: 0 })).errors[0].code, 'projectModeLocked');
  assert.equal((await service.importBlueprint({ path: '../outside.yaml', preview: true })).errors[0].code, 'outsideProjectRoot');
  assert.equal((await service.importBlueprint({ path: 'input.json', preview: true })).errors[0].code, 'invalidExtension');
  assert.equal((await service.importBlueprint({ yaml: '', path: 'input.yaml', preview: true })).errors[0].code, 'blueprintInputRequired');
});
