import { Diagnostics } from './Diagnostics.js';
import { Program } from './Program.js';
import { Evaluator } from './Evaluator.js';
import { ExecutionMachine } from './ExecutionMachine.js';
import { DayExecution } from './DayExecution.js';
import { Emitter, MemoryCheckpointStore, copy, fail, jsonCopy, seedNumber } from './utils.js';
import { withinBounds } from '../core/variableBounds.js';
import { scheduledPosition } from '../core/scheduledEvents.js';
import { sequenceExecutionRange as sequenceRange } from '../core/sequenceExecution.js';
import { eventDaySourceFromData } from '../core/eventDaySource.js';

function snapshot(program, state) { return jsonCopy({ format: 'schedule-runtime-checkpoint', programId: program.id, referenceMode: program.referenceMode, state }); }
function validateValues(program, values) {
  const initial = program.initialValues();
  if (Object.keys(values).length !== Object.keys(initial).length) fail('invalidStateVariables');
  for (const [ref, fallback] of Object.entries(initial)) {
    const node = program.get('variables', ref), value = values[ref];
    if (typeof value !== typeof fallback || typeof value === 'number' && (!Number.isFinite(value) || node.integer_only && !Number.isInteger(value) || !withinBounds(node, value))) fail('invalidStateValue', { ref });
  }
}

/** One resumable run. Mutable state is private; handlers receive transaction-scoped access. */
export class Runtime extends Emitter {
  #diagnostics; #yieldEvery; #starting = false; #state; #handlers = new Map(); #store; #decisions; #running = null; #pauseRequested = false; #controller = null; #active = null;
  constructor({ program, checkpoint, checkpointStore = new MemoryCheckpointStore(), runId = crypto.randomUUID(), seed = '1', initialState = {}, taskHandlers = {}, decisions = {}, unhandledTasks = 'error', diagnostics = false, progressBindings = {}, initialValues, yieldEvery = 128 } = {}) {
    super();
    Object.defineProperty(this, 'program', { value: program instanceof Program ? program : Program.fromJSON(program), enumerable: true });
    this.#diagnostics = new Diagnostics(diagnostics, (record) => this.emit('diagnostic', { runId: this.runId, ...record }), () => this.#state?.execution ? DayExecution.context(this.#state.execution) : {});
    this.#yieldEvery = Math.max(1, Number.isSafeInteger(yieldEvery) ? yieldEvery : 128);
    this.#store = checkpointStore; this.#decisions = decisions;
    if (!['error', 'record'].includes(unhandledTasks)) fail('invalidUnhandledTaskPolicy');
    this.unhandledTasks = unhandledTasks;
    if (checkpoint) {
      if (checkpoint.format !== 'schedule-runtime-checkpoint' || checkpoint.programId !== this.program.id || checkpoint.referenceMode !== this.program.referenceMode) fail('checkpointProgramMismatch');
      this.#state = jsonCopy(checkpoint.state);
      if (typeof this.#state.runId !== 'string' || !Number.isSafeInteger(this.#state.invocations) || this.#state.invocations < 0 || !Number.isSafeInteger(this.#state.randomState)) fail('invalidCheckpoint');
      if (!Array.isArray(this.#state.reservations) || !this.#state.events || !this.#state.lastDays) fail('invalidCheckpoint');
      const execution = this.#state.execution;
      if (execution && (!Array.isArray(execution.frames) || !Array.isArray(execution.phases) || !Array.isArray(execution.sources) || !Number.isSafeInteger(execution.phaseIndex) || execution.phaseIndex < 0 || execution.phaseIndex > execution.phases.length)) fail('invalidCheckpoint');
      if (execution?.pending?.taskRef) this.program.get('tasks', execution.pending.taskRef);
      this.#state.status = execution?.done ? 'completed' : 'paused';
    } else {
      const values = this.program.initialValues();
      for (const [name, value] of Object.entries(initialState)) values[this.program.resolve('variables', name)] = value;
      const events = Object.fromEntries(this.program.entries('sequences').flatMap(([, sequence]) => sequence.eventGroups.filter((event) => event.kind === 'probability').map((event) => [event.id, { probability_percent: event.probability_percent, cooldown_days: event.cooldown_days, cooldown_remaining: 0 }])));
      this.#state = { runId, status: 'idle', variables: values, initialValues: initialValues ? copy(initialValues) : this.program.initialValues(), progressBindings: copy(progressBindings), events, sequential: {}, reservations: [], lastDays: {}, randomState: seedNumber(seed), invocations: 0, execution: null, unmodeled: false };
    }
    validateValues(this.program, this.#state.variables); validateValues(this.program, this.#state.initialValues);
    for (const [name, handler] of Object.entries(taskHandlers)) this.registerTask(name, handler);
  }
  static restore(options) { return new Runtime(options); }
  static async load({ checkpointStore, runId, ...options }) { const checkpoint = await checkpointStore.load(runId); if (!checkpoint) fail('checkpointNotFound'); return new Runtime({ ...options, checkpointStore, checkpoint }); }
  get status() { return this.#state.status; }
  get runId() { return this.#state.runId; }
  getState() { return copy(this.#state); }
  snapshot() { return snapshot(this.program, this.#state); }
  async saveCheckpoint() { if (this.#running || this.#starting) fail('runtimeBusy'); this.#starting = true; try { await this.#persist(); return this.snapshot(); } finally { this.#starting = false; } }
  registerTask(name, handler) {
    if (this.#running || this.#starting) fail('runtimeBusy');
    if (typeof handler !== 'function') fail('invalidTaskHandler');
    const ref = this.program.resolve('tasks', name);
    this.#handlers.set(this.program.get('tasks', ref).name, handler); return this;
  }
  getVariable(ref) { return new Evaluator(this.program, this.#state).read(ref); }
  async setVariable(ref, value, { system = false } = {}) {
    if (this.#running || this.#starting) fail('runtimeBusy');
    this.#starting = true;
    try { const next = copy(this.#state); new Evaluator(this.program, next).write(ref, value, system); await this.#commit(next); return this.getVariable(ref); } finally { this.#starting = false; }
  }
  #assertCanStart() { if (this.#running || this.#starting || this.#state.execution && !this.#state.execution.done) fail('executionAlreadyActive'); }
  async startDay(options) {
    this.#assertCanStart();
    this.#starting = true;
    try {
      const next = copy(this.#state); next.execution = DayExecution.create(this.program, next, options, this.#decisions); next.status = 'ready';
      this.#progress(next); await this.#commit(next); return this.snapshot();
    } finally { this.#starting = false; }
  }
  async startSlot({ slot }) { this.#assertCanStart(); this.#starting = true; try { const next = copy(this.#state); next.execution = DayExecution.slot(this.program, slot); next.status = 'ready'; await this.#commit(next); return this.snapshot(); } finally { this.#starting = false; } }
  async runDay(options) { await this.startDay(options); return this.resume(); }
  previewDay(options) {
    if (this.#running || this.#starting) fail('runtimeBusy');
    return copy(DayExecution.create(this.program, copy(this.#state), options, this.#decisions));
  }
  async runSlot(options) { await this.startSlot(options); return this.resume(); }
  async nextDay() {
    const execution = this.#state.execution;
    if (!execution?.done || execution.kind !== 'day') fail('dayNotCompleted');
    await this.startDay({ sequence: execution.sequenceRef, position: execution.position + 1 }); return this.resume();
  }
  resume() { return this.#run(false); }
  step() { return this.#run(true); }
  async pause() {
    if (this.#starting) fail('runtimeBusy');
    this.#pauseRequested = true; this.#controller?.abort();
    if (this.#running) await this.#running;
    else { this.#state.status = this.#state.execution?.done ? 'completed' : 'paused'; await this.#persist(); }
    return this.snapshot();
  }
  #run(single) {
    if (this.#running || this.#starting) fail('runtimeBusy');
    if (!this.#state.execution) fail('noExecution');
    if (this.#state.execution.done) return Promise.resolve(this.snapshot());
    this.#pauseRequested = false;
    const promise = Promise.resolve().then(() => this.#drive(single));
    this.#running = promise.finally(() => { this.#running = null; });
    return this.#running;
  }
  #emit(name, context = {}) {
    this.emit(name, { runId: this.runId, ...copy(context) });
    if (name === 'phase.start') this.#diagnostics.begin('phase', () => ({ ...context, context }));
    else if (name === 'phase.end') this.#diagnostics.end('phase', () => ({ context }));
    else if (name === 'assignment.start') this.#diagnostics.begin('daySlot', () => ({ ...context, context }));
    else if (name === 'assignment.end') this.#diagnostics.end('daySlot', () => ({ context }));
    else if (name === 'assignment.skipped') this.#diagnostics.skipped('daySlot', () => ({ ...context, context, cancelled: true }));
    else if (name === 'execution.error') this.#diagnostics.fail(new Error(context.code));
  }
  async #persist() { await this.#store.save(this.runId, this.snapshot()); }
  async #commit(next) { await this.#store.save(next.runId, snapshot(this.program, next)); this.#state = next; }
  #progress(state) {
    const execution = state.execution;
    if (execution.kind !== 'day') return;
    const currentSlot = (execution.phases[execution.phaseIndex]?.slotIndex ?? 0) + 1;
    const values = { current_week: execution.weekNumber, current_weekday: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(execution.weekday) + 1, current_day: execution.dayNumber, current_slot: currentSlot, slots_per_day: this.program.settings.slots_per_day, total_weeks: sequenceRange(this.program.get('sequences', execution.sequenceRef)).totalWeeks ?? 0 };
    const bindings = state.progressBindings ?? {}, used = new Set();
    for (const [role, value] of Object.entries(values)) {
      const explicit = Object.hasOwn(bindings, role);
      const ref = explicit ? bindings[role] ? this.program.resolve('variables', bindings[role]) : null : this.program.entries('variables').find(([, node]) => node.name === `schedule_${role}`)?.[0];
      if (!ref) continue;
      const variable = this.program.get('variables', ref);
      if ((variable.scope ?? 'environment') !== 'environment' || variable.value_type !== 'number' || used.has(ref)) fail('simulationInvalidBinding', { path: `/progress_bindings/${role}` });
      used.add(ref); new Evaluator(this.program, state).write(ref, value, true);
    }
  }
  async #advance() {
    const execution = this.#state.execution;
    let transitions = 0;
    const machine = new ExecutionMachine(this.program, (name, event) => this.#emit(name, { ...DayExecution.context(execution), ...event }), this.#diagnostics);
    while (!execution.done && !this.#pauseRequested) {
      if (++transitions > 100000) fail('executionLimit');
      if (transitions % this.#yieldEvery === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      if (execution.pending) return execution.pending;
      const phase = execution.phases[execution.phaseIndex];
      if (!phase) {
        execution.done = true; this.#state.status = 'completed';
        if (execution.kind === 'day') this.#state.lastDays[execution.sequenceRef] = execution.position;
        await this.#persist(); this.#emit('execution.completed', DayExecution.context(execution)); return null;
      }
      if (!execution.phaseStarted) {
        execution.phaseStarted = true;
        if (phase.name === 'slot.start') { execution.claims = []; execution.released = []; }
        this.#progress(this.#state); await this.#persist();
        const context = DayExecution.context(execution);
        this.#emit('phase.start', context);
        if (['day.start', 'slot.start', 'slot.body'].includes(phase.name)) this.#emit(phase.name, context);
      }
      if (execution.assignment) {
        // Preparation may evaluate nested branches, arguments and random values. On failure,
        // keep the original continuation so retry cannot silently skip the failing operation.
        const before = copy(this.#state);
        let prepared;
        try { prepared = machine.next(this.#state, DayExecution.context(execution)); }
        catch (error) { this.#state = before; throw error; }
        if (prepared) { execution.pending = prepared; await this.#persist(); return prepared; }
        const context = DayExecution.context(execution);
        DayExecution.finishAssignment(execution); await this.#persist(); this.#emit('assignment.end', context);
        continue;
      }
      if (execution.sourceIndex < execution.sources.length) {
        const assignment = DayExecution.assignment(this.program, execution);
        if (DayExecution.blocked(execution, assignment)) { execution.sourceIndex++; await this.#persist(); this.#emit('assignment.skipped', { ...DayExecution.context(execution), ...assignment, cancelledBy: execution.claims.find((claim) => claim.occurrenceId !== assignment.occurrenceId) ?? { name: assignment.name, reason: 'slotReleased' } }); continue; }
        execution.assignment = assignment;
        if (assignment.release) execution.frames.push({ kind: 'call', use: assignment.release, scope: {}, path: `/days/${assignment.dayRef}/slotReleases/${phase.slotIndex}` });
        if (assignment.slotRef) machine.enterSlot(execution, assignment.slotRef);
        await this.#persist(); this.#emit('assignment.start', DayExecution.context(execution));
        continue;
      }
      const context = DayExecution.context(execution);
      execution.phaseIndex++; execution.sourceIndex = 0; execution.phaseStarted = false;
      await this.#persist(); this.#emit('phase.end', context);
      if (['day.end', 'slot.end'].includes(phase.name)) this.#emit(phase.name, context);
    }
    return null;
  }
  async #drive(single) {
    this.#state.status = 'running';
    this.#emit('execution.resumed', DayExecution.context(this.#state.execution));
    let completed = 0;
    try {
      while (!this.#pauseRequested && !this.#state.execution.done) {
        const pending = await this.#advance();
        if (!pending || this.#pauseRequested) break;
        await this.#execute(pending);
        if (++completed % this.#yieldEvery === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        if (single) { this.#state.status = 'paused'; await this.#persist(); return this.snapshot(); }
      }
      if (this.#pauseRequested && !this.#state.execution.done) { this.#state.status = 'paused'; await this.#persist(); this.#emit('execution.paused', DayExecution.context(this.#state.execution)); }
      return this.snapshot();
    } catch (error) {
      this.#diagnostics.fail(error);
      if (error.code === 'executionPaused') { this.#state.status = 'paused'; await this.#persist(); this.#emit('execution.paused', DayExecution.context(this.#state.execution)); return this.snapshot(); }
      this.#state.status = 'failed';
      try { await this.#persist(); } catch { /* Preserve the original failure. The last durable checkpoint remains authoritative. */ }
      this.#emit('execution.error', { ...DayExecution.context(this.#state.execution), code: error.code ?? 'taskFailed', message: error.message });
      throw error;
    }
  }
  async #execute(pending) {
    pending.attempt++; await this.#persist();
    const next = copy(this.#state), changes = [], controller = new AbortController(), token = {};
    this.#controller = controller; this.#active = token;
    const current = () => { if (controller.signal.aborted || this.#active !== token) fail('executionPaused'); };
    const evaluator = new Evaluator(this.program, next, pending.context, undefined, this.#diagnostics);
    const variable = (value) => typeof value === 'string' ? value : value?.reference_id ?? fail('invalidVariableReference');
    const context = {
      ...copy(pending.context), invocationId: pending.invocationId, attempt: pending.attempt, signal: controller.signal,
      getVariable: (ref) => { current(); if (ref?.access === 'write') fail('variableReadForbidden'); return evaluator.read(variable(ref)); },
      setVariable: (ref, value) => { current(); if (ref?.access === 'read') fail('variableWriteForbidden'); return evaluator.write(variable(ref), value); },
    };
    const nodeKind = pending.use.builtin === 'release_slot' ? 'control' : pending.use.builtin === 'schedule_event' ? 'reservation' : pending.use.builtin ? 'builtin' : 'task';
    if (!this.#diagnostics.isActive(nodeKind)) this.#diagnostics.begin(nodeKind, () => ({ use: pending.use, path: pending.path, invocationId: pending.invocationId, attempt: pending.attempt }));
    this.#emit('task.start', { ...pending.context, name: pending.name, invocationId: pending.invocationId, attempt: pending.attempt, arguments: pending.arguments });
    let abortListener;
    try {
      current();
      let result, outcome = {};
      if (pending.use.builtin) outcome = this.#builtin(next, pending, evaluator) ?? {};
      else {
        const handler = this.#handlers.get(pending.name);
        if (!handler && this.unhandledTasks === 'error') fail('missingTaskHandler', { name: pending.name });
        if (!handler) { next.unmodeled = true; this.#emit('task.unhandled', { ...pending.context, name: pending.name, invocationId: pending.invocationId }); }
        else {
          const aborted = new Promise((_, reject) => { abortListener = () => reject(Object.assign(new Error('executionPaused'), { code: 'executionPaused' })); controller.signal.addEventListener('abort', abortListener, { once: true }); });
          result = await Promise.race([Promise.resolve().then(() => { current(); return handler(copy(pending.arguments), context); }), aborted]);
          if (result !== undefined) jsonCopy(result);
        }
      }
      current();
      for (const [ref, after] of Object.entries(next.variables)) if (!Object.is(this.#state.variables[ref], after)) changes.push({ ref, name: this.program.get('variables', ref).name, before: this.#state.variables[ref], after });
      next.execution.pending = null;
      await this.#commit(next);
      for (const change of changes) this.#diagnostics.note('variable.committed', () => ({ ...change, invocationId: pending.invocationId, attempt: pending.attempt, committed: true }));
      this.#diagnostics.end(nodeKind, () => ({ ...outcome, completed: true, invocationId: pending.invocationId, attempt: pending.attempt, pending }));
      for (const change of changes) this.#emit('variable.change', { ...pending.context, ...change, invocationId: pending.invocationId });
      this.#emit('task.completed', { ...pending.context, name: pending.name, invocationId: pending.invocationId, attempt: pending.attempt, ...(result === undefined ? {} : { result }) });
    } catch (error) {
      error.path ??= pending.path;
      this.#diagnostics.note(error.code === 'executionPaused' ? 'task.aborted' : 'task.failed', () => ({ invocationId: pending.invocationId, attempt: pending.attempt, code: error.code ?? 'taskFailed', path: pending.path, committed: false }));
      this.#diagnostics.fail(error); throw error;
    } finally {
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
      this.#active = null; this.#controller = null;
    }
  }
  #builtin(state, pending, evaluator) {
    const { use } = pending;
    if (['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable'].includes(use.builtin)) { const before = evaluator.read(pending.target); evaluator.write(pending.target, pending.value); return { target_variable_id: pending.target, before, requested: pending.value, after: evaluator.read(pending.target) }; }
    if (use.builtin === 'release_slot') {
      const source = state.execution.assignment;
      if (source?.type === 'event' && source.executionMode !== 'overlay' && pending.context.phase === 'slot.start' && pending.result) state.execution.released.push(source.occurrenceId);
      const applied = source?.type === 'event' && source.executionMode !== 'overlay' && pending.context.phase === 'slot.start';
      return { result: pending.result, applied, reason: !applied ? state.execution.kind === 'day' ? 'releaseInactive' : 'controlNoDayContext' : pending.result ? 'slotReleased' : 'releaseNotMatched' };
    }
    if (use.builtin === 'adjust_probability_event') {
      if (!['probability_percent', 'cooldown_days'].includes(pending.property) || !['set', 'increase'].includes(pending.operation)) fail(pending.property === 'cooldown_days' ? 'invalidEventCooldown' : 'invalidEventAdjustment');
      const settings = state.events[pending.eventRef], value = pending.operation === 'increase' ? settings[pending.property] + pending.value : pending.value;
      if (!Number.isFinite(value) || pending.property === 'cooldown_days' && !Number.isSafeInteger(value)) fail(pending.property === 'cooldown_days' ? 'invalidEventCooldown' : 'invalidEventAdjustment');
      const before = settings[pending.property]; settings[pending.property] = Math.max(0, pending.property === 'probability_percent' ? Math.min(100, value) : value); return { event_group_id: pending.eventRef, property: pending.property, operation: pending.operation, before, after: settings[pending.property] };
    }
    if (use.builtin === 'schedule_event') {
      const execution = state.execution;
      if (execution.kind !== 'day') fail('scheduleContextRequired');
      const target = scheduledPosition(use.date, pending.offset, execution.position), range = sequenceRange(this.program.get('sequences', execution.sequenceRef));
      if (target.error || target.position > range.end || target.position < range.start) { this.#emit('reservation.rejected', { ...pending.context, reason: target.error ?? 'scheduleOutsideSequence' }); return { accepted: false, reason: target.error ?? 'scheduleOutsideSequence' }; }
      const id = `reservation:${pending.invocationId}`;
      state.reservations.push({ id, sequenceRef: execution.sequenceRef, position: target.position, event: { id, kind: 'once', name: id, display_name: use.display_name, priority: use.priority, executionMode: use.execution_mode, ...eventDaySourceFromData(use) } });
      return { accepted: true, reservation: state.reservations.at(-1) };
    }
    fail('unknownBuiltin');
  }
}

export const createRuntime = (options) => new Runtime(options);
