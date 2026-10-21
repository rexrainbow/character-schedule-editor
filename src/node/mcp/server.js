import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools.js';
import projectSchema from '../../schemas/slots.schema.json' with { type: 'json' };
import runtimeSchema from '../../schemas/runtime.schema.json' with { type: 'json' };
import environmentSchema from '../../schemas/environment.schema.json' with { type: 'json' };
import { blueprintSchema } from '../../core/blueprint/schema.js';
import { readFile } from 'node:fs/promises';

export function createMcpServer(service) {
  const server = new McpServer({ name: 'character-schedule-editor', version: '0.1.0' }, {
    instructions: 'Use project_status, discover commands via project_commands, then query/edit with project_execute or project_batch. Every mutation needs expectedRevision. Changes stay in memory until project_save. Command name is the persistent symbol; display_name is the optional human label. Targets and references accept UUIDs or exact names within their object type. Read schedule://guide/names. Other working fields include slotIds, rows, dayId, while project_open/save use the project JSON Schema. Built-in day purposes are manually authored, never inferred from assignments. If webUrl is present in status, that local GUI shares this service. GitHub Pages remains independent. A GUI may have unfinished fields; MCP mutations, saves and exports still require full validation.',
  });
  registerProjectTools(server, service);
  for (const [name, schema] of Object.entries({ project: projectSchema, runtime: runtimeSchema, environment: environmentSchema, blueprint: blueprintSchema })) {
    const uri = `schedule://schema/${name}`;
    server.registerResource(`${name}-schema`, uri, { mimeType: 'application/schema+json', description: `${name} JSON Schema; command queries return core working data rather than this serialized shape.` }, async () => ({ contents: [{ uri, mimeType: 'application/schema+json', text: JSON.stringify(schema, null, 2) }] }));
  }
  for (const [name, file] of Object.entries({ names: '../../../docs/NAMING.md', blueprint: '../../../docs/BLUEPRINT.md', 'blueprint-example': '../../../docs/recipes/examples/life-simulation.yaml' })) {
    const uri = `schedule://guide/${name}`;
    server.registerResource(name, uri, { mimeType: name !== 'blueprint-example' ? 'text/markdown' : 'application/yaml', description: 'YAML blueprint semantics, expression grammar and rebuild example. No UUIDs or icons.' }, async () => ({ contents: [{ uri, mimeType: name !== 'blueprint-example' ? 'text/markdown' : 'application/yaml', text: await readFile(new URL(file, import.meta.url), 'utf8') }] }));
  }
  return server;
}
