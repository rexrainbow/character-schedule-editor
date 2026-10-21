import { createActionSlot as createSlot } from './slotFixture.js';
import { createProjectWithEnvironment } from '../src/core/environmentModel.js';
import { addComputedNode, addOperandNode } from '../src/core/operandModel.js';
import { } from '../src/core/model.js';
export const constant = (value) => ({ type: 'constant', value });
export const compare = (a, comparator, b) => ({ kind: 'comparison', operand_a: a, comparator, operand_b: b });
export const numeric = (value) => ({ kind: 'number', expression: constant(value) });
export const boolean = (value) => ({ kind: 'boolean', condition: compare(constant(value), '==', constant(true)) });
export function computedBranchFixture() {
  const draft = createProjectWithEnvironment('Branch calculations', 3, null);
  const weekday = Object.entries(draft.operandNodes).find(([, n]) => n.symbol === 'schedule_current_weekday')[0];
  const currentSlot = Object.entries(draft.operandNodes).find(([, n]) => n.symbol === 'schedule_current_slot')[0];
  let result = addComputedNode(draft.operandNodes, null, 'Reward'); const reward = result.id;
  result.nodes[reward].symbol = 'calc_reward';
  result.nodes[reward].definition = { kind: 'branch', branches: [{ condition: compare({ type: 'reference', reference_id: weekday }, '>=', constant(6)), result: numeric(5) }, { condition: null, result: numeric(20) }] };
  result = addComputedNode(result.nodes, null, 'Is later slot', 'environment'); const later = result.id;
  result.nodes[later] = { ...result.nodes[later], symbol: 'schedule_is_later_slot', value_type: 'boolean', definition: { kind: 'branch', branches: [{ condition: compare({ type: 'reference', reference_id: currentSlot }, '==', constant(1)), result: boolean(false) }, { condition: null, result: boolean(true) }] } };
  result = addOperandNode(result.nodes, null, 'value', 'Balance', 'application'); const balance = result.id;
  draft.operandNodes = result.nodes;
  const slot = createSlot([], 'Reward slot'); slot.branches[0].task = { builtin: 'set_variable', target_variable_id: balance, value: { type: 'expression_macro_reference', expression_macro_id: reward } };
  draft.slots = [slot]; draft.builtinTasks = { set_variable: { symbol: 'engine_assign' } };
  return { draft, reward, later, balance, weekday, currentSlot, slot };
}
