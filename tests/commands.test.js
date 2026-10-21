import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSession } from '../src/core/projectApi.js';
import { commandCatalog, inspectCommand, executeCommand, executeBatch } from '../src/core/commands.js';
import { sequenceEventsFixture } from './sequenceEventsFixture.js';

test('command catalog is explicit, serializable and validates command shapes before dispatch', () => {
  const project = createProjectSession(), original = project.getSnapshot();
  const catalog = commandCatalog(); assert.ok(catalog.length > 100);
  assert.equal(JSON.parse(JSON.stringify(catalog)).length, catalog.length);
  for (const command of [null, { object: '__proto__', action: 'toString' }, { object: 'days', action: 'create', values: [] }, { object: 'days', action: 'remove' }, { object: 'days', action: 'list', surprise: true }]) {
    assert.equal(executeCommand(project, command).ok, false);
  }
  assert.equal(project.getSnapshot(), original);
  assert.equal(inspectCommand({ object: 'days', action: 'list' }).mutates, false);
  const day = executeCommand(project, { object: 'days', action: 'create', values: { display_name: 'Work', purposes: ['main', 'overlay'] } });
  assert.equal(day.ok, true); assert.equal(day.draft, undefined); assert.equal(day.nodes, undefined);
  assert.equal(executeCommand(project, { object: 'days', action: 'get', id: day.id }).value.display_name, 'Work');
});

test('atomic commands can create linked objects, roll back invalid references and publish once', () => {
  const project = createProjectSession(), dayId = crypto.randomUUID(), slotId = crypto.randomUUID(); let calls = 0;
  project.subscribe(() => calls++);
  const result = executeBatch(project, [
    { object: 'days', action: 'create', values: { id: dayId, name: 'Work' } },
    { object: 'slots', action: 'create', values: { id: slotId, name: 'work_task', display_name: 'Work task' } },
    { object: 'days', action: 'assignSlot', id: dayId, target: 0, slotId },
  ]);
  assert.equal(result.ok, true); assert.equal(project.getRevision(), 1); assert.equal(calls, 1);
  assert.equal(project.days.get(dayId).slotIds[0], slotId);
  const before = project.getSnapshot();
  const failed = executeBatch(project, [
    { object: 'days', action: 'update', id: dayId, values: { display_name: 'Lost edit' } },
    { object: 'days', action: 'assignSlot', id: dayId, target: 1, slotId: crypto.randomUUID() },
  ]);
  assert.equal(failed.ok, false); assert.equal(project.getSnapshot(), before); assert.equal(calls, 1);
  assert.equal(executeBatch(project, [{ object: 'days', action: 'list' }]).ok, false);
});

test('event commands add a probability event using existing schedule definitions and preserve mode protections', () => {
  const { draft, sequence, eventDay } = sequenceEventsFixture(), project = createProjectSession(draft);
  const event = executeCommand(project, { object: 'events', action: 'create', sequenceId: sequence.id, values: { display_name: 'Cold', dayId: eventDay.id, kind: 'probability', probability_percent: 10, cooldown_days: 7, countFilter: { kind: 'all' }, end: { week: 3, weekday: 'sun' } } });
  assert.equal(event.ok, true); assert.equal(event.value.probability_percent, 10);
  assert.equal(executeCommand(project, { object: 'events', action: 'list', sequenceId: sequence.id }).value.length, 1);
  assert.equal(executeCommand(project, { object: 'tasks', action: 'create', values: { display_name: 'Engine-only task' } }).ok, false);
  assert.equal(executeCommand(project, { object: 'events', action: 'update', sequenceId: sequence.id, id: event.id, values: { probability_percent: 200 } }).ok, false);
  assert.equal(project.sequences.events(sequence.id).get(event.id).probability_percent, 10);
});
