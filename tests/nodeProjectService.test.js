import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProjectService } from '../src/node/projectService.js';
import { createProjectFiles } from '../src/node/projectFiles.js';
import { createProjectSession } from '../src/core/projectApi.js';

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'schedule-mcp-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const createDay = { object: 'days', action: 'create', values: { name: 'Work' } };

test('service serializes concurrent edits, checks revisions and emits only committed changes', async (t) => {
  const service = await createProjectService({ root: await directory(t) }), changes = [];
  const unsubscribe = service.subscribe((event) => changes.push(event));
  const [first, second] = await Promise.all([service.execute({ command: createDay, expectedRevision: 0 }), service.execute({ command: createDay, expectedRevision: 0 })]);
  assert.equal(first.ok, true); assert.equal(first.revision, 1); assert.equal(first.dirty, true);
  assert.equal(second.ok, false); assert.equal(second.errors[0].code, 'revisionConflict');
  assert.equal(changes.length, 1);
  assert.equal((await service.execute({ command: createDay })).errors[0].code, 'revisionRequired');
  assert.equal((await service.execute({ command: { object: 'days', action: 'list' } })).value.length, 1);
  const failed = await service.batch({ expectedRevision: 1, commands: [{ object: 'days', action: 'update', id: first.id, values: { name: 'Rollback' } }, { object: 'days', action: 'remove', id: crypto.randomUUID() }] });
  assert.equal(failed.ok, false); assert.equal(failed.revision, 1); assert.equal(changes.length, 1);
  assert.equal((await service.setMode({ mode: 'environment', expectedRevision: 1 })).revision, 2);
  assert.equal((await service.execute({ command: createDay, expectedRevision: 2 })).ok, false);
  assert.equal((await service.execute({ command: { object: 'tasks', action: 'create', values: { display_name: 'Engine task' } }, expectedRevision: 2 })).ok, true);
  unsubscribe();
});

test('project save/open are validated, atomic, dirty-aware and detect external file changes', async (t) => {
  const root = await directory(t), service = await createProjectService({ root });
  const created = await service.execute({ command: createDay, expectedRevision: 0 });
  assert.equal((await service.saveProject({ expectedRevision: 1 })).errors[0].code, 'savePathRequired');
  const saved = await service.saveProject({ path: 'project.json', expectedRevision: 1 });
  assert.equal(saved.ok, true); assert.equal(saved.dirty, false);
  const text = await readFile(join(root, 'project.json'), 'utf8');
  assert.equal(JSON.parse(text).day_schedules[created.id].display_name, 'Work');
  await service.execute({ command: { object: 'days', action: 'update', id: created.id, values: { name: 'Unsaved' } }, expectedRevision: 1 });
  assert.equal((await service.openProject({ path: 'project.json', expectedRevision: 2 })).errors[0].code, 'unsavedChanges');
  await writeFile(join(root, 'project.json'), text + '\n');
  const conflict = await service.saveProject({ expectedRevision: 2, overwrite: true });
  assert.equal(conflict.errors[0].code, 'fileChanged'); assert.equal(conflict.dirty, true);
  assert.equal(await readFile(join(root, 'project.json'), 'utf8'), text + '\n');
  assert.equal((await service.saveProject({ path: 'copy.json', expectedRevision: 2 })).ok, true);
  await writeFile(join(root, 'invalid.json'), '{');
  assert.equal((await service.openProject({ path: 'invalid.json', expectedRevision: 2 })).errors[0].code, 'invalidJson');
  await writeFile(join(root, 'invalid.json'), '{}');
  const rejected = await service.openProject({ path: 'invalid.json', expectedRevision: 2 }); assert.equal(rejected.ok, false); assert.equal(rejected.revision, 2);
  const loaded = await service.openProject({ path: 'project.json', expectedRevision: 2 }); assert.equal(loaded.ok, true); assert.equal(loaded.revision, 3); assert.equal(loaded.dirty, false);
  assert.equal((await service.saveProject({ expectedRevision: 3 })).ok, true);
  assert.equal(await readFile(join(root, 'project.json'), 'utf8'), text);
  assert.ok((await readdir(root)).every((name) => !name.endsWith('.tmp')));
});

test('exports use the same core compilations, preserve unsaved status and protect the current project file', async (t) => {
  const root = await directory(t), service = await createProjectService({ root, language: 'zh-TW' });
  await service.saveProject({ path: 'project.json', expectedRevision: 0 });
  const created = await service.execute({ command: createDay, expectedRevision: 0 });
  const report = await service.exportData({ format: 'report', path: 'report.md', expectedRevision: 1, includeUnreferenced: true });
  assert.equal(report.ok, true); assert.equal(report.dirty, true);
  assert.match(await readFile(join(root, 'report.md'), 'utf8'), /適用用途: 主要/);
  const runtime = await service.exportData({ format: 'runtime' }); assert.equal(runtime.ok, true); assert.equal(runtime.value.days[created.id].purposes, undefined);
  assert.equal((await service.exportData({ format: 'runtime', path: 'project.json', expectedRevision: 1, overwrite: true })).errors[0].code, 'projectFileIsReserved');
  assert.equal((await service.exportData({ format: 'runtime', path: 'runtime.json' })).errors[0].code, 'revisionRequired');
  assert.equal((await service.newProject({ expectedRevision: 1 })).errors[0].code, 'unsavedChanges');
  const fresh = await service.newProject({ name: 'New', slotsPerDay: 5, expectedRevision: 1, discardChanges: true }); assert.equal(fresh.ok, true); assert.equal(fresh.revision, 2);
  assert.equal((await service.execute({ command: { object: 'settings', action: 'get' } })).value.settings.slots_per_day, 5);
});

test('file access stays within root, checks existing outputs and validates symlink targets', async (t) => {
  const root = await directory(t), outside = await directory(t), files = await createProjectFiles(root);
  await assert.rejects(files.write('../escape.json', '{}'), { code: 'outsideProjectRoot' });
  await assert.rejects(files.write('code.js', '{}'), { code: 'invalidExtension' });
  await files.write('output.json', '{}');
  await assert.rejects(files.write('output.json', '[]'), { code: 'fileExists' });
  await files.write('output.json', '[]', { overwrite: true });
  await writeFile(join(outside, 'external.json'), JSON.stringify(createProjectSession().toDocument().data));
  try { await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.diagnostic('Symlink assertion unavailable on this host.'); return; } throw error; }
  await assert.rejects(files.readProject('link/external.json'), { code: 'outsideProjectRoot' });
});
