import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileProject, projectToDraft, validateDocument, duplicateSlot, duplicateDay } from '../src/model.js';
import { duplicateWeek } from '../src/weekModel.js';
import { duplicateSequence } from '../src/sequenceModel.js';
import { duplicateTask } from '../src/taskModel.js';
import { duplicateTaskMacro } from '../src/taskMacroModel.js';
import { duplicateOperandSubtree } from '../src/operandModel.js';
import { engineKeyEntries, engineKeyConflicts } from '../src/engineKeyModel.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../src/${name}.json`, import.meta.url), 'utf8'));
test('engine metadata round-trips for all entity types and duplicates remain valid imports/exports', () => {
  for (const file of ['task-macro-example', 'state-example', 'sequence-example']) {
    const data = load(file);
    for (const collection of ['operand_nodes', 'expression_macros', 'tasks', 'task_macros', 'slots', 'day_schedules', 'week_schedules', 'week_sequences']) {
      for (const item of Object.values(data[collection] ?? {})) { item.engine_key = 'shared'; item.icon = 'tabler:books'; }
    }
    assert.deepEqual(validateDocument(data), []);
    const draft = projectToDraft(data), result = compileProject(draft);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.data, data);
    const entries = engineKeyEntries(draft), first = entries[0];
    assert.equal(engineKeyConflicts(entries, first.kind, first.id, ' shared ').length, entries.length - 1);
    assert.deepEqual(engineKeyConflicts(entries, first.kind, first.id, ''), []);
    assert.deepEqual(engineKeyConflicts(entries, first.kind, first.id, 'Shared'), []);
    data.slots[Object.keys(data.slots)[0]].engine_key = 123;
    assert.ok(validateDocument(data).some((error) => error.path.endsWith('/engine_key')));
  }
});

test('copies clear engine contracts, including all descendants, without changing source keys or icons', () => {
  const draft = projectToDraft(load('task-macro-example'));
  const nodes = draft.operandNodes;
  for (const node of Object.values(nodes)) { node.engine_key = 'source'; node.icon = 'tabler:books'; }
  for (const id of Object.keys(nodes)) {
    const copy = duplicateOperandSubtree(nodes, id);
    for (const [key, node] of Object.entries(copy.nodes)) if (!nodes[key]) { assert.equal(node.engine_key, undefined); assert.equal(node.icon, 'tabler:books'); }
  }
  const withKey = (item) => ({ ...item, engine_key: 'source' });
  for (const result of [duplicateSlot(draft.slots, withKey(draft.slots[0])), duplicateDay(draft, withKey(draft.days[0])), duplicateTask(withKey(draft.tasks[0])), duplicateTaskMacro(withKey(draft.taskMacros[0]))]) assert.equal(result.engine_key, undefined);
  const schedules = projectToDraft(load('sequence-example'));
  assert.equal(duplicateWeek(schedules, withKey(schedules.weeks[0])).weeks.at(-1).engine_key, undefined);
  assert.equal(duplicateSequence(schedules, withKey(schedules.sequences[0])).engine_key, undefined);
  assert.ok(Object.values(nodes).every((node) => node.engine_key === 'source'));
});
