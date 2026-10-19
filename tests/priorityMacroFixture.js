import { builtinVariableFixture } from './builtinVariableFixture.js';
import { createTaskMacro, createCandidate, createTaskStep } from '../src/core/taskMacroModel.js';
export const constant = (value) => ({ type: 'constant', value });
export const parameter = (id) => ({ type: 'parameter_reference', parameter_id: id });
export const reference = (id) => ({ type: 'reference', reference_id: id });
export function priorityMacroFixture() {
  const base = builtinVariableFixture(), { draft, number, readonly } = base;
  const eligible = createTaskMacro('Eligible increase'), amount = { id: crypto.randomUUID(), display_name: 'Amount', type: 'number' };
  eligible.parameters = [amount];
  eligible.eligibility = { kind: 'comparison', operand_a: reference(number), comparator: '>=', operand_b: parameter(amount.id) };
  eligible.steps = [{ ...createTaskStep(), task: { builtin: 'increment_variable', target_variable_id: number, value: parameter(amount.id) } }];
  const unsafe = createTaskMacro('Unsafe later candidate');
  unsafe.eligibility = { kind: 'comparison', operand_a: { type: 'expression', operator: '/', operand_a: constant(1), operand_b: reference(readonly) }, comparator: '>', operand_b: constant(0) };
  unsafe.steps = [{ ...createTaskStep(), task: { builtin: 'increment_variable', target_variable_id: number, value: constant(100) } }];
  const priority = createTaskMacro('Choose activity', 'priority');
  priority.candidates = [20, 5].map((value) => ({ ...createCandidate(), task: { task_macro_id: eligible.id, arguments: { [amount.id]: constant(value) } } }));
  priority.candidates.push({ ...createCandidate(), task: { task_macro_id: unsafe.id, arguments: {} } });
  draft.taskMacros = [eligible, unsafe, priority];
  draft.slots[0].name = 'Priority activity'; draft.slots[0].branches[0].task = { task_macro_id: priority.id, arguments: {} };
  draft.slots.splice(1);
  return { ...base, eligible, unsafe, priority, amount, slot: draft.slots[0] };
}
