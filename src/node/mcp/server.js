import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools.js';
import projectSchema from '../../schemas/slots.schema.json' with { type: 'json' };
import runtimeSchema from '../../schemas/runtime.schema.json' with { type: 'json' };
import environmentSchema from '../../schemas/environment.schema.json' with { type: 'json' };

export function createMcpServer(service) {
  const server = new McpServer({ name: 'character-schedule-editor', version: '0.1.0' }, {
    instructions: 'Use project_status, discover commands via project_commands, then query/edit with project_execute or project_batch. Every mutation needs expectedRevision. Changes stay in memory until project_save. Command values use the core API shape (name, slotIds, rows, dayId), while project_open/save use the project JSON Schema. Built-in day purposes are manually authored, never inferred from assignments. If webUrl is present in status, that local GUI shares this service. GitHub Pages remains independent. A GUI may have unfinished fields; MCP mutations, saves and exports still require full validation.',
  });
  registerProjectTools(server, service);
  for (const [name, schema] of Object.entries({ project: projectSchema, runtime: runtimeSchema, environment: environmentSchema })) {
    const uri = `schedule://schema/${name}`;
    server.registerResource(`${name}-schema`, uri, { mimeType: 'application/schema+json', description: `${name} JSON Schema; command queries return core working data rather than this serialized shape.` }, async () => ({ contents: [{ uri, mimeType: 'application/schema+json', text: JSON.stringify(schema, null, 2) }] }));
  }
  return server;
}
