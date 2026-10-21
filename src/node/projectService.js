import { createProjectSession } from '../core/projectApi.js';
import { createProject } from '../core/model.js';
import { commandCatalog, inspectCommand, executeCommand, executeBatch } from '../core/commands.js';
import { translator } from '../i18n/index.js';
import { createProjectFiles, serviceError } from './projectFiles.js';
import { applyDraftChanges, stringifyWire } from '../core/draftChanges.js';
import { importBlueprint } from '../core/blueprint/index.js';

/** One authoritative project per service; all requests, including I/O, are queued. */
export async function createProjectService({ root = process.cwd(), mode = 'user', language = 'en' } = {}) {
  const files = await createProjectFiles(root);
  const session = createProjectSession(undefined, { mode, validation: 'draft', t: translator(language) });
  const instanceId = crypto.randomUUID();
  let webUrl = null;
  let revision = 0, file = null, fileHash, baseline = stringifyWire(session.getSnapshot()), queue = Promise.resolve();
  const listeners = new Set();
  const dirty = () => stringifyWire(session.getSnapshot()) !== baseline;
  const status = () => ({ instanceId, webUrl, revision, mode: session.getMode(), file, dirty: dirty(), root: files.root });
  function notify(kind) { for (const listener of [...listeners]) { try { listener({ kind, ...status() }); } catch { /* Subscribers cannot invalidate edits. */ } } }
  session.subscribe(() => { revision++; });
  function expected(value, required = true) {
    if (value === undefined && !required) return;
    if (!Number.isSafeInteger(value) || value < 0) throw serviceError('revisionRequired', 'Supply the nonnegative expectedRevision from project_status or the previous result.');
    if (value !== revision) throw serviceError('revisionConflict', `Expected revision ${value}, current revision is ${revision}. Refresh before editing.`);
  }
  function protectDraft(discard) { if (dirty() && !discard) throw serviceError('unsavedChanges', 'Save the project or explicitly pass discardChanges:true before replacing it.'); }
  function ok(value = null, extra = {}) { return { ok: true, ...status(), value, errors: [], warnings: [], ...extra }; }
  function wrap(result) {
    const { draft, nodes, blocked, ...publicResult } = result;
    return { ...status(), ...publicResult };
  }
  function request(operation) {
    const task = queue.then(async () => {
      try { return await operation(); }
      catch (error) { return { ok: false, ...status(), value: null, errors: [{ code: error.code ?? 'serviceError', path: error.path ?? '', message: error.message }], warnings: [] }; }
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
  }
  function exported(format, options = {}) {
    const methods = { project: () => session.toDocument(), environment: () => session.exportEnvironment(), runtime: () => session.exportRuntime(), report: () => session.exportReport({ includeUnreferenced: !!options.includeUnreferenced }), yaml: () => session.exportBlueprint() };
    if (!Object.hasOwn(methods, format)) throw serviceError('invalidExportFormat', 'Choose project, environment, runtime, report or yaml.');
    return methods[format]();
  }
  const api = {
    status: () => request(() => ok()),
    state: () => request(() => ok(structuredClone(session.getSnapshot()))),
    setWebUrl: (url) => { webUrl = url; },
    commands: (object) => commandCatalog().filter((item) => !object || item.object === object),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    execute: ({ command, expectedRevision } = {}) => request(() => {
      const checked = inspectCommand(command);
      if (!checked.ok) return wrap(checked);
      expected(expectedRevision, checked.mutates);
      const oldRevision = revision;
      const batch = checked.mutates ? executeBatch(session, [command]) : null;
      const result = batch ? batch.ok ? { ...batch.value[0], warnings: batch.warnings } : batch : executeCommand(session, command);
      if (revision !== oldRevision) notify('changed');
      return wrap(result);
    }),
    batch: ({ commands, expectedRevision } = {}) => request(() => {
      expected(expectedRevision);
      const oldRevision = revision, result = executeBatch(session, commands);
      if (revision !== oldRevision) notify('changed');
      return wrap(result);
    }),
    setMode: ({ mode, expectedRevision } = {}) => request(() => {
      expected(expectedRevision);
      const previous = session.getMode(); session.setMode(mode);
      if (previous !== mode) { revision++; notify('mode'); }
      return ok();
    }),
    newProject: ({ name, slotsPerDay = 3, expectedRevision, discardChanges = false } = {}) => request(() => {
      expected(expectedRevision); protectDraft(discardChanges);
      const draft = createProject();
      if (name !== undefined) draft.project.name = name;
      draft.project.settings.slots_per_day = slotsPerDay;
      const validated = createProjectSession(draft).validate(); if (validated.errors.length) return wrap({ ok: false, errors: validated.errors });
      const result = session.reset(draft); if (!result.ok) return wrap(result);
      file = null; fileHash = undefined; baseline = stringifyWire(session.getSnapshot()); notify('new'); return ok();
    }),
    openProject: ({ path, expectedRevision, discardChanges = false } = {}) => request(async () => {
      expected(expectedRevision); protectDraft(discardChanges);
      const loaded = await files.readProject(path), result = session.loadDocument(loaded.data);
      if (!result.ok) return wrap(result);
      file = loaded.path; fileHash = loaded.hash; baseline = stringifyWire(session.getSnapshot()); notify('opened'); return ok();
    }),
    saveProject: ({ path, expectedRevision, overwrite = false } = {}) => request(async () => {
      expected(expectedRevision);
      const target = path ?? file;
      if (!target) throw serviceError('savePathRequired', 'Supply a path for the first save.');
      const canonical = await files.pathFor(target), result = exported('project');
      if (result.errors.length) return wrap({ ok: false, errors: result.errors });
      const saved = await files.write(canonical, JSON.stringify(result.data, null, 2) + '\n', { expectedHash: canonical === file ? fileHash : undefined, overwrite });
      file = saved.path; fileHash = saved.hash; baseline = stringifyWire(session.getSnapshot()); notify('saved'); return ok({ path: file });
    }),
    guiChanges: ({ changes, mode, expectedRevision } = {}) => request(() => {
      expected(expectedRevision);
      if (!['user', 'environment', 'simulation'].includes(mode)) throw serviceError('invalidProjectMode', 'Invalid GUI editing mode.');
      const previousMode = session.getMode(), oldRevision = revision;
      let result;
      try { session.setMode(mode); result = session.replaceDraft(applyDraftChanges(session.getSnapshot(), changes)); }
      finally { session.setMode(previousMode); }
      if (revision !== oldRevision) notify('changed');
      return wrap(result);
    }),
    guiImport: ({ data, expectedRevision, discardChanges = false } = {}) => request(() => {
      expected(expectedRevision); protectDraft(discardChanges);
      const result = session.loadDocument(data); if (!result.ok) return wrap(result);
      file = null; fileHash = undefined; baseline = null; notify('imported'); return ok();
    }),
    importBlueprint: ({ yaml, path, preview = false, expectedRevision, discardChanges = false } = {}) => request(async () => {
      expected(expectedRevision, !preview);
      if ((yaml !== undefined) === (path !== undefined)) throw serviceError('blueprintInputRequired', 'Supply exactly one of yaml or path.');
      const text = path === undefined ? yaml : (await files.readText(path, /\.yml$/i.test(path) ? '.yml' : '.yaml')).text;
      const compiled = importBlueprint(text);
      if (compiled.errors.length) return wrap({ ok: false, errors: compiled.errors });
      const summary = { name: compiled.data.project.name, replacesProject: true, counts: Object.fromEntries(['operand_nodes', 'expression_macros', 'tasks', 'task_macros', 'slots', 'day_schedules', 'week_schedules', 'week_sequences', 'enum_definitions'].map((key) => [key, Object.keys(compiled.data[key] ?? {}).length])) };
      if (preview) return ok(summary);
      if (session.getMode() === 'simulation') throw serviceError('projectModeLocked', 'Simulation mode cannot import a blueprint.');
      protectDraft(discardChanges);
      const result = session.loadDocument(compiled.data); if (!result.ok) return wrap(result);
      file = null; fileHash = undefined; baseline = null; notify('imported'); return ok(summary);
    }),
    exportData: ({ format, path, expectedRevision, overwrite = false, includeUnreferenced = false } = {}) => request(async () => {
      expected(expectedRevision, !!path);
      const result = exported(format, { includeUnreferenced });
      if (result.errors.length) return wrap({ ok: false, errors: result.errors });
      if (!path) return ok(result.data);
      const extension = format === 'yaml' ? /\.yml$/i.test(path) ? '.yml' : '.yaml' : format === 'report' ? '.md' : '.json', canonical = await files.pathFor(path, extension);
      if (canonical === file) throw serviceError('projectFileIsReserved', 'Use project_save to update the open project file.');
      const content = ['report', 'yaml'].includes(format) ? result.data : JSON.stringify(result.data, null, 2) + '\n';
      const saved = await files.write(canonical, content, { extension, overwrite });
      return ok({ path: saved.path });
    }),
  };
  return api;
}
