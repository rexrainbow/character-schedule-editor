import { copy } from './utils.js';

/** Keeps only the active observation stack, never a record history or checkpoint data. */
export class Diagnostics {
  #emit; #context; #sequence = 0; #stack = []; #session = crypto.randomUUID();
  constructor(enabled, emit, context = () => ({})) { this.enabled = enabled === true; this.#emit = emit; this.#context = context; }
  #record(type, kind, data) { const call = this.#stack.findLast((item) => item.invocationId); this.#emit({ ...(call ? { invocationId: call.invocationId, attempt: call.attempt } : {}), ...data, type, kind, sequence: ++this.#sequence, sessionId: this.#session, context: copy({ ...this.#context(), ...(data.context ?? {}) }) }); }
  isActive(kind) { return this.enabled && this.#stack.at(-1)?.kind === kind; }
  begin(kind, details) {
    if (!this.enabled) return null;
    const id = `${this.#session}:${this.#sequence + 1}`, parentId = this.#stack.at(-1)?.id ?? null;
    const payload = details(); this.#stack.push({ id, kind, ...(payload.invocationId ? { invocationId: payload.invocationId, attempt: payload.attempt } : {}) }); this.#record('enter', kind, { id, parentId, ...payload }); return id;
  }
  end(kind, details = () => ({})) {
    if (!this.enabled) return;
    const index = this.#stack.findLastIndex((item) => item.kind === kind);
    if (index < 0) return;
    const [node] = this.#stack.splice(index); this.#record('exit', kind, { ...node, ...details() });
  }
  note(kind, details) { if (this.enabled) this.#record('record', kind, { parentId: this.#stack.at(-1)?.id ?? null, ...details() }); }
  skipped(kind, details) { if (this.enabled) { this.begin(kind, () => ({ ...details(), skipped: true })); this.end(kind); } }
  observe(kind, details, action, result = (value) => ({ value })) {
    if (!this.enabled) return action();
    this.begin(kind, details);
    try { const value = action(); this.end(kind, () => result(value)); return value; }
    catch (error) { this.end(kind, () => ({ failed: true, error: error.code ?? error.message })); throw error; }
  }
  fail(error) { if (this.enabled) while (this.#stack.length) this.end(this.#stack.at(-1).kind, () => ({ failed: true, error: error.code ?? error.message })); }
}
