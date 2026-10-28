import { z } from 'zod/v4';
import { inspectCommand } from '../../core/commands.js';

const revision = z.number().int().nonnegative().describe('Revision from project_status or a previous successful result.');
const command = z.record(z.string(), z.unknown()).describe('One exact command from project_commands. Uses core API field names, not project-file field names.');
const path = z.string().min(1).describe('File inside the configured root. Relative paths are resolved from that root.');
const mode = z.enum(['user', 'environment', 'simulation', 'all']);
const annotations = (readOnlyHint) => ({ readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false });
function response(result) {
  // Normalize optional JS fields into transport-safe JSON, without leaking stores.
  const data = JSON.parse(JSON.stringify(result));
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, ...(!data.ok ? { isError: true } : {}) };
}
export function registerProjectTools(server, service) {
  function tool(name, description, shape, readOnly, handler) {
    server.registerTool(name, { description, inputSchema: z.object(shape).strict(), annotations: annotations(readOnly) }, async (args) => response(await handler(args)));
  }
  tool('project_status', 'Get the current revision, editing mode, unsaved status, file and configured root. Start here.', {}, true, () => service.status());
  tool('project_commands', 'Discover allowed object/action commands. Filter by object to get exact JSON Schemas. No arbitrary JavaScript execution.', { object: z.string().optional(), action: z.string().optional(), includeSchema: z.boolean().optional() }, true, (args) => {
    const definitions = service.commands(args.object).filter((item) => !args.action || item.action === args.action);
    return { ok: true, value: (args.includeSchema ?? !!args.object) ? definitions : definitions.map(({ schema, ...item }) => item), errors: [] };
  });
  tool('project_query', 'Run a read-only command (list, get, references, uses, validate, snapshot, document). Mutation commands are rejected.', { command, expectedRevision: revision.optional() }, true, (args) => {
    const checked = inspectCommand(args.command);
    if (checked.ok && checked.mutates) return { ok: false, errors: [{ code: 'mutationInQuery', path: '/command', message: 'Use project_execute with expectedRevision for mutations.' }] };
    return service.execute(args);
  });
  tool('project_execute', 'Query or edit a project through its shared core API. Mutations require expectedRevision. Failed edits preserve project state. Discover commands before editing.', { command, expectedRevision: revision.optional() }, false, (args) => service.execute(args));
  tool('project_batch', 'Apply 1–1000 mutation commands atomically. Final validation happens once; any failure rolls back the entire batch. For references between newly created collections, supply client-generated UUIDs in create.values.id.', { commands: z.array(command).min(1).max(1000), expectedRevision: revision }, false, (args) => service.batch(args));
  tool('project_new', 'Replace the in-memory project with an empty project. Does not write a file. Unsaved changes require explicit discardChanges.', { name: z.string().min(1).optional(), slotsPerDay: z.number().int().positive().optional(), expectedRevision: revision, discardChanges: z.boolean().optional() }, false, (args) => service.newProject(args));
  tool('project_open', 'Read and validate a project JSON file before replacing the in-memory project. Unsaved changes require explicit discardChanges.', { path, expectedRevision: revision, discardChanges: z.boolean().optional() }, false, (args) => service.openProject(args));
  tool('project_save', 'Validate and atomically save the project. First save requires a path. Existing other destinations require overwrite:true; external changes to the open file are rejected.', { path: path.optional(), expectedRevision: revision, overwrite: z.boolean().optional() }, false, (args) => service.saveProject(args));
  tool('project_export', 'Export project/environment/runtime JSON, a Markdown report, or a UUID-free YAML blueprint (format:yaml). Without path returns data; with path writes a file and requires expectedRevision. Exporting does not mark the project saved.', { format: z.enum(['project', 'environment', 'runtime', 'report', 'yaml']), path: path.optional(), expectedRevision: revision.optional(), overwrite: z.boolean().optional(), includeUnreferenced: z.boolean().optional() }, false, (args) => service.exportData(args));
  tool('project_import_yaml', 'Compile a declarative YAML blueprint into a fresh project with new UUIDs and default icons. Supply yaml text OR a .yaml/.yml path. preview:true validates and returns counts without editing. Otherwise replaces the whole project, requires expectedRevision, and unsaved changes require discardChanges:true. Does not save. Read schedule://schema/blueprint and schedule://guide/blueprint for syntax, plus schedule://guide/engine-semantics for execution rules (selection, priority, interruption, truncation and resets).', { yaml: z.string().optional(), path: path.optional(), preview: z.boolean().optional(), expectedRevision: revision.optional(), discardChanges: z.boolean().optional() }, false, (args) => service.importBlueprint(args));
  tool('project_set_mode', 'Set user, environment, simulation (read-only), or all editing mode. Changing mode increments revision. Environment definitions remain protected in user mode.', { mode, expectedRevision: revision }, false, (args) => service.setMode(args));
}
