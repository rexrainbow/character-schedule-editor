import fs from 'node:fs';
const project = JSON.parse(fs.readFileSync(new URL('../src/slots.schema.json', import.meta.url), 'utf8'));
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const schema = {
  $schema: project.$schema, title: 'Character Schedule Environment Schema', type: 'object',
  required: ['format_version', 'environment', 'settings', 'operand_nodes', 'tasks'],
  properties: { format_version: { const: 1 }, environment: ref('environment_info'), settings: ref('project_settings'), operand_nodes: project.properties.operand_nodes, expression_macros: project.properties.expression_macros, tasks: project.properties.tasks, builtin_tasks: project.properties.builtin_tasks },
  additionalProperties: false,
};
const used = new Set();
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref?.startsWith('#/$defs/')) { const name = value.$ref.slice(8); if (!used.has(name)) { used.add(name); visit(project.$defs[name]); } }
  for (const child of Object.values(value)) visit(child);
}
visit(schema); schema.$defs = Object.fromEntries([...used].map((name) => [name, project.$defs[name]]));
// An environment file can never contain application-layer nodes.
for (const name of ['group_node', 'value_node']) schema.$defs[name].properties.scope = { const: 'environment' };
schema.$defs.expression_macro.properties.scope = { const: 'environment' };
fs.writeFileSync(new URL('../src/environment.schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');
