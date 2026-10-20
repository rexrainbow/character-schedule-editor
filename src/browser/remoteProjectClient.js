import { createProjectSession } from '../core/projectApi.js';
import { compileProject } from '../core/model.js';
import { draftChanges, sameData, stringifyWire, parseWire } from '../core/draftChanges.js';

/** Synchronous GUI working copy, with queued, versioned submissions to one server. */
export function createRemoteProjectClient(initialConfig, { fetchImpl = (...args) => fetch(...args), createEvents = (url) => new EventSource(url), requestTimeout = 30000 } = {}) {
  const local = createProjectSession(undefined, { validation: 'draft' });
  let config = { ...initialConfig }, active = false, generation = 0, events, hold = false, deferred = null, processing = false, localChanges = false;
  let connection = { ready: false, connected: false, pending: 0, conflict: false, remoteUpdates: false, revision: 0, dirty: false, file: null, error: null, externalStamp: 0, resetEpoch: 0 };
  const listeners = new Set(), packets = [];
  let idle = Promise.resolve();
  const update = (patch) => { connection = { ...connection, ...patch }; for (const listener of [...listeners]) listener(); };
  function failure(code, message) { return { ok: false, errors: [{ key: code, code, path: '', message }] }; }
  async function call(method, args = {}) {
    const response = await fetchImpl(`${config.base}/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`, 'X-Schedule-Instance': config.instanceId }, body: stringifyWire(args), signal: AbortSignal.timeout(requestTimeout) });
    const result = parseWire(await response.text());
    if (!response.ok) throw Object.assign(new Error(result.errors?.[0]?.code ?? 'connectionLost'), { result });
    return result;
  }
  function accept(state, force = false) {
    if (!state.ok) throw new Error(state.errors?.[0]?.message ?? 'connectionLost');
    if (!force && state.revision < connection.revision) return;
    if (!force && (hold || processing || packets.length || localChanges)) { deferred = state; update({ remoteUpdates: state.revision > connection.revision, dirty: state.dirty, file: state.file }); return; }
    const changed = !sameData(local.getSnapshot(), state.value);
    if (changed) local.reset(state.value);
    deferred = null;
    update({ ...state, value: undefined, ready: true, connected: true, revision: state.revision, remoteUpdates: false, conflict: false, localChanges: false, error: null, externalStamp: connection.externalStamp + (changed ? 1 : 0) });
  }
  async function refresh(force = false, expectedGeneration = generation) {
    try {
      const state = await call('state');
      if (expectedGeneration !== generation) return;
      accept(state, force);
    } catch (error) { if (expectedGeneration === generation) update({ connected: false, error: error.message }); }
  }
  function conflict(result) { localChanges = true; update({ conflict: true, localChanges: true, error: result.errors?.[0]?.code ?? 'connectionLost' }); }
  async function drain() {
    if (processing) return idle;
    processing = true;
    try {
      while (packets.length && !connection.conflict) {
        const packet = packets.shift(); update({ pending: packets.length + 1 });
        let result;
        try { result = await call('guiChanges', { ...packet, expectedRevision: connection.revision }); }
        catch (error) { update({ connected: false }); result = error.result ?? failure('connectionLost', error.message); }
        if (!result.ok) { conflict(result); packets.length = 0; break; }
        update({ revision: result.revision, dirty: result.dirty, file: result.file, connected: true });
      }
    } finally { processing = false; update({ pending: 0 }); }
    if (!connection.conflict) { localChanges = false; update({ localChanges: false }); await refresh(); }
    return !connection.conflict;
  }
  function mutate(operation) {
    if (!connection.ready) return failure('connectionNotReady');
    const before = local.getSnapshot(), result = operation();
    if (!result.ok || sameData(before, local.getSnapshot())) return result;
    localChanges = true; update({ localChanges: true });
    if (connection.conflict || !connection.connected || connection.remoteUpdates && !processing) {
      conflict(failure(connection.connected ? 'revisionConflict' : 'connectionLost')); return result;
    }
    packets.push({ changes: draftChanges(before, local.getSnapshot()), mode: local.getMode() });
    if (!processing) idle = drain();
    else update({ pending: packets.length + 1 });
    return result;
  }
  async function action(method, args = {}, replace = false) {
    await idle;
    if (connection.conflict || localChanges) return failure('revisionConflict');
    if (!connection.connected) return failure('connectionLost');
    try {
      update({ busy: true });
      const result = await call(method, { ...args, expectedRevision: connection.revision });
      if (!result.ok) { if (result.errors?.[0]?.code === 'revisionConflict') conflict(result); return result; }
      const state = await call('state'); accept(state, replace);
      return result;
    } catch (error) { update({ connected: false, error: error.message }); return error.result ?? failure('connectionLost', error.message); }
    finally { update({ busy: false }); }
  }
  async function importDraft(draft) {
    const result = compileProject(draft);
    if (result.errors.length) return { ok: false, errors: result.errors };
    return action('guiImport', { data: result.data, discardChanges: true }, true);
  }
  function attachEvents() {
    events?.close();
    if (!createEvents) return;
    events = createEvents(`${config.base}/events?token=${encodeURIComponent(config.token)}`);
    events.onmessage = (event) => {
      const message = parseWire(event.data);
      if (message.instanceId !== config.instanceId) { update({ connected: false, error: 'serverRestarted' }); return; }
      // Fetch even for saved metadata, whose revision intentionally does not change.
      refresh();
    };
    events.onerror = () => update({ connected: false, error: 'connectionLost' });
    events.onopen = () => { update({ connected: true, error: null }); refresh(); };
  }
  const api = {
    ...local,
    isRemote: true,
    getConnectionState: () => connection,
    subscribeConnection: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    replaceDraft: (next) => mutate(() => local.replaceDraft(next)),
    reset: importDraft,
    loadDocument: (data) => action('guiImport', { data, discardChanges: true }, true),
    environment: { ...local.environment, import: (data) => mutate(() => local.environment.import(data)) },
    start() {
      active = true; const current = ++generation;
      refresh(true, current).then(() => { if (active && current === generation) attachEvents(); });
      return () => { active = false; generation++; events?.close(); };
    },
    setHold(value) {
      hold = value;
      if (!hold && deferred && !processing && !localChanges) accept(deferred);
    },
    async reload() {
      await idle;
      generation++; events?.close();
      try {
        const response = await fetchImpl(`${config.base}/config`, { cache: 'no-store', signal: AbortSignal.timeout(requestTimeout) });
        const next = await response.json(); if (!response.ok || next.protocol !== 1) throw new Error('connectionLost');
        config = { ...config, ...next };
        const state = await call('state');
        if (!state.ok) return state;
        localChanges = false; packets.length = 0; accept(state, true);
        update({ resetEpoch: connection.resetEpoch + 1 }); attachEvents(); return { ok: true };
      } catch (error) { update({ connected: false, error: error.message }); return failure('connectionLost', error.message); }
    },
    flush: async () => { await idle; return !connection.conflict && !localChanges && connection.connected; },
    serverAction: action,
  };
  return api;
}
