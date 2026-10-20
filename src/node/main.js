import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createProjectService } from './projectService.js';
import { createMcpServer } from './mcp/server.js';

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    root: { type: 'string', default: process.cwd() }, project: { type: 'string' }, mode: { type: 'string', default: 'user' }, language: { type: 'string', default: 'en' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    process.stdout.write('Usage: node src/node/main.js [--root DIRECTORY] [--project FILE.json] [--mode user|environment|simulation|all] [--language en|zh-TW]\nMCP stdio server. One in-memory project per process. GUI live synchronization is not enabled.\n');
    return;
  }
  if (!['en', 'zh-TW'].includes(values.language)) throw new Error('language must be en or zh-TW');
  const service = await createProjectService({ root: values.root, mode: values.mode, language: values.language });
  if (values.project) {
    const loaded = await service.openProject({ path: values.project, expectedRevision: 0 });
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  }
  const server = createMcpServer(service);
  await server.connect(new StdioServerTransport());
  return { server, service };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`character-schedule-editor: ${error.message}\n`); process.exitCode = 1; });
}
