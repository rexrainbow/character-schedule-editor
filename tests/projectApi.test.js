import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProjectSession, editProject } from '../src/core/projectApi.js';
import { createProject, compileProject } from '../src/core/model.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { enumDefinitionsFixture } from './enumDefinitionsFixture.js';
import { sequenceEventsFixture } from './sequenceEventsFixture.js';

test('session is platform independent throughout its dependency graph', async () => {
  const visited = new Set();
  async function inspect(url) {
    if (visited.has(url.href)) return; visited.add(url.href);
    const code = await readFile(url, 'utf8');
    assert.doesNotMatch(code, /from ['"]react(?:\/|['"])/, url.pathname);
    const executable = code.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '');
    assert.doesNotMatch(executable, /\b(?:window|localStorage|navigator)\./, url.pathname);
    for (const match of code.matchAll(/from ['"](\.\.?\/[^'"]+\.js)['"]/g)) await inspect(new URL(match[1], url));
  }
  await inspect(new URL('../src/core/projectApi.js', import.meta.url));
  assert.ok(visited.size > 15);
});

test('batch creates and links schedules, publishes once, and round-trips the existing file format', () => {
  const project = createProjectSession(); let notifications = 0;
  const unsubscribe = project.subscribe(() => notifications++);
  const before = project.getSnapshot();
  const result = project.transaction((tx) => {
    const slot = tx.slots.create({ name: 'Work' }).value;
    const day = tx.days.create({ name: 'Workday', tags: ['Office'] }).value;
    assert.equal(tx.days.assignSlot(day.id, 0, slot.id).ok, true);
    const week = tx.weeks.create({ name: 'Week' }).value;
    tx.weeks.assignDay(week.id, 'mon', day.id);
    const sequence = tx.sequences.create({ name: 'Routine' }).value;
    tx.sequences.appendWeek(sequence.id, week.id);
    return { dayId: day.id, sequenceId: sequence.id, slotId: slot.id };
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(notifications, 1);
  assert.equal(project.getRevision(), 1); assert.notEqual(project.getSnapshot(), before);
  assert.deepEqual(project.days.list({ tag: 'Office' }).map((d) => d.id), [result.value.dayId]);
  assert.equal(project.slots.references(result.value.slotId), 1);
  const data = project.toDocument(); assert.deepEqual(data.errors, []);
  const loaded = createProjectSession(); assert.equal(loaded.loadDocument(data.data).ok, true);
  assert.deepEqual(loaded.toDocument().data, data.data);
  const copy = loaded.days.duplicate(result.value.dayId); assert.equal(copy.ok, true);
  assert.notEqual(copy.id, result.value.dayId); assert.equal(copy.value.name, 'Workday (副本)');
  unsubscribe(); project.days.create({ name: 'Other' }); assert.equal(notifications, 1);
});

test('queries and imported inputs cannot mutate frozen snapshots; no-op updates do not publish', () => {
  const source = createProject(), project = editProject(source);
  const day = project.days.create({ name: 'A' }).value; const snapshot = project.getSnapshot(), revision = project.getRevision();
  assert.throws(() => { snapshot.days[0].name = 'Mutated'; }, TypeError);
  const queried = project.days.get(day.id); queried.name = 'Not persisted'; queried.slotIds[0] = 'Invalid';
  assert.equal(project.days.get(day.id).name, 'A'); assert.equal(source.days.length, 0);
  project.days.update(day.id, { name: 'A' }); assert.equal(project.getRevision(), revision);
  assert.equal(project.getSnapshot(), snapshot);
});

test('failed actions, failed final validation and exceptions roll back the whole transaction', () => {
  const project = createProjectSession(), before = project.getSnapshot(); let notifications = 0;
  project.subscribe(() => notifications++);
  assert.equal(project.transaction((tx) => { tx.days.create({ name: 'A' }); tx.days.assignSlot('missing', 0, null); }).ok, false);
  assert.equal(project.getSnapshot(), before); assert.equal(notifications, 0); assert.deepEqual(project.changes(), []);
  const invalid = project.transaction((tx) => { tx.days.create({ name: '', symbol: '' }); });
  assert.equal(invalid.ok, false); assert.ok(invalid.errors.some((e) => e.path.includes('symbol')));
  assert.equal(project.getSnapshot(), before);
  assert.equal(project.transaction((tx) => { tx.days.create({ name: 'A' }); throw new Error('abort'); }).ok, false);
  assert.equal(project.getSnapshot(), before);
  assert.equal(project.transaction(async () => {}).errors[0].key, 'asyncProjectTransaction');
  assert.equal(project.days.create({ name: 'Valid' }).ok, true);
});

test('GUI draft mode keeps field errors editable, whereas strict actions and exports reject invalid fields', () => {
  const project = createProjectSession(), day = project.days.create({ name: 'A' }).value;
  assert.equal(project.days.update(day.id, { symbol: '' }).ok, false); assert.equal(project.days.get(day.id).name, 'A');
  const editor = editProject(project.getSnapshot()); assert.equal(editor.days.update(day.id, { symbol: '' }).ok, true);
  assert.ok(editor.validate().errors.length); assert.ok(editor.toDocument().errors.length);
  editor.days.update(day.id, { symbol: 'fixed' }); assert.deepEqual(editor.validate().errors, []);
  const before = editor.getSnapshot();
  assert.equal(editor.replaceDraft({ ...before, days: null }).ok, false);
  assert.equal(editor.getSnapshot(), before);
});

test('user, environment and simulation modes enforce protected definitions inside the core', () => {
  const { draft, number } = builtinVariableFixture(), user = createProjectSession(draft, { validation: 'draft' });
  assert.equal(user.variables.update(number, { display_name: 'Changed' }).ok, false);
  assert.equal(user.tasks.create({ display_name: 'Custom engine task' }).ok, false);
  const local = user.variables.create({ display_name: 'Local', scope: 'application' }); assert.equal(local.ok, true);
  user.setMode('environment'); assert.equal(user.variables.update(number, { display_name: 'Provided' }).ok, true);
  assert.equal(user.variables.update(local.id, { display_name: 'Changed' }).ok, false);
  assert.equal(user.days.create({ name: 'Forbidden' }).ok, false);
  user.setMode('simulation'); assert.equal(user.settings.update({ name: 'Forbidden' }).ok, false);
});

test('variable subtree deletion, type and readonly guards are preserved without GUI', () => {
  const { draft, number } = builtinVariableFixture(), project = editProject(draft);
  assert.equal(project.variables.remove(number).ok, false);
  assert.equal(project.variables.update(number, { value_type: 'string' }).ok, false);
  assert.equal(project.variables.update(number, { read_only: true }).ok, false);
  const group = project.variables.create({ node_type: 'group', display_name: 'Extra' }).value;
  const child = project.variables.create({ selectedId: group.id, display_name: 'Value' }).value;
  assert.equal(project.variables.remove(group.id).ok, true); assert.equal(project.variables.get(child.id), null);
});

test('parameter contracts normalize type changes, protect uses and clear deleted arguments', () => {
  const { draft, sequence } = builtinVariableFixture(), project = editProject(draft);
  const task = project.tasks.create({ display_name: 'Task' }).value;
  const p = project.tasks.parameters(task.id).add('Choice').value;
  const changed = project.tasks.parameters(task.id).update(p.id, 'enum'); assert.equal(changed.ok, true);
  assert.equal(changed.value.type, 'enum'); assert.equal(changed.value[0], undefined);
  project.tasks.parameters(task.id).update(p.id, { options: [{ display_name: 'One', value: 'one' }] });
  project.tasks.parameters(task.id).update(p.id, { type: 'number' });
  assert.equal(project.tasks.get(task.id).parameters[0].options, undefined);
  assert.equal(project.taskMacros.parameters(sequence.id).remove(sequence.parameters[0].id).ok, false);
  assert.equal(project.tasks.remove(task.id).ok, true);
});

test('enum deletion guards referenced definitions and can delete references and definition in one transaction', () => {
  const { draft, propertyEnumId } = enumDefinitionsFixture(), project = editProject(draft);
  assert.ok(project.enums.references(propertyEnumId).length);
  assert.equal(project.enums.remove(propertyEnumId).ok, false);
  const result = project.transaction((tx) => {
    for (const ref of tx.enums.references(propertyEnumId)) {
      tx[ref.scope === 'environment' ? 'tasks' : 'taskMacros'].parameters(ref.owner.id).update(ref.parameter.id, { type: 'enum', options: draft.enumNodes[propertyEnumId].options });
    }
    tx.enums.remove(propertyEnumId);
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(project.enums.get(propertyEnumId), null);
});

test('sequence events share references, defaults, date operations and probability validation', () => {
  const { draft, sequence, eventDay } = sequenceEventsFixture(), project = createProjectSession(draft);
  const events = project.sequences.events(sequence.id), group = events.newDraft();
  assert.equal(group.kind, 'once');
  const added = events.create({ display_name: 'Cold', dayId: eventDay.id, kind: 'probability', probability_percent: 10, cooldown_days: 7, end: { week: 3, weekday: 'sun' }, countFilter: { kind: 'all' } });
  assert.equal(added.ok, true, JSON.stringify(added.errors));
  const id = events.list()[0].id;
  assert.equal(events.update(id, { probability_percent: 101 }).ok, false);
  assert.equal(events.get(id).probability_percent, 10);
  assert.equal(events.duplicate(id).ok, true); assert.notEqual(events.list()[0].id, events.list()[1].id);
  assert.equal(events.moveStart(id, { week: 2, weekday: 'mon' }).ok, false); // Preserving duration would leave the sequence.
  assert.equal(project.exportRuntime().errors.length, 0);
});

test('deleting schedules clears assignments and trims sequence rows using the same domain rules', () => {
  const { draft, main, sequence, activity } = sequenceEventsFixture(), project = createProjectSession(draft);
  assert.equal(project.slots.remove(activity.id).ok, true);
  assert.equal(project.days.remove(main.id).ok, true);
  assert.equal(project.weeks.remove(draft.weeks[0].id).ok, true);
  assert.equal(project.sequences.get(sequence.id).rows.length, 1);
  assert.deepEqual(project.validate().errors, []);
});

test('duplicate names reject updates within the same type', () => {
  const project = createProjectSession(); project.days.create({ name: 'A', symbol: 'same' });
  const result = project.days.create({ name: 'B', symbol: 'same' });
  assert.equal(result.ok, false); assert.ok(result.errors.some((error) => error.key === 'duplicateSymbol')); assert.deepEqual(project.toDocument().errors, []);
});

test('environment parameter removal allows only derived argument cleanup in application content', () => {
  const { draft } = builtinVariableFixture(), editor = editProject(draft);
  const task = editor.tasks.create({ display_name: 'Engine task' }).value;
  const parameter = editor.tasks.parameters(task.id).add('Amount').value;
  const slot = draft.slots[0];
  editor.slots.update(slot.id, { branches: [{ ...slot.branches[0], task: { task_id: task.id, arguments: { [parameter.id]: { type: 'constant', value: 5 } } } }] });
  const project = createProjectSession(editor.getSnapshot(), { mode: 'environment' });
  const result = project.tasks.parameters(task.id).remove(parameter.id);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(project.slots.get(slot.id).branches[0].task.arguments[parameter.id], undefined);
  assert.equal(project.slots.update(slot.id, { name: 'Unrelated edit' }).ok, false);
});

test('whole-entity replacement removes slot modes and fixed builtin signatures reject structural edits', () => {
  const project = editProject(createProject());
  const slot = project.slots.create({ display_name: 'A', mode: 'priority', candidates: [] }).value;
  const { mode, candidates, ...base } = slot;
  assert.equal(project.slots.replace(slot.id, { ...base, branches: [] }).ok, true);
  assert.equal(project.slots.get(slot.id).mode, undefined);
  project.slots.update(slot.id, { display_name: 'Renamed' }); assert.equal(project.slots.get(slot.id).name, 'Renamed');
  const builtin = project.tasks.builtins.list()[0];
  assert.equal(project.tasks.builtins.update(builtin.id, { parameters: [] }).ok, false);
  assert.equal(project.tasks.builtins.update(builtin.id, { display_name: 'Localized name' }).ok, true);
});
