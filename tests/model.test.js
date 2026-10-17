import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import example from '../src/example.json' with { type: 'json' };
import schema from '../src/slots.schema.json' with { type: 'json' };
import { documentToDraft, compileDraft, validateDocument, addBranch, moveBranch, removeBranch, duplicateSlot, createSlot, idPattern } from '../src/model.js';
import { resolveLocale, messages } from '../src/i18n.js';
import { createProject, projectToDraft, compileProject, createDay, duplicateDay, referenceCount, deleteSlotAndReferences, assignCell, applySlotEdit, taskSummary } from '../src/model.js';

test('bundled schema matches SPEC and project example is valid', () => {
  const blocks = [...readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8').matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(schema, blocks.find((block) => block.title === schema.title)); assert.deepEqual(validateDocument(example), []);
});
test('recursive example round-trips without editor metadata', () => {
  const result = compileProject(projectToDraft(example));
  assert.deepEqual(result.errors, []); assert.deepEqual(result.data, example);
});
test('branch operations always keep the ELSE branch last', () => {
  const original = documentToDraft(example)[0].branches;
  const added = addBranch(original);
  assert.equal(added.at(-1).condition, null);
  assert.equal(added.length, original.length + 1);
  assert.deepEqual(moveBranch(added, added.length - 2, 1), added);
  assert.deepEqual(moveBranch(added, added.length - 1, -1), added);
  assert.deepEqual(removeBranch(added, added.length - 1), added);
  assert.equal(moveBranch(added, 1, -1)[0].uid, added[1].uid);
});
test('missing task blocks export and is preserved across duplication', () => {
  const draft = documentToDraft(example); draft[0].branches[0].task.task_id = '';
  assert.ok(compileDraft(draft).errors.some((e) => e.key === 'chooseTask'));
  const duplicate = duplicateSlot(draft, draft[0]);
  assert.equal(duplicate.branches[0].task.task_id, '');
  assert.notEqual(duplicate.uid, draft[0].uid);
  assert.notEqual(duplicate.id, draft[0].id);
  assert.match(duplicate.id, idPattern);
  assert.equal(duplicate.name, `${draft[0].name} (副本)`);
  assert.equal(duplicate.icon, draft[0].icon);
  duplicate.branches[0].condition.operand_a.reference_id = 'changed';
  assert.notEqual(draft[0].branches[0].condition.operand_a.reference_id, 'changed');
});
test('duplicate IDs cannot silently overwrite slots at export', () => {
  const draft = documentToDraft(example); draft[1].id = draft[0].id;
  assert.ok(compileDraft(draft).errors.some((e) => e.key === 'duplicateId'));
});
test('unique IDs are generated and a new slot requires task selection', () => {
  const slots = documentToDraft(example); const slot = createSlot(slots, 'New');
  slots.push(slot); const next = createSlot(slots, 'New');
  assert.notEqual(slot.id, next.id); assert.ok(compileDraft([slot], example.operand_nodes).errors.some((e) => e.key === 'chooseTask'));
  slot.branches[0].task = structuredClone(slots[0].branches[0].task); next.branches[0].task = structuredClone(slot.branches[0].task);
  assert.deepEqual(compileDraft([...slots, next], example.operand_nodes, projectToDraft(example).tasks).errors, []);
  assert.match(slot.id, idPattern); assert.equal(slot.id[14], '4');
  assert.equal(slot.icon, 'tabler:calendar-event');
});
test('reject malformed condition trees and invalid ELSE placement', () => {
  const conditions = ['energy < 30', { kind: 'group', mode: 'ALL', items: [] },
    { kind: 'group', mode: 'ANY', items: [null] },
    { kind: 'comparison', opA: 'a', operator: '===', opB: 'b' },
    { kind: 'comparison', opA: '', operator: '==', opB: 'b' }];
  for (const condition of conditions) {
    const candidate = structuredClone(example); Object.values(candidate.slots)[0].branches[0].condition = condition;
    assert.ok(validateDocument(candidate).length);
  }
  const candidate = structuredClone(example); Object.values(candidate.slots)[0].branches.reverse();
  assert.ok(validateDocument(candidate).some((e) => e.key === 'elseLast'));
  assert.ok(validateDocument(null).length); assert.ok(validateDocument({ slots: [] }).length);
});
test('UUID and icon constraints reject legacy IDs and invalid icon values', () => {
  const source = Object.values(example.slots)[0];
  assert.ok(validateDocument({ ...example, slots: { slot_commute: source } }).length);
  const id = Object.keys(example.slots)[0];
  for (const icon of [null, 42]) {
    assert.ok(validateDocument({ ...example, slots: { ...example.slots, [id]: { ...source, icon } } }).length);
  }
  const { icon, ...withoutIcon } = source;
  assert.ok(validateDocument({ ...example, slots: { ...example.slots, [id]: withoutIcon } }).length);
  assert.deepEqual(validateDocument({ ...example, slots: { ...example.slots, [id]: { ...source, icon: '' } } }), []);
  const draft = documentToDraft(example); draft[0].icon = 'custom_asset';
  const result = compileDraft(draft);
  assert.equal(result.data.slots[id].icon, 'custom_asset');
  assert.equal(documentToDraft(result.data)[0].id, id);
});
test('new project is empty, creates fixed null cells, and duplicates only references', () => {
  const draft = createProject(); assert.equal(draft.slots.length, 0); assert.equal(draft.days.length, 0);
  assert.deepEqual(compileProject(draft).errors, []);
  assert.equal(draft.project.settings.slots_per_day, 3);
  const day = createDay(draft, 'Workday'); assert.match(day.id, idPattern); assert.deepEqual(day.slotIds, Array(3).fill(null));
  draft.days.push(day); const copied = duplicateDay(draft, day);
  assert.notEqual(copied.id, day.id); assert.equal(copied.name, 'Workday (副本)');
  copied.slotIds[0] = 'different'; assert.equal(day.slotIds[0], null);
});
test('deleting shared slot clears every reference without affecting other slots', () => {
  const draft = projectToDraft(example); const id = draft.slots[0].id;
  draft.days.push(duplicateDay(draft, draft.days[0]));
  assert.equal(referenceCount(draft, id), 2);
  const deleted = deleteSlotAndReferences(draft, id);
  assert.equal(referenceCount(deleted, id), 0); assert.equal(deleted.slots.length, 1);
  assert.equal(deleted.days[0].slotIds[1], draft.slots[1].id);
  assert.deepEqual(compileProject(deleted).errors, []);
  assert.equal(referenceCount(draft, id), 2);
});
test('slot editing applies atomically and updates shared references through the original ID', () => {
  const draft = projectToDraft(example); const original = draft.slots[0];
  const copied = duplicateSlot(draft.slots, original);
  const next = applySlotEdit(draft, copied, draft.days[0].id, 2);
  assert.equal(next.slots.length, 3); assert.equal(next.days[0].slotIds[2], copied.id);
  assert.equal(draft.slots.length, 2); assert.equal(draft.days[0].slotIds[2], null);
  const edited = structuredClone(original); edited.name = 'Changed';
  const applied = applySlotEdit(next, edited, draft.days[0].id, 3);
  assert.equal(applied.slots.length, 3); assert.equal(applied.slots.find((s) => s.id === original.id).name, 'Changed');
  assert.equal(applied.days[0].slotIds[3], original.id);
  edited.branches[0].task.task_id = '';
  assert.throws(() => applySlotEdit(draft, edited, draft.days[0].id, 0));
  assert.throws(() => assignCell(draft, draft.days[0].id, 0, crypto.randomUUID()));
});
test('import rejects wrong cell counts, dangling references and invalid day UUIDs', () => {
  const data = structuredClone(example); const dayId = Object.keys(data.day_schedules)[0];
  data.day_schedules[dayId].slot_ids.pop();
  assert.ok(validateDocument(data).some((e) => e.key === 'cellCountMismatch' && e.path === `/day_schedules/${dayId}/slot_ids`));
  data.day_schedules[dayId].slot_ids.push(crypto.randomUUID());
  assert.ok(validateDocument(data).some((e) => e.key === 'missingSlot' && e.path.endsWith('/5')));
  const invalid = { ...example, day_schedules: { bad: Object.values(example.day_schedules)[0] } };
  assert.ok(validateDocument(invalid).length);
  const differentVersion = structuredClone(example); differentVersion.project.schema_version = 'future-dev';
  assert.deepEqual(validateDocument(differentVersion), []);
});
test('summary resolves task names by UUID and handles missing selections', () => {
  const draft = projectToDraft(example), slot = draft.slots[0];
  const tasks = structuredClone(draft.tasks); tasks.find((task) => task.id === slot.branches[0].task.task_id).display_name = 'Bus';
  assert.ok(taskSummary(slot, 'Unnamed', tasks).startsWith('Bus /'));
  slot.branches[0].task.task_id = ''; assert.ok(taskSummary(slot, 'Unnamed', tasks).startsWith('Unnamed /'));
});

test('locale follows the primary system language and both dictionaries have all keys', () => {
  assert.equal(resolveLocale('system', ['zh-TW', 'en']), 'zh-TW');
  assert.equal(resolveLocale('system', ['en', 'zh-TW']), 'en');
  assert.equal(resolveLocale('system', ['ja']), 'en');
  assert.equal(resolveLocale('en', ['zh-TW']), 'en');
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages['zh-TW']).sort());
});
