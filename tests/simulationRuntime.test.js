import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { simulateSlot, simulateSequenceDay, evaluateSimulationExpressions, simulationInitialValues } from '../src/simulation/index.js';
import { simulateSlot as oldSlot } from './reference/simulationModel.js';
import { simulateSequenceDay as oldDay } from './reference/daySimulationModel.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { priorityMacroFixture } from './priorityMacroFixture.js';
import { computedBranchFixture } from './computedBranchFixture.js';
import { referenceFixture } from './referenceFixture.js';
import { flowControlFixture } from './flowControlFixture.js';

test('runtime-backed simulator matches the baseline for builtins, priorities, computed branches and parameter references', async () => {
  for (const fixture of [builtinVariableFixture, priorityMacroFixture, computedBranchFixture, referenceFixture]) {
    const { draft } = fixture(), before = structuredClone(draft);
    for (const slot of draft.slots) {
      const expected = oldSlot(draft, slot.id), actual = await simulateSlot(draft, slot.id);
      assert.deepEqual(actual.errors, [], JSON.stringify(actual.errors)); assert.deepEqual(expected.errors, []);
      assert.equal(actual.engine, 'runtime'); assert.deepEqual(actual.state, expected.state);
      assert.equal(actual.calls.length, expected.calls.length); assert.equal(actual.unmodeled, expected.unmodeled);
    }
    assert.deepEqual(draft, before);
  }
});

test('calendar simulation preserves manual occurrence and candidate decisions and progress bindings', async () => {
  const imported = importBlueprint(await readFile(new URL('./fixtures/life-simulation.yaml', import.meta.url), 'utf8'));
  const draft = imported.draft, sequence = draft.sequences[0], event = sequence.eventGroups.find((item) => item.kind === 'probability');
  for (const position of [0, 3, 6, 7, 13, 27]) for (const occurs of [false, true]) {
    const choices = { [event.id]: occurs };
    const expected = oldDay(draft, sequence.id, position, undefined, undefined, undefined, {}, choices);
    const actual = await simulateSequenceDay(draft, sequence.id, position, undefined, undefined, undefined, {}, choices);
    assert.deepEqual(actual.errors, [], JSON.stringify(actual.errors)); assert.deepEqual(actual.state, expected.state);
    assert.equal(actual.calls.length, expected.calls.length);
  }
});

test('expression previews share the runtime evaluator and unrelated unfinished slots do not block simulation', async () => {
  const { draft, slot, reward } = computedBranchFixture();
  const values = simulationInitialValues(draft), computed = evaluateSimulationExpressions(draft, values);
  assert.equal(computed[reward].value, 20);
  draft.slots.push({ id: crypto.randomUUID(), uid: crypto.randomUUID(), name: 'Unfinished', symbol: 'unfinished', icon: '', branches: [{ condition: null, task: { task_id: '', arguments: {} } }] });
  const result = await simulateSlot(draft, slot.id, values); assert.deepEqual(result.errors, []);
  const controller = new AbortController(); controller.abort();
  const cancelled = await simulateSlot(draft, slot.id, values, undefined, undefined, '1', { signal: controller.signal });
  assert.equal(cancelled.cancelled, true); assert.deepEqual(cancelled.state, values);
});

test('diagnostic adapter preserves cancellation reasons and conditional/unconditional release results', async () => {
  const countCancelled = (trace) => trace.reduce((sum, node) => sum + (node.cancelledBy ? 1 : 0) + countCancelled(node.children ?? []), 0);
  for (const condition of [undefined, null, { kind: 'comparison', comparator: '==', operand_a: { type: 'constant', value: false }, operand_b: { type: 'constant', value: true } }]) {
    const fixture = flowControlFixture(condition === undefined ? {} : { release: { builtin: 'release_slot', condition } });
    const expected = oldDay(fixture.draft, fixture.sequence.id, 0), actual = await simulateSequenceDay(fixture.draft, fixture.sequence.id, 0);
    assert.deepEqual(actual.errors, []); assert.deepEqual(actual.state, expected.state);
    assert.equal(actual.calls.length, expected.calls.length);
    assert.equal(countCancelled(actual.trace), countCancelled(expected.trace));
    assert.ok(countCancelled(actual.trace) > 0);
  }
});
