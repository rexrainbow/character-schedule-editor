import { parseWire, stringifyWire } from '../../core/draftChanges.js';

// A stdio MCP bridge attaches to the already-running GUI service, not a new store.
export async function connectProjectService(input) {
  const url = new URL(input);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Connect to a local HTTP project service.');
  const base = new URL('/__schedule/', url);
  const configResponse = await fetch(new URL('config', base), { signal: AbortSignal.timeout(10000) });
  const config = await configResponse.json();
  if (!configResponse.ok || config.protocol !== 1 || !config.token || !config.instanceId) throw new Error('Invalid project service.');
  const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'X-Schedule-Instance': config.instanceId };
  const catalogResponse = await fetch(new URL('catalog', base), { headers, signal: AbortSignal.timeout(10000) });
  const catalog = await catalogResponse.json(); if (!catalog.ok) throw new Error('Cannot read command catalog.');
  const api = { commands: (object) => structuredClone(catalog.value.filter((item) => !object || item.object === object)) };
  for (const method of ['status', 'execute', 'batch', 'setMode', 'newProject', 'openProject', 'saveProject', 'exportData']) api[method] = async (args = {}) => {
    try {
      const response = await fetch(new URL(`api/${method}`, base), { method: 'POST', headers, body: stringifyWire(args), signal: AbortSignal.timeout(30000) });
      return parseWire(await response.text());
    } catch (error) { return { ok: false, errors: [{ code: 'connectionLost', path: '', message: error.message }] }; }
  };
  return api;
}
