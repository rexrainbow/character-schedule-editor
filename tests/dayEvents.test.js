import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createDay, createSlot, compileProject, projectToDraft, assignCell, referenceCount, deleteSlotAndReferences, duplicateDay } from '../src/model.js';
import { createWeek, setWeekDay, changeWeekCell, duplicateWeek } from '../src/weekModel.js';
import { dayAssignment, dayAssignments } from '../src/dayEvents.js';
import { compileRuntime, validateRuntimeDocument } from '../src/runtimeModel.js';

function fixture() {
  let draft = createProject(); const slot = createSlot([], 'Inspect'), day = createDay(draft, 'Inspection');
  draft.slots = [slot]; draft.days = [day];
  for (const target of ['dayStart', { index: 0, edge: 'start' }, { index: 0, edge: 'end' }, 'dayEnd']) draft = assignCell(draft, day.id, target, slot.id);
  return { draft, dayId: day.id, slotId: slot.id };
}
test('day events round-trip and export as independent references without changing daily slot count', () => {
  const { draft, dayId, slotId } = fixture();
  assert.equal(draft.days[0].slotIds.length, 3); assert.deepEqual(draft.days[0].slotIds, [null, null, null]);
  assert.equal(referenceCount(draft, slotId), 4);
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  const day = project.data.day_schedules[dayId];
  assert.equal(day.day_start_slot_id, slotId); assert.equal(day.day_end_slot_id, slotId);
  assert.equal(day.slot_events.length, 3); assert.deepEqual(day.slot_events[0], { start_slot_id: slotId, end_slot_id: slotId });
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.days[dayId].day_start_slot_id, slotId);
  assert.deepEqual(runtime.data.days[dayId].slot_events, day.slot_events);
  const bad = structuredClone(project.data); bad.day_schedules[dayId].slot_events.pop();
  assert.ok(compileProject(projectToDraft(bad)).errors.some((e) => e.path.endsWith('/slot_events')));
  bad.day_schedules[dayId].slot_events[0].start_slot_id = crypto.randomUUID();
  assert.ok(compileProject(projectToDraft(bad)).errors.some((e) => e.key === 'missingSlot' && e.path.endsWith('/start_slot_id')));
});
test('copies, private-day snapshots and deletion isolate and clean all event references', () => {
  let { draft, dayId, slotId } = fixture();
  const copy = duplicateDay(draft, draft.days[0]); copy.slotEvents[0].startId = null;
  assert.equal(draft.days[0].slotEvents[0].startId, slotId);
  draft.weeks = [createWeek(draft, 'Week')]; const weekId = draft.weeks[0].id;
  draft = setWeekDay(draft, weekId, 'mon', dayId);
  const unchanged = changeWeekCell(draft, weekId, 'mon', 'dayStart', slotId); assert.equal(unchanged, draft);
  draft = changeWeekCell(draft, weekId, 'mon', 'dayEnd', null);
  const privateDay = draft.days.find((day) => day.scope === 'week_private');
  assert.equal(privateDay.dayStartId, slotId); assert.equal(privateDay.dayEndId, null);
  assert.equal(draft.days[0].dayEndId, slotId);
  const copiedWeek = duplicateWeek(draft, draft.weeks[0]);
  const copiedDay = copiedWeek.days.find((day) => day.owner?.week_schedule_id === copiedWeek.weeks.at(-1).id);
  copiedDay.slotEvents[0].endId = null; assert.equal(privateDay.slotEvents[0].endId, slotId);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.data.weeks[weekId].days.mon.day_start_slot_id, slotId);
  const cleared = deleteSlotAndReferences(draft, slotId);
  assert.ok(cleared.days.every((day) => dayAssignments(day).every((entry) => entry.id === null)));
  assert.deepEqual(compileProject(cleared).errors, []);
  assert.equal(dayAssignment(cleared.days[0], { index: 0, edge: 'start' }), null);
});
