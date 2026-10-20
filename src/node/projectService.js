import { createProjectSession } from '../core/projectApi.js';
import { createProject } from '../core/model.js';
import { commandCatalog, inspectCommand, executeCommand, executeBatch } from '../core/commands.js';
import { translator } from '../i18n/index.js';
import { createProjectFiles, serviceError } from './projectFiles.js';

/** One authoritative project per service; all requests, including I/O, are queued. */
export async function createProjectService({ root = process.cwd(), mode = 'user', language = 'en' } = {}) {
  const files = await createProjectFiles(root);
  const session = createProjectSession(undefined, { mode, validation: 'strict', t: translator(language) });
  let revision = 0, file = null, fileHash, baseline = JSON.stringify(session.toDocument().data), queue = Promise.resolve();
  const listeners = new Set();
  const dirty = () => JSON.stringify(session.toDocument().data) !== baseline;
  const status = () => ({ revision, mode: session.getMode(), file, dirty: dirty(), root: files.root });
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
    const methods = { project: () => session.toDocument(), environment: () => session.exportEnvironment(), runtime: () => session.exportRuntime(), report: () => session.exportReport({ includeUnreferenced: !!options.includeUnreferenced }) };
    if (!Object.hasOwn(methods, format)) throw serviceError('invalidExportFormat', 'Choose project, environment, runtime or report.');
    return methods[format]();
  }
  const api = {
    status: () => request(() => ok()),
    commands: (object) => commandCatalog().filter((item) => !object || item.object === object),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    execute: ({ command, expectedRevision } = {}) => request(() => {
      const checked = inspectCommand(command);
      if (!checked.ok) return wrap(checked);
      expected(expectedRevision, checked.mutates);
      const oldRevision = revision, result = executeCommand(session, command);
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
      const result = session.reset(draft); if (!result.ok) return wrap(result);
      file = null; fileHash = undefined; baseline = JSON.stringify(session.toDocument().data); notify('new'); return ok();
    }),
    openProject: ({ path, expectedRevision, discardChanges = false } = {}) => request(async () => {
      expected(expectedRevision); protectDraft(discardChanges);
      const loaded = await files.readProject(path), result = session.loadDocument(loaded.data);
      if (!result.ok) return wrap(result);
      file = loaded.path; fileHash = loaded.hash; baseline = JSON.stringify(session.toDocument().data); notify('opened'); return ok();
    }),
    saveProject: ({ path, expectedRevision, overwrite = false } = {}) => request(async () => {
      expected(expectedRevision);
      const target = path ?? file;
      if (!target) throw serviceError('savePathRequired', 'Supply a path for the first save.');
      const canonical = await files.pathFor(target), result = exported('project');
      if (result.errors.length) return wrap({ ok: false, errors: result.errors });
      const saved = await files.write(canonical, JSON.stringify(result.data, null, 2) + '\n', { expectedHash: canonical === file ? fileHash : undefined, overwrite });
      file = saved.path; fileHash = saved.hash; baseline = JSON.stringify(result.data); notify('saved'); return ok({ path: file });
    }),
    exportData: ({ format, path, expectedRevision, overwrite = false, includeUnreferenced = false } = {}) => request(async () => {
      expected(expectedRevision, !!path);
      const result = exported(format, { includeUnreferenced });
      if (result.errors.length) return wrap({ ok: false, errors: result.errors });
      if (!path) return ok(result.data);
      const extension = format === 'report' ? '.md' : '.json', canonical = await files.pathFor(path, extension);
      if (canonical === file) throw serviceError('projectFileIsReserved', 'Use project_save to update the open project file.');
      const content = format === 'report' ? result.data : JSON.stringify(result.data, null, 2) + '\n';
      const saved = await files.write(canonical, content, { extension, overwrite });
      return ok({ path: saved.path });
    }),
  };
  return api;
}
