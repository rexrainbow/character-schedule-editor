import { initialValue, isComputed, nodePath } from '../core/operandModel.js';
import { withinBounds, variableBoundsErrors } from '../core/variableBounds.js';
export const simulationInitialValues = (draft) => Object.fromEntries(Object.entries(draft.operandNodes).filter(([, n]) => n.node_type === 'value' && !isComputed(n)).map(([id, n]) => [id, initialValue(n)]));
export function simulationValueErrors(draft, values) {
  return Object.entries(simulationInitialValues(draft)).flatMap(([id]) => {
    const value = values[id], node = draft.operandNodes[id];
    return typeof value !== node.value_type || node.value_type === 'number' && !Number.isFinite(value) ? [{ path: `/values/${id}`, key: 'simulationInvalidValue', field: nodePath(draft.operandNodes, id) }] : node.integer_only && !Number.isInteger(value) ? [{ path: `/values/${id}`, key: 'simulationIntegerValue', field: nodePath(draft.operandNodes, id) }] : node.value_type === 'number' && !withinBounds(node, value) ? [{ path: `/values/${id}`, key: 'simulationValueOutsideBounds', field: nodePath(draft.operandNodes, id) }] : variableBoundsErrors(node, `/operand_nodes/${id}`, initialValue(node));
  });
}

