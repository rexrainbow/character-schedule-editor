import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSlot, compileProject, projectToDraft, branchFromData, duplicateSlot } from '../src/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/runtimeModel.js';
import { simulateSlot } from '../src/simulationModel.js';

test('named activities with no branches round-trip, duplicate, export and simulate without task calls', () => {
  const draft = createProject(), slot = createSlot([], 'Rest'); draft.slots = [slot];
  assert.deepEqual(slot.branches, []);
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const copy = duplicateSlot(draft.slots, slot); assert.notEqual(copy.id, slot.id); assert.deepEqual(copy.branches, []);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.slots[slot.id].display_name, 'Rest'); assert.deepEqual(runtime.data.slots[slot.id].branches, []);
  const result = simulateSlot(draft, slot.id);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.calls, []); assert.deepEqual(result.changes, []);
  assert.equal(result.trace[0].label, 'Rest'); assert.equal(result.trace[0].empty, true);
  slot.branches = [branchFromData({ condition: null })];
  assert.ok(compileProject(draft).errors.some((e) => e.key === 'chooseTask'));
});
