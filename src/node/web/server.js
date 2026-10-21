import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { stringifyWire, parseWire } from '../../core/draftChanges.js';

const methods = ['execute', 'batch', 'status', 'state', 'setMode', 'newProject', 'openProject', 'saveProject', 'exportData', 'importBlueprint', 'guiChanges', 'guiImport'];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

export async function startWebServer(service, { port = 5175, dist = fileURLToPath(new URL('../../../dist/', import.meta.url)) } = {}) {
  const directory = await realpath(dist);
  const index = await readFile(resolve(directory, 'index.html'), 'utf8');
  const token = randomBytes(32).toString('hex'), streams = new Set();
  let origin;
  function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(stringifyWire(data));
  }
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host;
      const expectedPort = server.address()?.port;
      if (![ `127.0.0.1:${expectedPort}`, `localhost:${expectedPort}` ].includes(host) || req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, { ok: false, errors: [{ code: 'invalidOrigin' }] }, 403);
      const url = new URL(req.url, origin);
      if (url.pathname === '/__schedule/config' && req.method === 'GET') return json(res, { protocol: 1, token, instanceId: (await service.status()).instanceId });
      if (url.pathname.startsWith('/__schedule/')) {
        if (req.headers.authorization !== `Bearer ${token}` && !(url.pathname === '/__schedule/events' && url.searchParams.get('token') === token)) return json(res, { ok: false, errors: [{ code: 'unauthorized' }] }, 401);
        if (url.pathname === '/__schedule/events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write(`data: ${stringifyWire(await service.status())}\n\n`); streams.add(res);
          const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000); heartbeat.unref();
          req.on('close', () => { clearInterval(heartbeat); streams.delete(res); }); return;
        }
        if (url.pathname === '/__schedule/catalog' && req.method === 'GET') return json(res, { ok: true, value: service.commands() });
        const method = url.pathname.slice('/__schedule/api/'.length);
        if (req.method !== 'POST' || !url.pathname.startsWith('/__schedule/api/') || !methods.includes(method)) return json(res, { ok: false, errors: [{ code: 'unknownEndpoint' }] }, 404);
        if (req.headers['x-schedule-instance'] !== (await service.status()).instanceId) return json(res, { ok: false, errors: [{ code: 'serverRestarted' }] }, 409);
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, { ok: false, errors: [{ code: 'invalidContentType' }] }, 415);
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) return json(res, { ok: false, errors: [{ code: 'requestTooLarge' }] }, 413); chunks.push(chunk); }
        // Buffer chunks before UTF-8 decoding to preserve split multibyte names.
        let args;
        try { args = parseWire(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, { ok: false, errors: [{ code: 'invalidJson' }] }, 400); }
        return json(res, await service[method](args));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { ok: false }, 405);
      if (url.pathname === '/' || url.pathname === '/index.html') {
        // This marker exists only in HTML served here. GitHub Pages never probes localhost.
        const config = JSON.stringify({ base: '/__schedule', token, instanceId: (await service.status()).instanceId });
        const html = index.replace('<head>', `<head><script>window.__SCHEDULE_CONNECTION__=${config};</script>`);
        res.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(req.method === 'HEAD' ? undefined : html);
      }
      const path = await realpath(resolve(directory, '.' + decodeURIComponent(url.pathname)));
      const part = relative(directory, path);
      if (part === '..' || part.startsWith('../') || part.startsWith('..\\') || isAbsolute(part) || !(await stat(path)).isFile()) return json(res, { ok: false }, 404);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(path));
    } catch (error) { if (!res.headersSent) json(res, { ok: false, errors: [{ code: error.code === 'ENOENT' ? 'notFound' : 'webRequestFailed', message: error.message }] }, error.code === 'ENOENT' ? 404 : 500); else res.end(); }
  });
  const unsubscribe = service.subscribe((event) => { for (const stream of streams) stream.write(`data: ${stringifyWire(event)}\n\n`); });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { unsubscribe(); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`; service.setWebUrl(origin);
  let closing;
  return { url: origin, close() {
    if (!closing) closing = (async () => { unsubscribe(); for (const stream of streams) stream.end(); streams.clear(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); service.setWebUrl(null); })();
    return closing;
  } };
}
