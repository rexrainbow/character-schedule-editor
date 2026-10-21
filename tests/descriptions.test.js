import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { importBlueprint, exportBlueprint } from '../src/core/blueprint/index.js';
import { compileProject, projectToDraft } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { compileEnvironment } from '../src/core/environmentModel.js';
import { compileReport } from '../src/core/reportModel.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { executeCommand } from '../src/core/commands.js';
import { slotLogicText, taskMacroLogicText } from '../src/core/logicOverviewModel.js';
import { formatComputedDefinition } from '../src/core/operandModel.js';
import { translator } from '../src/i18n/index.js';

const t = translator('en');
const good = (result) => { assert.deepEqual(result.errors, []); return result; };
async function sample() {
  const input = parse(await readFile(new URL('../docs/recipes/examples/life-simulation.yaml', import.meta.url), 'utf8'));
  for (const collection of ['variables', 'expressions', 'task_macros', 'slots', 'days', 'weeks', 'sequences']) for (const [key, value] of Object.entries(input[collection])) value.description = `${collection}.${key} intent\nsecond line`;
  for (const variable of Object.values(input.variables)) variable.scope = 'environment';
  input.environment = { name: 'Test environment', version: 'dev' };
  input.sequences.life.events.cold.description = 'Interrupt with cold day.';
  input.tasks = { notify: { description: 'Engine notification.', parameters: { message: { type: 'string', description: 'Message to show.' } } } };
  input.enums = { statuses: { description: 'Available statuses.', options: [{ value: 'ready' }] } };
  input.task_macros.work.steps[0].description = 'Spend stamina first.';
  input.task_macros.branch = { mode: 'branch', description: 'Select a task.', branches: [{ when: null, run: { macro: 'work' }, description: 'Fallback work.' }] };
  input.task_macros.priority = { mode: 'priority', description: 'First eligible.', candidates: [{ macro: 'branch', description: 'Try branch first.' }] };
  input.slots.work.branches[0].description = 'Perform work.';
  input.slots.priority = { mode: 'priority', candidates: [{ macro: 'priority', description: 'Select eligible activity.' }] };
  input.builtins.increment_variable = { description: 'Numeric update.', parameter_descriptions: { target: 'Writable target.' } };
  return input;
}

test('descriptions survive project, YAML and environment round trips; runtime contains no descriptions', async () => {
  const input = await sample(), imported = good(importBlueprint(stringify(input)));
  const saved = good(compileProject(imported.draft)).data;
  const draft = projectToDraft(saved);
  const output = parse(good(exportBlueprint(draft)).data);
  for (const collection of ['variables', 'expressions', 'task_macros', 'slots', 'days', 'weeks', 'sequences', 'tasks', 'enums']) for (const [key, value] of Object.entries(input[collection])) if (value.description) assert.equal(output[collection][key].description, value.description);
  assert.equal(output.expressions.weekly_pay.branches[0].description, input.expressions.weekly_pay.branches[0].description);
  assert.equal(output.task_macros.work.steps[0].description, 'Spend stamina first.');
  assert.equal(output.task_macros.branch.branches[0].description, 'Fallback work.');
  assert.equal(output.task_macros.priority.candidates[0].description, 'Try branch first.');
  assert.equal(output.slots.priority.candidates[0].description, 'Select eligible activity.');
  assert.equal(output.slots.work.branches[0].description, 'Perform work.');
  assert.equal(output.tasks.notify.parameters.message.description, 'Message to show.');
  assert.equal(output.sequences.life.events.cold.description, 'Interrupt with cold day.');
  assert.equal(output.builtins.increment_variable.description, 'Numeric update.');
  assert.equal(output.builtins.increment_variable.parameter_descriptions.target, 'Writable target.');
  assert.equal(good(exportBlueprint(good(importBlueprint(stringify(output))).draft)).data, good(exportBlueprint(draft)).data);
  const environment = good(compileEnvironment(draft)).data;
  assert.ok(Object.values(environment.operand_nodes).some((node) => node.description?.includes('variables.stamina')));
  assert.ok(Object.values(environment.tasks).some((task) => task.description === 'Engine notification.'));
  assert.doesNotMatch(JSON.stringify(good(compileRuntime(draft)).data), /"description":/);
  const report = good(compileReport(draft, { includeUnreferenced: true, t })).data;
  assert.match(report, /Interrupt with cold day/); assert.match(report, /Perform work/); assert.match(report, /days\.working intent/);
});

test('API reads and updates descriptions by name, rejects invalid types atomically, and omits empty descriptions', async () => {
  const imported = good(importBlueprint(stringify(await sample()))), session = createProjectSession(imported.draft, { mode: 'all' });
  good(executeCommand(session, { object: 'days', action: 'update', name: 'working', values: { description: 'New working-day intent.' } }));
  assert.equal(good(executeCommand(session, { object: 'days', action: 'get', name: 'working' })).value.description, 'New working-day intent.');
  const before = session.getSnapshot();
  assert.equal(executeCommand(session, { object: 'days', action: 'update', name: 'working', values: { description: 42 } }).ok, false);
  assert.equal(session.getSnapshot(), before);
  good(executeCommand(session, { object: 'tasks.builtins', action: 'update', id: 'increment_variable', values: { description: 'Increment intent.' } }));
  const builtin = good(executeCommand(session, { object: 'tasks.builtins', action: 'list' })).value.find((item) => item.name === 'increment_variable');
  good(executeCommand(session, { object: 'tasks.builtins', action: 'update', name: 'increment_variable', values: { parameters: builtin.parameters.map((parameter) => ({ ...parameter, description: `${parameter.name} intent.` })) } }));
  assert.equal(parse(good(exportBlueprint(session.getSnapshot())).data).builtins.increment_variable.parameter_descriptions.value, 'value intent.');
  good(executeCommand(session, { object: 'days', action: 'update', name: 'working', values: { description: '  \n' } }));
  assert.equal(parse(good(exportBlueprint(session.getSnapshot())).data).days.working.description, undefined);
  const invalid = await sample(); invalid.expressions.weekly_pay.branches[0].description = false;
  assert.ok(importBlueprint(stringify(invalid)).errors.some((error) => error.path.includes('description')));
});

test('summaries show line-prefixed comments at visible depths and can hide them without changing logic', async () => {
  const draft = good(importBlueprint(stringify(await sample()))).draft;
  const options = { nodes: draft.operandNodes, tasks: draft.tasks, macros: draft.taskMacros, builtinTasks: draft.builtinTasks, depth: 'all', t };
  const slot = draft.slots.find((item) => item.symbol === 'work');
  const summary = slotLogicText(slot, { ...options, depth: 'summary' });
  assert.match(summary, /\/\/ Perform work\./); assert.doesNotMatch(summary, /Spend stamina first/);
  const full = slotLogicText(slot, options);
  assert.match(full, /\/\/ Spend stamina first\./); assert.match(full, /\/\/ second line/);
  assert.doesNotMatch(slotLogicText(slot, { ...options, showDescriptions: false }), /\/\//);
  const macro = draft.taskMacros.find((item) => item.symbol === 'priority');
  assert.match(taskMacroLogicText(macro, options), /\/\/ Try branch first\./);
  const computed = Object.values(draft.operandNodes).find((item) => item.symbol === 'weekly_pay');
  assert.match(formatComputedDefinition(computed.definition, draft.operandNodes), /\/\//);
});
