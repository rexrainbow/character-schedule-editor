import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools.js';
import projectSchema from '../../schemas/slots.schema.json' with { type: 'json' };
import runtimeSchema from '../../schemas/runtime.schema.json' with { type: 'json' };
import environmentSchema from '../../schemas/environment.schema.json' with { type: 'json' };
import { blueprintSchema } from '../../core/blueprint/schema.js';
import { readFile } from 'node:fs/promises';

export function createMcpServer(service) {
  const server = new McpServer({ name: 'character-schedule-editor', version: '0.1.0' }, {
    instructions: 'Use project_status, discover commands via project_commands, then query/edit with project_execute or project_batch. Every mutation needs expectedRevision. Changes stay in memory until project_save. Command name is the persistent symbol; display_name is the optional human label. Targets and references accept UUIDs or exact names within their object type. Read schedule://guide/names. Before authoring executable schedules, read schedule://guide/system-semantics (capabilities), schedule://guide/engine-semantics (execution contract), and schedule://guide/blueprint (syntax). Schema validation alone does not specify execution order or resets. Other working fields include slotIds, rows, dayId, while project_open/save use the project JSON Schema. Built-in day purposes are manually authored, never inferred from assignments. If webUrl is present in status, that local GUI shares this service. GitHub Pages remains independent. A GUI may have unfinished fields; MCP mutations, saves and exports still require full validation.',
  });
  registerProjectTools(server, service);
  for (const [name, schema] of Object.entries({ project: projectSchema, runtime: runtimeSchema, environment: environmentSchema, blueprint: blueprintSchema })) {
    const uri = `schedule://schema/${name}`;
    server.registerResource(`${name}-schema`, uri, { mimeType: 'application/schema+json', description: `${name} JSON Schema; command queries return core working data rather than this serialized shape.` }, async () => ({ contents: [{ uri, mimeType: 'application/schema+json', text: JSON.stringify(schema, null, 2) }] }));
  }
  const guides = {
    names: { file: '../../../docs/NAMING.md', description: 'Persistent names, UUID references, display labels and uniqueness scopes.' },
    'system-semantics': { file: '../../../docs/SYSTEM_SEMANTICS.md', description: 'Capability overview and requirement-to-feature map. Read before choosing a recipe.' },
    'engine-semantics': { file: '../../../docs/ENGINE_SEMANTICS.md', description: 'Canonical execution contract: candidates, conditions, event priority, writes/truncation, interruption, reset timing and checkpoint recovery. Read with the blueprint schema.' },
    blueprint: { file: '../../../docs/BLUEPRINT.md', description: 'YAML syntax, expression grammar and declarative rebuild. Execution rules are in schedule://guide/engine-semantics.' },
    'expression-functions': { file: '../../../docs/EXPRESSION_FUNCTIONS.md', description: 'Parameterized numeric/string/Boolean expressions, randomRange/randomItem, local argument scope, seeded draws and checkpoint behavior.' },
    'blueprint-example': { file: '../../../docs/recipes/examples/life-simulation.yaml', mimeType: 'application/yaml', description: 'Rebuildable life/payroll example with one infinitely repeated week.' },
  };
  for (const [name, guide] of Object.entries(guides)) {
    const uri = `schedule://guide/${name}`, mimeType = guide.mimeType ?? 'text/markdown';
    server.registerResource(name, uri, { mimeType, description: guide.description }, async () => ({ contents: [{ uri, mimeType, text: await readFile(new URL(guide.file, import.meta.url), 'utf8') }] }));
  }
  return server;
}
