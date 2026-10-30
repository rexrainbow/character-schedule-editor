import { Program, Runtime } from '../../src/runtime/index.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** Portable fixture protocol; no GUI, YAML parser or project compiler is needed to replay. */
export async function replayRuntimeCase(fixture) {
  const trace = [], observations = [];
  let pauseGate = null;
  const taskHandlers = Object.fromEntries(Object.entries(fixture.handlers ?? {}).map(([name, actions]) => [name, async (args, context) => {
    for (const action of actions) {
      if (action.op !== 'increment') throw new Error(`Unknown fixture handler action: ${action.op}`);
      context.setVariable(action.variable, context.getVariable(action.variable) + (action.argument ? args[action.argument] : action.value));
    }
    if (pauseGate?.task === name) {
      const gate = pauseGate; gate.entered.resolve();
      await new Promise((resolve) => { if (context.signal.aborted) resolve(); else context.signal.addEventListener('abort', resolve, { once: true }); });
    }
  }]));
  const program = Program.fromJSON(fixture.program);
  function attach(runtime) {
    for (const event of ['phase.start', 'assignment.start', 'assignment.skipped', 'task.start', 'task.completed', 'variable.change']) runtime.on(event, (record) => {
      const keys = ['name', 'phase', 'slotIndex', 'eventRef', 'dayRef', 'slotRef', 'occurrenceId', 'invocationId', 'attempt', 'arguments', 'ref', 'before', 'after'];
      trace.push({ event, ...Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, clone(record[key])])) });
    });
    return runtime;
  }
  let runtime = attach(new Runtime({ program, ...fixture.options, taskHandlers }));
  for (const operation of fixture.operations) {
    let error = null;
    try {
      if (operation.op === 'runSlot') await runtime.runSlot({ slot: operation.slot });
      else if (operation.op === 'startSlot') await runtime.startSlot({ slot: operation.slot });
      else if (operation.op === 'runDay') await runtime.runDay({ sequence: operation.sequence, dayIndex: operation.dayIndex ?? 0 });
      else if (operation.op === 'nextDay') await runtime.nextDay();
      else if (operation.op === 'step') await runtime.step();
      else if (operation.op === 'resume') await runtime.resume();
      else if (operation.op === 'restore') runtime = attach(Runtime.restore({ program, checkpoint: clone(runtime.snapshot()), taskHandlers }));
      else if (operation.op === 'resumeAndPause') {
        pauseGate = { task: operation.task, entered: deferred() };
        const running = runtime.resume();
        // If execution ends before reaching the requested handler, report an invalid fixture.
        const reached = await Promise.race([pauseGate.entered.promise.then(() => true), running.then(() => false)]);
        if (!reached) throw new Error('pauseTargetNotReached');
        await runtime.pause(); await running; pauseGate = null;
      } else throw new Error(`Unknown fixture operation: ${operation.op}`);
    } catch (failure) { error = failure.code ?? failure.message; }
    const state = runtime.getState(), execution = state.execution;
    const pending = execution?.pending;
    observations.push({ operation: clone(operation), error, status: runtime.status,
      variables: state.variables, events: state.events, sequential: state.sequential, reservations: state.reservations,
      randomState: state.randomState, invocations: state.invocations,
      date: execution?.kind === 'day' ? { position: execution.position, dayNumber: execution.dayNumber } : null,
      pending: pending ? Object.fromEntries(['name', 'arguments', 'invocationId', 'attempt', 'value', 'target', 'result'].filter((key) => pending[key] !== undefined).map((key) => [key, clone(pending[key])])) : null,
      trace: trace.splice(0),
    });
  }
  return observations;
}
