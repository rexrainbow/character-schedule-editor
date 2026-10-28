import { Evaluator } from './Evaluator.js';
import { copy, fail, random } from './utils.js';
import { randomOffset } from '../core/randomValues.js';

/** Serializable frames, never JS generators/closures, hold every continuation. */
export class ExecutionMachine {
  constructor(program, emit, diagnostics) { this.program = program; this.emit = emit; this.diagnostics = diagnostics; }
  enterSlot(execution, ref) {
    const slot = this.program.get('slots', ref);
    if (this.diagnostics?.enabled) execution.frames.push({ kind: 'traceEnd', nodeKind: 'slot' });
    execution.frames.push({ kind: slot.mode === 'priority' ? 'priority' : 'branches', items: copy(slot.mode === 'priority' ? slot.candidates : slot.branches), index: 0, scope: {}, path: `/slots/${ref}/${slot.mode === 'priority' ? 'candidates' : 'branches'}` });
    if (this.diagnostics?.enabled) execution.frames.push({ kind: 'slotBegin', ref });
  }
  next(state, context) {
    const execution = state.execution, frames = execution.frames, evaluator = new Evaluator(this.program, state, context, this.emit, this.diagnostics);
    let operations = 0;
    while (frames.length) {
      const frame = frames.at(-1);
      if ((!['traceEnd', 'slotBegin'].includes(frame.kind) && ++operations > 20000) || frames.filter((item) => item.kind === 'macroEnd').length > 64) fail('executionLimit');
      if (frame.kind === 'slotBegin') { frames.pop(); const slot = this.program.get('slots', frame.ref); this.diagnostics?.begin('slot', () => ({ slotRef: frame.ref, path: `/slots/${frame.ref}`, empty: !(slot.candidates ?? slot.branches).length })); continue; }
      if (frame.kind === 'traceEnd') {
        frames.pop(); this.diagnostics?.end(frame.nodeKind);
        for (const skipped of frame.skipped ?? []) this.diagnostics?.skipped(frame.nodeKind, () => skipped);
        continue;
      }
      if (frame.kind === 'macroEnd') { frames.pop(); this.diagnostics?.end('macro'); this.emit('macro.end', { ...context, macroRef: frame.ref }); continue; }
      if (['sequence', 'branches', 'priority'].includes(frame.kind)) {
        if (frame.index >= frame.items.length) { frames.pop(); continue; }
        const index = frame.index++, item = frame.items[index], path = `${frame.path}/${index}`;
        if (frame.kind === 'branches') {
          const details = () => ({ condition: item.condition, index: index + 1, isElse: item.condition === null, unconditional: frame.items.length === 1 && item.condition === null, path });
          this.diagnostics?.begin('branch', details);
          const matched = evaluator.condition(item.condition, frame.scope, 0, `${path}/condition`);
          this.diagnostics?.note('selection', () => ({ result: matched }));
          if (!matched) { this.diagnostics?.end('branch', () => ({ result: false })); continue; }
          const skipped = this.diagnostics?.enabled ? frame.items.slice(index + 1).map((branch, offset) => ({ condition: branch.condition, index: index + 2 + offset, isElse: branch.condition === null, path: `${frame.path}/${index + 1 + offset}` })) : [];
          frame.index = frame.items.length;
          if (this.diagnostics?.enabled) frames.push({ kind: 'traceEnd', nodeKind: 'branch', skipped });
          frames.push({ kind: 'call', use: item.task, scope: frame.scope, path: `${path}/task` });
        } else if (frame.kind === 'priority') {
          this.diagnostics?.begin('candidate', () => ({ index: index + 1, task: item.task, path }));
          const macro = this.program.get('macros', item.task.task_macro_id), args = evaluator.arguments(item.task, macro, frame.scope, `${path}/task`);
          const matched = evaluator.condition(macro.eligibility ?? null, args, 0, `/task_macros/${item.task.task_macro_id}/eligibility`);
          this.diagnostics?.note('selection', () => ({ result: matched }));
          if (!matched) { this.diagnostics?.end('candidate', () => ({ result: false })); continue; }
          const skipped = this.diagnostics?.enabled ? frame.items.slice(index + 1).map((candidate, offset) => ({ index: index + 2 + offset, task: candidate.task, path: `${frame.path}/${index + 1 + offset}` })) : [];
          frame.index = frame.items.length;
          if (this.diagnostics?.enabled) frames.push({ kind: 'traceEnd', nodeKind: 'candidate', skipped });
          frames.push({ kind: 'call', use: item.task, scope: frame.scope, args, qualified: true, path: `${path}/task` });
        } else {
          this.diagnostics?.begin('step', () => ({ index: index + 1, path }));
          if (this.diagnostics?.enabled) frames.push({ kind: 'traceEnd', nodeKind: 'step' });
          frames.push({ kind: 'call', use: item.task, scope: frame.scope, path: `${path}/task` });
        }
        continue;
      }
      if (frame.kind !== 'call') fail('invalidExecutionFrame');
      frames.pop();
      const use = frame.use;
      if (use.task_macro_id) {
        const macro = this.program.get('macros', use.task_macro_id);
        this.diagnostics?.begin('macro', () => ({ macroRef: use.task_macro_id, path: frame.path, empty: !(macro.steps ?? macro.candidates ?? macro.branches ?? []).length }));
        const args = frame.args ?? evaluator.arguments(use, macro, frame.scope, frame.path);
        if (!frame.qualified && macro.eligibility != null) {
          this.diagnostics?.begin('guard', () => ({ path: `/task_macros/${use.task_macro_id}/eligibility` }));
          const matched = evaluator.condition(macro.eligibility, args, 0, `/task_macros/${use.task_macro_id}/eligibility`);
          this.diagnostics?.end('guard', () => ({ result: matched }));
          if (!matched) { this.diagnostics?.end('macro', () => ({ skipped: true })); continue; }
        }
        if (frames.some((item) => item.kind === 'macroEnd' && item.ref === use.task_macro_id)) fail('macroCycle');
        this.emit('macro.start', { ...context, macroRef: use.task_macro_id, arguments: copy(args) });
        frames.push({ kind: 'macroEnd', ref: use.task_macro_id });
        const kind = macro.mode === 'sequence' ? 'sequence' : macro.mode === 'priority' ? 'priority' : 'branches';
        frames.push({ kind, items: copy(macro.steps ?? macro.candidates ?? macro.branches ?? []), index: 0, scope: args, path: `/task_macros/${use.task_macro_id}/${kind === 'sequence' ? 'steps' : kind === 'priority' ? 'candidates' : 'branches'}` });
        continue;
      }
      const nodeKind = use.builtin === 'release_slot' ? 'control' : use.builtin === 'schedule_event' ? 'reservation' : use.builtin ? 'builtin' : 'task';
      const invocationId = `${state.runId}:${++state.invocations}`;
      this.diagnostics?.begin(nodeKind, () => ({ use, path: frame.path, invocationId, attempt: 1 }));
      const prepared = { use: copy(use), path: frame.path, arguments: {}, context: copy(context) };
      if (!use.builtin) {
        const task = this.program.get('tasks', use.task_id), args = evaluator.arguments(use, task, frame.scope, frame.path);
        prepared.taskRef = use.task_id; prepared.name = task.name;
        prepared.arguments = Object.fromEntries(task.parameters.map((p) => [p.name, args[p.id]]));
      } else {
        prepared.name = this.program.builtins[use.builtin]?.symbol ?? use.builtin;
        if (['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable'].includes(use.builtin)) {
          const target = use.target_variable_id, before = evaluator.read(target), node = this.program.get('variables', target);
          let value;
          if (use.builtin === 'toggle_variable') value = !before;
          else if (use.builtin === 'reset_variable') value = state.initialValues[target];
          else {
            value = evaluator.operand(use.value, frame.scope, 0, `${frame.path}/value`);
            if (use.builtin === 'increment_variable') {
              const amplitude = use.random_amplitude ? evaluator.operand(use.random_amplitude, frame.scope) : 0;
              const offset = randomOffset(amplitude, !!node.integer_only, () => random(state));
              prepared.random = { increment: value, random_amplitude: amplitude, random_offset: offset };
              this.diagnostics?.note('random', () => prepared.random);
              value = before + value + offset;
            }
          }
          prepared.target = target; prepared.value = value;
        } else if (use.builtin === 'adjust_probability_event') {
          prepared.eventRef = evaluator.event(use.event, frame.scope);
          const option = (value) => typeof value === 'string' ? value : evaluator.operand(value, frame.scope);
          prepared.property = option(use.property); prepared.operation = option(use.operation); prepared.value = evaluator.operand(use.value, frame.scope, 0, `${frame.path}/value`);
        } else if (use.builtin === 'schedule_event') prepared.offset = evaluator.operand(use.date.offset, frame.scope);
        else if (use.builtin === 'release_slot') prepared.result = evaluator.condition(use.condition ?? null, frame.scope, 0, `${frame.path}/condition`);
        else fail('unknownBuiltin', { builtin: use.builtin });
      }
      prepared.invocationId = invocationId;
      prepared.attempt = 0;
      return prepared;
    }
    return null;
  }
}
