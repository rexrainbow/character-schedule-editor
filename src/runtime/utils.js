export const copy = (value) => structuredClone(value);
export function fail(code, details = {}) { throw Object.assign(new Error(code), { code, ...details }); }
export function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
// Identity check, not a cryptographic signature or an untrusted-file integrity check.
export function fingerprint(value) { let hash = 0xcbf29ce484222325n; for (const char of canonical(value)) { hash ^= BigInt(char.codePointAt(0)); hash = BigInt.asUintN(64, hash * 0x100000001b3n); } return hash.toString(16).padStart(16, '0'); }
export function jsonCopy(value) {
  function check(item) {
    if (item === null || ['string', 'boolean'].includes(typeof item)) return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || !Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) fail('nonSerializableState');
    Object.values(item).forEach(check);
  }
  check(value); return copy(value);
}
export function random(state) {
  function uint32() {
    state.randomState = (state.randomState + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state.randomState ^ state.randomState >>> 15, state.randomState | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return (value ^ value >>> 14) >>> 0;
  }
  return ((uint32() >>> 5) * 67108864 + (uint32() >>> 6)) / 9007199254740992;
}
export function seedNumber(seed) { let value = 2166136261; for (const char of String(seed)) value = Math.imul(value ^ char.codePointAt(0), 16777619); return value >>> 0; }

export class Emitter {
  #listeners = new Map();
  on(name, listener) { if (typeof listener !== 'function') fail('invalidListener'); const list = this.#listeners.get(name) ?? new Set(); list.add(listener); this.#listeners.set(name, list); return () => this.off(name, listener); }
  off(name, listener) { this.#listeners.get(name)?.delete(listener); }
  once(name, listener) { const remove = this.on(name, (event) => { remove(); listener(event); }); return remove; }
  emit(name, value) {
    const event = freeze(copy(value));
    for (const listener of [...(this.#listeners.get(name) ?? [])]) {
      try { const result = listener(event); if (result?.catch) result.catch((error) => this.#observerError(name, error)); }
      catch (error) { this.#observerError(name, error); }
    }
  }
  #observerError(name, error) { if (name !== 'observer.error') this.emit('observer.error', { event: name, message: String(error?.message ?? error) }); }
}

export class MemoryCheckpointStore {
  #values = new Map();
  async save(runId, snapshot) { this.#values.set(runId, jsonCopy(snapshot)); }
  async load(runId) { const value = this.#values.get(runId); return value ? copy(value) : null; }
  async remove(runId) { this.#values.delete(runId); }
}
