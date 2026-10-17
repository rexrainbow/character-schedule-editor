import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../src/example.json' with { type: 'json' };
import { clone, compileProject, createSlot, duplicateSlot, projectToDraft, validateDocument } from '../src/model.js';
import { changeWeekCell, createWeek, dayReferenceCount, deleteSharedDay, deleteWeek, duplicateWeek, isPrivateDay, setWeekDay, sharedDays, weekDay } from '../src/weekModel.js';

function setup() {
  const draft = projectToDraft(example); const week = createWeek(draft, 'Normal week');
  draft.weeks.push(week); return { draft, weekId: week.id, dayId: draft.days[0].id, slotId: draft.slots[0].id };
}
const check = (draft) => assert.deepEqual(compileProject(draft).errors, []);

test('old projects without weeks import as an empty collection', () => {
  const old = clone(example); delete old.week_schedules;
  assert.deepEqual(validateDocument(old), []);
  assert.deepEqual(projectToDraft(old).weeks, []);
  assert.deepEqual(compileProject(projectToDraft(old)).data.week_schedules, {});
});
test('empty and unchanged assignments do not create private days', () => {
  const { draft, weekId, dayId, slotId } = setup();
  assert.equal(changeWeekCell(draft, weekId, 'mon', 0, null), draft);
  const referenced = setWeekDay(draft, weekId, 'mon', dayId);
  assert.equal(changeWeekCell(referenced, weekId, 'mon', 0, slotId), referenced);
  assert.equal(referenced.days.length, 1); check(referenced);
});
test('copy-on-write isolates configuration and keeps existing definitions shared', () => {
  const { draft, weekId, dayId } = setup();
  const referenced = setWeekDay(setWeekDay(draft, weekId, 'mon', dayId), weekId, 'tue', dayId);
  const changed = changeWeekCell(referenced, weekId, 'mon', 0, referenced.slots[1].id);
  const privateDay = weekDay(changed, weekId, 'mon');
  assert.ok(isPrivateDay(privateDay)); assert.notEqual(privateDay.id, dayId);
  assert.deepEqual(privateDay.owner, { week_schedule_id: weekId, weekday: 'mon' });
  assert.equal(weekDay(changed, weekId, 'tue').slotIds[0], referenced.slots[0].id);
  assert.equal(changed.slots.length, referenced.slots.length); check(changed);
  const edited = clone(changed.slots[1]); edited.name = 'Global edit';
  const next = changeWeekCell(changed, weekId, 'mon', 0, edited.id, edited);
  assert.equal(weekDay(next, weekId, 'mon').id, privateDay.id);
  assert.equal(next.slots.find((s) => s.id === edited.id).name, 'Global edit'); check(next);
});
test('editing a global definition alone never creates a private day', () => {
  const { draft, weekId, dayId, slotId } = setup();
  const referenced = setWeekDay(draft, weekId, 'mon', dayId);
  const edited = clone(draft.slots[0]); edited.name = 'Updated';
  const next = changeWeekCell(referenced, weekId, 'mon', 0, slotId, edited);
  assert.equal(next.days.length, draft.days.length); assert.equal(next.weeks[0].days.mon, dayId);
  assert.equal(next.slots[0].name, 'Updated'); assert.equal(draft.slots[0].name, '通勤'); check(next);
});
test('new and duplicate slots are committed with the private assignment atomically', () => {
  const { draft, weekId } = setup(); const slot = createSlot(draft.slots, 'Created'); slot.branches[0].task = clone(draft.slots[0].branches[0].task);
  const changed = changeWeekCell(draft, weekId, 'wed', 3, slot.id, slot);
  assert.equal(changed.slots.length, 3); assert.equal(weekDay(changed, weekId, 'wed').slotIds[3], slot.id);
  const copied = duplicateSlot(changed.slots, slot);
  const next = changeWeekCell(changed, weekId, 'wed', 3, copied.id, copied);
  assert.equal(next.slots.length, 4); assert.equal(next.days.length, changed.days.length); check(next);
});
test('clearing the final cell retains the private day and its UUID', () => {
  const { draft, weekId, slotId } = setup();
  const assigned = changeWeekCell(draft, weekId, 'sun', 0, slotId);
  const id = assigned.weeks[0].days.sun;
  const cleared = changeWeekCell(assigned, weekId, 'sun', 0, null);
  assert.equal(cleared.weeks[0].days.sun, id); assert.deepEqual(weekDay(cleared, weekId, 'sun').slotIds, Array(6).fill(null));
  assert.equal(sharedDays(cleared).length, draft.days.length); check(cleared);
});
test('replacing private with shared or empty removes only its anonymous day', () => {
  const { draft, weekId, slotId, dayId } = setup();
  const assigned = changeWeekCell(draft, weekId, 'wed', 0, slotId);
  const privateId = assigned.weeks[0].days.wed;
  for (const target of [null, dayId]) {
    const next = setWeekDay(assigned, weekId, 'wed', target);
    assert.equal(next.days.some((d) => d.id === privateId), false); assert.equal(next.slots.length, draft.slots.length);
    assert.equal(next.weeks[0].days.wed, target); check(next);
  }
});
test('week duplication creates independent private days but preserves shared references', () => {
  const { draft, weekId, slotId, dayId } = setup();
  const source = changeWeekCell(setWeekDay(draft, weekId, 'mon', dayId), weekId, 'wed', 0, slotId);
  const copied = duplicateWeek(source, source.weeks[0]); const week = copied.weeks[1];
  assert.notEqual(week.id, weekId); assert.equal(week.name, 'Normal week (副本)');
  assert.equal(week.days.mon, dayId); assert.equal(week.days.sun, null);
  assert.notEqual(week.days.wed, source.weeks[0].days.wed);
  assert.deepEqual(weekDay(copied, week.id, 'wed').owner, { week_schedule_id: week.id, weekday: 'wed' });
  const changed = changeWeekCell(copied, week.id, 'wed', 0, null);
  assert.equal(weekDay(changed, weekId, 'wed').slotIds[0], slotId); check(changed);
  const deleted = deleteWeek(changed, weekId);
  assert.equal(deleted.weeks.length, 1); assert.equal(deleted.days.length, 2); check(deleted);
});
test('shared day deletion clears weekday references while preserving private snapshots', () => {
  const { draft, weekId, dayId } = setup();
  let source = setWeekDay(setWeekDay(draft, weekId, 'mon', dayId), weekId, 'tue', dayId);
  source = changeWeekCell(source, weekId, 'tue', 0, null);
  assert.equal(dayReferenceCount(source, dayId), 1);
  const deleted = deleteSharedDay(source, dayId);
  assert.equal(deleted.weeks[0].days.mon, null); assert.ok(deleted.weeks[0].days.tue);
  assert.equal(deleted.slots.length, source.slots.length); check(deleted);
});
test('import validation rejects dangling, wrong-owner, shared-owner and orphan private days', () => {
  const { draft, weekId, slotId } = setup();
  const valid = compileProject(changeWeekCell(draft, weekId, 'mon', 0, slotId)).data;
  const id = valid.week_schedules[weekId].days.mon;
  const wrongOwner = clone(valid); wrongOwner.day_schedules[id].owner.weekday = 'tue';
  assert.ok(validateDocument(wrongOwner).some((e) => e.key === 'privateOwnerMismatch'));
  const orphan = clone(valid); orphan.week_schedules[weekId].days.mon = null;
  assert.ok(validateDocument(orphan).some((e) => e.path.endsWith('/owner')));
  const twice = clone(valid); twice.week_schedules[weekId].days.tue = id;
  assert.ok(validateDocument(twice).some((e) => e.key === 'privateOwnerMismatch'));
  const missing = clone(valid); missing.week_schedules[weekId].days.tue = crypto.randomUUID();
  assert.ok(validateDocument(missing).some((e) => e.key === 'missingDay'));
  const sharedOwner = clone(valid); sharedOwner.day_schedules[id].scope = 'shared';
  assert.ok(validateDocument(sharedOwner).length);
  const noMonday = clone(valid); delete noMonday.week_schedules[weekId].days.mon;
  assert.ok(validateDocument(noMonday).some((e) => e.key === 'schema_required'));
});
