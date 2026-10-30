import { mkdir, writeFile } from 'node:fs/promises';
import { importBlueprint } from '../src/core/blueprint/index.js';
import { Program } from '../src/runtime/index.js';
import { seedNumber, random, fingerprint } from '../src/runtime/utils.js';
import { runtimeCases } from './fixtures/runtime-conformance.mjs';
import { replayRuntimeCase } from './lib/runtime-conformance.mjs';

const cases = [];
for (const source of runtimeCases) {
  const compiled = importBlueprint(source.yaml);
  if (compiled.errors.length) throw new Error(`${source.id}: ${JSON.stringify(compiled.errors)}`);
  const fixture = { id: source.id, description: source.description,
    program: Program.fromProject(compiled.draft, { referenceMode: 'name' }).toJSON(),
    options: { runId: source.id, seed: '1', ...source.options }, handlers: source.handlers ?? {}, operations: source.operations };
  fixture.expected = await replayRuntimeCase(fixture);
  if (fixture.expected.some((observation) => observation.error)) throw new Error(`Fixture failed: ${source.id}`);
  cases.push(fixture);
}
const seeds = ['1', 'port-測試😀'];
const vectors = seeds.map((seed) => { const state = { randomState: seedNumber(seed) }; return { seed, initialState: state.randomState, draws: Array.from({ length: 4 }, () => ({ value: random(state), state: state.randomState })) }; });
const identities = [{ z: 1, a: [true, null, '測試😀'] }, { a: 0.0000001, b: 1e21 }].map((value) => ({ value, fingerprint: fingerprint(value) }));
const output = new URL('../src/runtime/conformance/cases.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify({ format: 'schedule-runtime-conformance', vectors, identities, cases }, null, 2) + '\n');
console.log(`Runtime conformance: ${cases.length} cases generated. Review expected-result changes before accepting them.`);
