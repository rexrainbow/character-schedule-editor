import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createProjectService } from './projectService.js';
import { createMcpServer } from './mcp/server.js';
import { startWebServer } from './web/server.js';
import { connectProjectService } from './web/client.js';

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    root: { type: 'string', default: process.cwd() }, project: { type: 'string' }, mode: { type: 'string', default: 'user' }, language: { type: 'string', default: 'en' }, help: { type: 'boolean', short: 'h' },
    web: { type: 'boolean' }, port: { type: 'string', default: '5175' }, 'no-stdio': { type: 'boolean' }, connect: { type: 'string' },
  } });
  if (values.help) {
    process.stdout.write('Usage: node src/node/main.js [--root DIRECTORY] [--project FILE.json] [--mode user|environment|simulation|all] [--language en|zh-TW] [--web --port 5175] [--no-stdio]\nOr: node src/node/main.js --connect http://127.0.0.1:5175\n--web serves the synchronized GUI; --connect bridges MCP to that same service.\n');
    return;
  }
  if (!['en', 'zh-TW'].includes(values.language)) throw new Error('language must be en or zh-TW');
  if (values.connect && (values.web || values.project || values['no-stdio'])) throw new Error('--connect cannot create another project or web server.');
  if (values['no-stdio'] && !values.web) throw new Error('--no-stdio requires --web');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const service = values.connect ? await connectProjectService(values.connect) : await createProjectService({ root: values.root, mode: values.mode, language: values.language });
  if (values.project) {
    const loaded = await service.openProject({ path: values.project, expectedRevision: 0 });
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  }
  const web = values.web ? await startWebServer(service, { port }) : null;
  if (web) process.stderr.write(`Schedule GUI: ${web.url}\n`);
  const server = values['no-stdio'] ? null : createMcpServer(service);
  if (server) {
    const previous = server.server.onclose;
    server.server.onclose = () => { previous?.(); web?.close(); };
    try { await server.connect(new StdioServerTransport()); } catch (error) { await web?.close(); throw error; }
  }
  return { server, service, web, close: async () => { await server?.close(); if (!server) await web?.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((app) => {
    if (app) for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().catch(() => { process.exitCode = 1; }); });
  }).catch((error) => { process.stderr.write(`character-schedule-editor: ${error.message}\n`); process.exitCode = 1; });
}
