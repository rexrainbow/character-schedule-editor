import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Program } from '../src/runtime/index.js';
import { seedNumber, random, fingerprint } from '../src/runtime/utils.js';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { replayRuntimeCase } from '../scripts/lib/runtime-conformance.mjs';
import { runtimeCases } from '../scripts/fixtures/runtime-conformance.mjs';

const data = JSON.parse(await readFile(new URL('../src/runtime/conformance/cases.json', import.meta.url), 'utf8'));

test('portable primitive vectors cover uint32 randomness, Unicode seeds and canonical Program fingerprints', () => {
  assert.equal(data.format, 'schedule-runtime-conformance');
  for (const vector of data.vectors) {
    const state = { randomState: seedNumber(vector.seed) };
    assert.equal(state.randomState, vector.initialState);
    for (const draw of vector.draws) {
      assert.equal(random(state), draw.value);
      assert.equal(state.randomState, draw.state);
    }
  }
  for (const vector of data.identities) assert.equal(fingerprint(vector.value), vector.fingerprint);
});

for (const fixture of data.cases) test(`portable runtime case: ${fixture.id}`, { timeout: 10000 }, async () => {
  const source = runtimeCases.find((item) => item.id === fixture.id);
  assert.ok(source);
  const compiled = importBlueprint(source.yaml);
  assert.deepEqual(compiled.errors, []);
  assert.deepEqual(Program.fromProject(compiled.draft, { referenceMode: 'name' }).toJSON(), fixture.program, 'Source scenario must match the published executable input');
  assert.deepEqual(await replayRuntimeCase(fixture), fixture.expected);
  if (fixture.id === 'selection-and-writes') {
    assert.deepEqual(fixture.expected[0].trace.filter((event) => event.event === 'variable.change').map((event) => event.after), [10, 7, 8, 5]);
  }
  if (fixture.id === 'days-events-and-release') assert.deepEqual(fixture.expected.map((item) => item.variables.n), [111, 113, 124, 226, 237, 239, 350, 352, 363]);
  if (fixture.id === 'pending-task-resume') {
    const paused = fixture.expected[2], restored = fixture.expected[3], finished = fixture.expected[4];
    assert.equal(paused.variables.n, 1, 'Staged handler write must roll back');
    assert.deepEqual(restored.pending, paused.pending);
    assert.equal(finished.variables.n, 11 + paused.pending.arguments.amount);
    const retried = finished.trace.find((event) => event.event === 'task.start' && event.name === 'wait');
    assert.equal(retried.invocationId, paused.pending.invocationId);
    assert.equal(retried.attempt, 2);
    assert.deepEqual(retried.arguments, paused.pending.arguments);
  }
});
