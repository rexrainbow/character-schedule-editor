import { clampVariable, withinBounds, variableBoundsErrors } from './variableBounds.js';
import { initialValue, isComputed, nodePath, nodeScope, formatOperand, formatCondition, taskUseErrors, branchOrderErrors, macroEligibility, isPrioritySlot } from './operandModel.js';
import { taskMacroDefinitionErrors } from './taskMacroModel.js';
import { builtinVariableDefinition, builtinTaskDefinition, isBuiltinFlowTask, flowScope } from './builtinTasks.js';
import { translator } from './i18n.js';

export const simulationInitialValues = (draft) => Object.fromEntries(Object.entries(draft.operandNodes).filter(([, n]) => n.node_type === 'value' && !isComputed(n)).map(([id, n]) => [id, initialValue(n)]));
export function simulationValueErrors(draft, values) {
  return Object.entries(simulationInitialValues(draft)).flatMap(([id]) => {
    const value = values[id], node = draft.operandNodes[id];
    return typeof value !== node.value_type || node.value_type === 'number' && !Number.isFinite(value) ? [{ path: `/values/${id}`, key: 'simulationInvalidValue', field: nodePath(draft.operandNodes, id) }] : node.value_type === 'number' && !withinBounds(node, value) ? [{ path: `/values/${id}`, key: 'simulationValueOutsideBounds', field: nodePath(draft.operandNodes, id) }] : variableBoundsErrors(node, `/operand_nodes/${id}`, initialValue(node));
  });
}

export function createSimulationEvaluator(draft, values, baseline, t, onControl = null) {
  const nodes = draft.operandNodes, state = structuredClone(values), calls = [], trace = [], stack = new Set();
  let operations = 0, unmodeled = false;
  const fail = (key, path, field) => { const error = new Error(key); Object.assign(error, { key, path, field }); throw error; };
  const guard = (depth, path) => { if (++operations > 20000 || depth > 64) fail('simulationLimit', path); };
  const finite = (value, path) => { if (typeof value === 'number' && !Number.isFinite(value)) fail('finiteNumber', path); return value; };
  function checkOwner(owner, id, path) { if (owner && nodeScope(nodes[owner]) === 'environment' && nodes[id] && nodeScope(nodes[id]) !== 'environment') fail('environmentExpressionDependency', path); }
  function operand(op, scope, path, out, depth = 0, owner = null) {
    guard(depth, path);
    if (!op || typeof op !== 'object') fail('chooseOperand', path);
    const event = { kind: 'value', path, label: formatOperand(op, nodes, '?', scope.parameters), children: [] }; out.push(event);
    let value;
    if (op.type === 'constant') {
      if (!['number', 'string', 'boolean'].includes(typeof op.value)) fail('chooseOperand', path);
      value = finite(op.value, `${path}/value`);
    } else if (op.type === 'reference') {
      checkOwner(owner, op.reference_id, path);
      const node = nodes[op.reference_id];
      if (node?.node_type !== 'value' || isComputed(node) || !Object.hasOwn(state, op.reference_id)) fail('missingOperand', path);
      value = state[op.reference_id];
      if (typeof value !== node.value_type || node.value_type === 'number' && !Number.isFinite(value)) fail('simulationInvalidValue', `/values/${op.reference_id}`, nodePath(nodes, op.reference_id));
    } else if (op.type === 'parameter_reference') {
      if (!Object.hasOwn(scope.values, op.parameter_id)) fail('missingMacroParameter', path);
      value = scope.values[op.parameter_id];
      if (typeof value === 'object') fail('variableReferenceAsValue', path);
    } else if (op.type === 'expression_macro_reference') {
      const id = op.expression_macro_id, node = nodes[id]; checkOwner(owner, id, path);
      if (!isComputed(node)) fail('missingOperand', path);
      if (stack.has(id)) fail('computedCycle', path, node.display_name);
      stack.add(id);
      try {
        value = computedResult(node.definition, { values: {}, parameters: [] }, `/expression_macros/${id}/definition`, event.children, depth + 1, id);
        if (typeof value !== node.value_type) fail('computedResultMismatch', path);
      } finally { stack.delete(id); }
    } else if (op.type === 'expression') {
      const a = operand(op.operand_a, scope, `${path}/operand_a`, event.children, depth + 1, owner), b = operand(op.operand_b, scope, `${path}/operand_b`, event.children, depth + 1, owner);
      if (typeof a !== 'number' || typeof b !== 'number') fail('numericOperandRequired', path);
      if (!['+', '-', '*', '/'].includes(op.operator)) fail('invalidArithmeticOperator', path);
      if (op.operator === '/' && b === 0) fail('divisionByZero', `${path}/operand_b`);
      value = finite(op.operator === '+' ? a + b : op.operator === '-' ? a - b : op.operator === '*' ? a * b : a / b, path);
    } else fail('chooseOperand', path);
    event.value = value; return value;
  }
  function condition(item, scope, path, out, depth = 0, owner = null) {
    guard(depth, path);
    const event = { kind: 'condition', path, label: formatCondition(item, nodes, '?', scope.parameters), children: [] }; out.push(event);
    if (item?.kind === 'group') {
      if (!['ALL', 'ANY'].includes(item.mode) || !Array.isArray(item.items) || !item.items.length) fail('invalidCondition', path);
      let result = item.mode === 'ALL', stopped = false;
      item.items.forEach((child, index) => {
        if (stopped) { guard(depth, path); event.children.push({ kind: 'skipped', label: formatCondition(child, nodes, '?', scope.parameters), path: `${path}/items/${index}` }); return; }
        result = condition(child, scope, `${path}/items/${index}`, event.children, depth + 1, owner);
        if (item.mode === 'ALL' ? !result : result) stopped = true;
      });
      event.result = result;
    } else if (item?.kind === 'comparison') {
      const a = operand(item.operand_a, scope, `${path}/operand_a`, event.children, depth + 1, owner), b = operand(item.operand_b, scope, `${path}/operand_b`, event.children, depth + 1, owner);
      if (typeof a !== typeof b) fail('operandTypeMismatch', path);
      if (!['==', '!=', '<', '<=', '>', '>='].includes(item.comparator)) fail('invalidComparator', path);
      if (typeof a !== 'number' && !['==', '!='].includes(item.comparator)) fail('comparatorMismatch', path);
      event.result = item.comparator === '==' ? a === b : item.comparator === '!=' ? a !== b : item.comparator === '<' ? a < b : item.comparator === '<=' ? a <= b : item.comparator === '>' ? a > b : a >= b;
    } else fail('invalidCondition', path);
    return event.result;
  }
  function computedResult(definition, scope, path, out, depth, owner) {
    guard(depth, path);
    if (definition?.kind === 'number') return operand(definition.expression, scope, `${path}/expression`, out, depth + 1, owner);
    if (definition?.kind === 'boolean' && definition.condition) return condition(definition.condition, scope, `${path}/condition`, out, depth + 1, owner);
    if (definition?.kind !== 'branch' || branchOrderErrors(definition.branches, `${path}/branches`).length) fail('invalidDefinition', path);
    let selected = false, value;
    definition.branches.forEach((branch, index) => {
      guard(depth, path);
      const entry = { kind: 'branch', isElse: branch.condition === null, unconditional: definition.branches.length === 1 && branch.condition === null, label: branch.condition === null ? 'ELSE' : formatCondition(branch.condition, nodes), index: index + 1, path: `${path}/branches/${index}`, children: [] }; out.push(entry);
      if (selected) { entry.skipped = true; entry.children.push({ kind: 'skipped', label: t('computedReturn') }); return; }
      entry.result = branch.condition === null || condition(branch.condition, scope, `${entry.path}/condition`, entry.children, depth + 1, owner);
      if (entry.result) {
        selected = true;
        if (!['number', 'boolean'].includes(branch.result?.kind)) fail('invalidDefinition', `${entry.path}/result`);
        value = computedResult(branch.result, scope, `${entry.path}/result`, entry.children, depth + 1, owner);
        if (typeof value !== nodes[owner].value_type) fail('computedResultMismatch', `${entry.path}/result`);
        entry.children.push({ kind: 'return', label: t('computedReturn'), value, path: `${entry.path}/result` });
      } else entry.children.push({ kind: 'skipped', label: t('computedReturn'), path: `${entry.path}/result` });
    });
    return value;
  }
  function argument(value, parameter, scope, path, out, depth) {
    if (parameter.type !== 'variable_reference') {
      const event = { kind: 'argument', label: parameter.display_name, path, children: [] }; out.push(event);
      event.value = operand(value, scope, path, event.children, depth); return event.value;
    }
    const reference = value.type === 'parameter_reference' ? scope.values[value.parameter_id] : value;
    if (reference?.type !== 'variable_reference' || !nodes[reference.reference_id]) fail('invalidVariableReference', path);
    out.push({ kind: 'reference', label: parameter.display_name, value: nodePath(nodes, reference.reference_id), path });
    return structuredClone(reference);
  }
  function task(use, scope, path, out, modes = ['sequence', 'branch', 'priority'], depth = 0, qualified = null) {
    guard(depth, path);
    const errors = taskUseErrors(use, draft.tasks, nodes, path, scope.parameters, draft.taskMacros, modes);
    if (errors.length) { const error = errors[0]; fail(error.key, error.path, error.field); }
    if (isBuiltinFlowTask(use)) {
      const definition = builtinTaskDefinition(use.builtin, draft.builtinTasks, t), control = { builtin: use.builtin, scope: flowScope(use.builtin), label: definition.display_name, path };
      const outcome = onControl ? onControl(control) : { applied: false, reason: 'controlNoDayContext' };
      out.push({ kind: 'control', ...control, ...outcome });
      calls.push({ kind: 'control', builtin: use.builtin, display_name: definition.display_name, engine_key: definition.engine_key, scope: control.scope, path, ...outcome });
      return;
    }
    if (use.builtin) {
      const definition = builtinVariableDefinition(use.builtin, draft.builtinTasks, t), id = use.target_variable_id;
      const event = { kind: 'builtin', label: definition.display_name, path, children: [], target: nodePath(nodes, id), before: state[id] }; out.push(event);
      let value;
      if (use.builtin === 'reset_variable') value = baseline[id];
      else if (use.builtin === 'toggle_variable') value = !state[id];
      else { value = operand(use.value, scope, `${path}/value`, event.children, depth + 1); if (use.builtin === 'increment_variable') value = state[id] + value; }
      if (typeof value !== nodes[id].value_type) fail('writeTypeMismatch', path);
      event.requested = finite(value, path); state[id] = clampVariable(nodes[id], value); event.after = state[id];
      if (!Object.is(event.requested, event.after)) event.children.push({ kind: 'clamp', label: t('simulationClamped', { requested: event.requested, value: event.after }) });
      calls.push({ kind: 'builtin', display_name: definition.display_name, engine_key: definition.engine_key, target_variable_id: id, before: event.before, after: event.after, path });
      return;
    }
    const macro = use.task_macro_id ? draft.taskMacros.find((m) => m.id === use.task_macro_id) : null;
    const definition = macro ?? draft.tasks.find((item) => item.id === use.task_id);
    const event = { kind: macro ? 'macro' : 'task', label: definition.display_name, path, children: [] }; out.push(event);
    const args = qualified?.args ?? Object.fromEntries(definition.parameters.map((p) => [p.id, argument(use.arguments[p.id], p, scope, `${path}/arguments/${p.id}`, event.children, depth + 1)]));
    if (!macro) {
      event.unmodeled = true; unmodeled = true;
      calls.push({ kind: 'task', display_name: definition.display_name, engine_key: definition.engine_key, arguments: definition.parameters.map((p) => ({ id: p.id, display_name: p.display_name, type: p.type, value: args[p.id] })), path, effectsModeled: false });
      return;
    }
    const definitionErrors = taskMacroDefinitionErrors([macro]);
    if (definitionErrors.length) { const error = definitionErrors[0]; fail(error.key, error.path, error.field); }
    if (stack.has(macro.id)) fail('simulationLimit', path);
    stack.add(macro.id);
    try {
      const local = { parameters: macro.parameters, values: args };
      if (!qualified && macroEligibility(macro) != null) {
        const guardEvent = { kind: 'guard', label: t('candidateCondition'), children: [], path: `/task_macros/${macro.id}/${macro.mode === 'conditional' ? 'condition' : 'eligibility'}` };
        event.children.push(guardEvent);
        guardEvent.result = condition(macroEligibility(macro), local, guardEvent.path, guardEvent.children, depth + 1);
        if (!guardEvent.result) { event.children.push({ kind: 'skipped', label: t('conditionalSkipped') }); return; }
      }
      if (macro.mode === 'sequence') {
        event.empty = !macro.steps.length;
        macro.steps.forEach((step, index) => { const entry = { kind: 'step', index: index + 1, path: `/task_macros/${macro.id}/steps/${index}`, children: [] }; event.children.push(entry); task(step.task, local, `${entry.path}/task`, entry.children, ['sequence', 'branch', 'priority'], depth + 1); });
      } else if (macro.mode === 'branch') {
        event.empty = !macro.branches.length; if (!event.empty) branches(macro.branches, local, `/task_macros/${macro.id}/branches`, event.children, ['sequence', 'branch', 'priority'], depth + 1);
      } else if (macro.mode === 'conditional') {
        task(macro.task, local, `/task_macros/${macro.id}/task`, event.children, ['sequence', 'branch', 'priority'], depth + 1);
      } else if (macro.mode === 'priority') {
        event.empty = !macro.candidates.length;
        priorityCandidates(macro.candidates, local, `/task_macros/${macro.id}/candidates`, event.children, depth + 1);
      }
    } finally { stack.delete(macro.id); }
  }
  function priorityCandidates(items, scope, path, out, depth = 0) {
    let selected = false;
    items.forEach((candidate, index) => {
      const candidatePath = `${path}/${index}/task`;
      guard(depth, candidatePath);
      const definition = draft.taskMacros.find((item) => item.id === candidate.task?.task_macro_id);
      const entry = { kind: 'candidate', label: `${t('candidateNumber', { count: index + 1 })}: ${definition?.display_name ?? '?'}`, path: candidatePath, children: [] }; out.push(entry);
      if (selected) { entry.skipped = true; return; }
      const errors = taskUseErrors(candidate.task, draft.tasks, nodes, candidatePath, scope.parameters, draft.taskMacros, ['sequence', 'branch', 'priority']);
      if (errors.length) { const error = errors[0]; fail(error.key, error.path, error.field); }
      if (!definition) fail('conditionalCandidateRequired', candidatePath);
      const args = Object.fromEntries(definition.parameters.map((p) => [p.id, argument(candidate.task.arguments[p.id], p, scope, `${candidatePath}/arguments/${p.id}`, entry.children, depth + 1)]));
      entry.result = macroEligibility(definition) == null || condition(macroEligibility(definition), { parameters: definition.parameters, values: args }, `/task_macros/${definition.id}/${definition.mode === 'conditional' ? 'condition' : 'eligibility'}`, entry.children, depth + 1);
      if (entry.result) { selected = true; task(candidate.task, scope, candidatePath, entry.children, ['sequence', 'branch', 'priority'], depth + 1, { args }); }
    });
    if (!selected && items.length > 0) out.push({ kind: 'message', label: t('noCandidateMatched') });
  }
  function runSlot(slot, out = trace) {
    const items = isPrioritySlot(slot) ? slot.candidates : slot.branches;
    if (!items.length) out.push({ kind: 'slot', label: slot.name, empty: true, path: `/slots/${slot.id}`, children: [] });
    else if (isPrioritySlot(slot)) priorityCandidates(items, { values: {}, parameters: [] }, `/slots/${slot.id}/candidates`, out);
    else branches(items, { values: {}, parameters: [] }, `/slots/${slot.id}/branches`, out, ['sequence', 'branch', 'priority']);
  }
  function branches(items, scope, path, out, modes, depth = 0) {
    if (branchOrderErrors(items, path).length) fail('elseLast', path);
    let selected = false;
    items.forEach((branch, index) => {
      guard(depth, path);
      const event = { kind: 'branch', isElse: branch.condition === null, unconditional: items.length === 1 && branch.condition === null, index: index + 1, path: `${path}/${index}`, label: branch.condition === null ? 'ELSE' : formatCondition(branch.condition, nodes, '?', scope.parameters), children: [] }; out.push(event);
      if (selected) { event.skipped = true; return; }
      event.result = branch.condition === null || condition(branch.condition, scope, `${event.path}/condition`, event.children, depth + 1);
      if (event.result) { selected = true; task(branch.task, scope, `${event.path}/task`, event.children, modes, depth + 1); }
    });
  }
  return { state, calls, trace, operand, branches, runSlot, guard, get unmodeled() { return unmodeled; } };
}

export function evaluateSimulationExpressions(draft, values) {
  return Object.fromEntries(Object.entries(draft.operandNodes).filter(([, n]) => isComputed(n)).map(([id]) => {
    try { const engine = createSimulationEvaluator(draft, values, simulationInitialValues(draft), translator('en')); return [id, { value: engine.operand({ type: 'expression_macro_reference', expression_macro_id: id }, { values: {}, parameters: [] }, `/expression_macros/${id}`, []) }]; }
    catch (error) { return [id, { error: { key: error.key ?? 'simulationError', path: error.path ?? '/', field: error.field } }]; }
  }));
}

export function simulateSlot(draft, slotId, values = simulationInitialValues(draft), baseline = simulationInitialValues(draft), t = translator('en')) {
  const input = structuredClone(values), errors = [...simulationValueErrors(draft, input), ...simulationValueErrors(draft, baseline).map((error) => ({ ...error, path: error.path.replace('/values/', '/initial_values/') }))];
  const engine = createSimulationEvaluator(draft, input, baseline, t), slot = draft.slots.find((item) => item.id === slotId);
  if (!slot) errors.push({ path: '/slot_id', key: 'simulationChooseSlot' });
  if (!errors.length) try {
    engine.runSlot(slot);
  }
  catch (error) { errors.push({ path: error.path ?? '/', key: error.key ?? 'simulationError', field: error.field }); }
  return { slotId, trace: engine.trace, calls: engine.calls, state: engine.state, errors, unmodeled: engine.unmodeled, changes: Object.keys(input).filter((id) => !Object.is(input[id], engine.state[id])).map((id) => ({ id, name: nodePath(draft.operandNodes, id), before: input[id], after: engine.state[id] })) };
}
