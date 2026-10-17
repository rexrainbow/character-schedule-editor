import { createProjectWithEnvironment } from '../src/environmentModel.js';
import { addComputedNode, addOperandNode } from '../src/operandModel.js';
import { createSlot } from '../src/model.js';
export const constant = (value) => ({ type: 'constant', value });
export const compare = (a, comparator, b) => ({ kind: 'comparison', operand_a: a, comparator, operand_b: b });
export const numeric = (value) => ({ kind: 'number', expression: constant(value) });
export const boolean = (value) => ({ kind: 'boolean', condition: compare(constant(value), '==', constant(true)) });
export function computedBranchFixture() {
  const draft = createProjectWithEnvironment('Branch calculations', 3, null);
  const weekday = Object.entries(draft.operandNodes).find(([, n]) => n.engine_key === 'schedule.current_weekday')[0];
  const currentSlot = Object.entries(draft.operandNodes).find(([, n]) => n.engine_key === 'schedule.current_slot')[0];
  let result = addComputedNode(draft.operandNodes, null, 'Reward'); const reward = result.id;
  result.nodes[reward].engine_key = 'calc.reward';
  result.nodes[reward].definition = { kind: 'branch', branches: [{ condition: compare({ type: 'reference', reference_id: weekday }, '>=', constant(6)), result: numeric(5) }, { condition: null, result: numeric(20) }] };
  result = addComputedNode(result.nodes, null, 'Is later slot', 'environment'); const later = result.id;
  result.nodes[later] = { ...result.nodes[later], engine_key: 'schedule.is_later_slot', value_type: 'boolean', definition: { kind: 'branch', branches: [{ condition: compare({ type: 'reference', reference_id: currentSlot }, '==', constant(1)), result: boolean(false) }, { condition: null, result: boolean(true) }] } };
  result = addOperandNode(result.nodes, null, 'value', 'Balance', 'application'); const balance = result.id;
  draft.operandNodes = result.nodes;
  const slot = createSlot([], 'Reward slot'); slot.branches[0].task = { builtin: 'set_variable', target_variable_id: balance, value: { type: 'expression_macro_reference', expression_macro_id: reward } };
  draft.slots = [slot]; draft.builtinTasks = { set_variable: { engine_key: 'engine.assign' } };
  return { draft, reward, later, balance, weekday, currentSlot, slot };
}
