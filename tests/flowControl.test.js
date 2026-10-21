import test from 'node:test';
import assert from 'node:assert/strict';
import { flowControlFixture } from './flowControlFixture.js';
import { simulateSequenceDay } from '../src/core/daySimulationModel.js';
import { simulationInitialValues } from '../src/core/simulationModel.js';
import { compileProject, projectToDraft, validateDocument, duplicateDay } from '../src/core/model.js';
import { compileRuntime, validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { compileEnvironment, prepareEnvironmentImport } from '../src/core/environmentModel.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { createRelease } from '../src/core/builtinTaskModel.js';
import { compileReport } from '../src/core/reportModel.js';
const cancelled = (r) => r.trace.flatMap((p) => p.children.filter((e) => e.cancelled));
const compare = (a, b, comparator = '==') => ({ kind: 'comparison', comparator, operand_a: a, operand_b: b });
const constant = (value) => ({ type: 'constant', value });
const reference = (reference_id) => ({ type: 'reference', reference_id });

test('container modes interrupt each slot by default and leave day boundaries and equal priorities intact', () => {
  for (const [mode, count] of [['overlay', 0], ['interrupt_main', 9], ['interrupt_lower', 36]]) {
    const { draft, sequence, number } = flowControlFixture({ executionMode: mode });
    const before = structuredClone(draft), result = simulateSequenceDay(draft, sequence.id, 0);
    assert.deepEqual(result.errors, []); assert.equal(cancelled(result).length, count); assert.equal(result.state[number], 76 - count);
    assert.ok(cancelled(result).every((e) => !/^(High|Peer) /.test(e.label)));
    assert.ok(result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'dayStart'));
    assert.ok(result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'dayEnd'));
    assert.deepEqual(draft, before);
  }
});
test('unconditional release runs after start tasks, preserves their writes and skips only its own body/end', () => {
  const { draft, sequence, days, group } = flowControlFixture({ executionMode: 'interrupt_main' });
  days.High.slotReleases = [createRelease(), createRelease(), createRelease()];
  sequence.eventGroups[1].dayId = days.High.id;
  const result = simulateSequenceDay(draft, sequence.id, 0); assert.deepEqual(result.errors, []);
  assert.equal(cancelled(result).length, 6); assert.ok(cancelled(result).every((e) => e.groupId === group.id));
  const calls = result.calls.filter((c) => c.context.groupId === group.id && c.context.phaseKey === 'slot:0:start');
  assert.equal(calls[0].kind, 'builtin'); assert.equal(calls[1].kind, 'control'); assert.equal(calls[1].result, true);
  assert.ok(result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'slot:0:start'));
  assert.equal(result.calls.filter((c) => c.kind === 'control').length, 3);
});
test('release conditions see completed inspection writes and the next slot starts with a fresh claim', () => {
  const { draft, sequence, days, number } = flowControlFixture({ executionMode: 'interrupt_main' });
  days.High.slotReleases = [{ ...createRelease(), condition: compare(reference(number), constant(17)) }, null, null];
  const result = simulateSequenceDay(draft, sequence.id, 0); assert.deepEqual(result.errors, []);
  assert.equal(result.calls.find((c) => c.kind === 'control').result, true);
  assert.ok(result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'slot:0:main'));
  assert.ok(cancelled(result).some((e) => e.dayId === days.Main.id && e.cancelledBy));
  assert.equal(cancelled(result).length, 8);
  days.High.slotReleases[0].condition = compare(constant(false), constant(true));
  const failed = simulateSequenceDay(draft, sequence.id, 0); assert.equal(cancelled(failed).length, 9);
  assert.ok(failed.calls.some((c) => c.context.groupId === sequence.eventGroups[0].id && c.context.phaseKey === 'slot:0:main'));
});
test('empty interrupt schedules still block; blocked or overlay sources do not evaluate release conditions', () => {
  const { draft, sequence, days, number } = flowControlFixture({ executionMode: 'interrupt_main' });
  days.High.slotIds = [null, null, null]; days.High.slotEvents = Array.from({ length: 3 }, () => ({ startId: null, endId: null }));
  assert.equal(cancelled(simulateSequenceDay(draft, sequence.id, 0)).length, 9);
  const zero = Object.keys(draft.operandNodes).find((id) => draft.operandNodes[id].read_only);
  const unsafe = { ...createRelease(), condition: compare({ type: 'expression', operator: '/', operand_a: constant(1), operand_b: reference(zero) }, constant(0), '>') };
  days.Zero.slotReleases = [unsafe, null, null]; sequence.eventGroups[2].executionMode = 'interrupt_main'; sequence.eventGroups[0].executionMode = 'interrupt_lower';
  const values = simulationInitialValues(draft); values[zero] = 0;
  const blocked = simulateSequenceDay(draft, sequence.id, 0, values); assert.deepEqual(blocked.errors, []); assert.equal(blocked.calls.filter((c) => c.kind === 'control').length, 0);
  sequence.eventGroups[0].executionMode = 'overlay'; sequence.eventGroups[2].executionMode = 'overlay';
  assert.deepEqual(simulateSequenceDay(draft, sequence.id, 0, values).errors, []);
});
test('releasing one event does not undo another event claim and peers can each release independently', () => {
  const { draft, sequence, days } = flowControlFixture({ executionMode: 'interrupt_main' });
  days.High.slotReleases = [createRelease(), null, null]; sequence.eventGroups[1].executionMode = 'interrupt_main';
  let result = simulateSequenceDay(draft, sequence.id, 0);
  assert.ok(!result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'slot:0:main'));
  days.Peer.slotReleases = [createRelease(), null, null]; result = simulateSequenceDay(draft, sequence.id, 0);
  assert.ok(result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'slot:0:main'));
  assert.ok(!result.calls.some((c) => c.context.type === 'main' && c.context.phaseKey === 'slot:1:main'));
});
test('release rules round-trip on days, runtime contracts have one parameter and old/hidden controls reject', () => {
  const { draft, sequence, days, macro } = flowControlFixture({ executionMode: 'interrupt_main' }); days.High.slotReleases = [createRelease(), null, null];
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(projectToDraft(project.data).days.find((d) => d.id === days.High.id).slotReleases, days.High.slotReleases);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.deepEqual(validateRuntimeDocument(runtime.data), []);
  assert.equal(runtime.data.days[days.High.id].slot_releases[0].flow_control, 'release_slot');
  assert.equal(runtime.data.environment_requirements.tasks.find((t) => t.name === 'control_release').parameters.length, 1);
  const bad = structuredClone(project.data); bad.task_macros[macro.id].steps[0].task = createRelease(); assert.ok(validateDocument(bad).length);
  for (const patch of [{ execution_mode: 'unknown' }, { priority: -1 }, { takeovers: {} }]) {
    const invalid = structuredClone(project.data); Object.assign(invalid.week_sequences[sequence.id].event_groups[0], patch); assert.ok(validateDocument(invalid).length);
  }
  const copy = duplicateDay(draft, days.High); copy.slotReleases[0].condition = compare(constant(false), constant(true)); assert.equal(days.High.slotReleases[0].condition, null);
  const report = compileReport(draft); assert.deepEqual(report.errors, []); assert.match(report.data, /Release this slot/); assert.match(report.data, /Interrupt main schedule/);
});
test('day release references protect deletion/types and reconnect imported environment UUIDs', () => {
  const { draft, days, number } = flowControlFixture(); days.High.slotReleases = [{ ...createRelease(), condition: compare(reference(number), constant(10), '>') }, null, null];
  const session = createProjectSession(draft); assert.ok(session.variables.references(number).some((r) => r.path.includes('/slot_releases/')));
  assert.equal(session.variables.remove(number).ok, false); assert.equal(session.variables.update(number, { value_type: 'string' }).ok, false);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []); assert.equal(runtime.data.days[days.High.id].slot_releases[0].condition.operand_a.type, 'environment_reference');
  const env = compileEnvironment(draft).data, newId = crypto.randomUUID(); env.operand_nodes[newId] = env.operand_nodes[number]; delete env.operand_nodes[number];
  const imported = prepareEnvironmentImport(draft, env); assert.deepEqual(imported.errors, []);
  assert.equal(imported.draft.days.find((d) => d.id === days.High.id).slotReleases[0].condition.operand_a.reference_id, newId);
});
