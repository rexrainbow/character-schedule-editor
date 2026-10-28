// Test-only baseline captured before the runtime migration. Never import from product code.
import { scheduledPosition, scheduledEventErrors, reservationSourceText } from '../../src/core/scheduledEvents.js';
import { sequenceRange } from '../../src/core/sequenceRange.js';
import { eventDateLabel, positionDate } from '../../src/core/sequenceEvents.js';
import { eventDaySourceFromData, eventFirstDayId } from '../../src/core/eventDaySource.js';
import { clampVariable, withinBounds, variableBoundsErrors } from '../../src/core/variableBounds.js';
import { initialValue, isComputed, nodePath, nodeScope, formatOperand, formatCondition, taskUseErrors, branchOrderErrors, macroEligibility, isPrioritySlot } from '../../src/core/operandModel.js';
import { taskMacroDefinitionErrors } from '../../src/core/taskMacroModel.js';
import { builtinVariableDefinition, builtinTaskDefinition, isBuiltinFlowTask } from '../../src/core/builtinTaskModel.js';
import { translator } from '../../src/i18n/index.js';
import { eventCatalog } from '../../src/core/eventReferences.js';
import { probabilityEnumContract, resolveDraftEnums } from '../../src/core/enumParameters.js';
import { randomOffset, seededRandom } from '../../src/core/randomValues.js';

export const simulationInitialValues = (draft) => Object.fromEntries(Object.entries(draft.operandNodes).filter(([, n]) => n.node_type === 'value' && !isComputed(n)).map(([id, n]) => [id, initialValue(n)]));
export function simulationValueErrors(draft, values) {
  return Object.entries(simulationInitialValues(draft)).flatMap(([id]) => {
    const value = values[id], node = draft.operandNodes[id];
    return typeof value !== node.value_type || node.value_type === 'number' && !Number.isFinite(value) ? [{ path: `/values/${id}`, key: 'simulationInvalidValue', field: nodePath(draft.operandNodes, id) }] : node.integer_only && !Number.isInteger(value) ? [{ path: `/values/${id}`, key: 'simulationIntegerValue', field: nodePath(draft.operandNodes, id) }] : node.value_type === 'number' && !withinBounds(node, value) ? [{ path: `/values/${id}`, key: 'simulationValueOutsideBounds', field: nodePath(draft.operandNodes, id) }] : variableBoundsErrors(node, `/operand_nodes/${id}`, initialValue(node));
  });
}

export function createSimulationEvaluator(draft, values, baseline, t, onControl = null, eventContext = {}, randomOptions = {}) {
  draft = resolveDraftEnums(draft);
  const nodes = draft.operandNodes, state = structuredClone(values), calls = [], reservations = [], trace = [], stack = new Set();
  const random = seededRandom(randomOptions.seed ?? '1');
  const catalog = new Map(eventCatalog(draft).map((event) => [event.id, event]));
  const eventValues = Object.fromEntries([...catalog.values()].filter((event) => event.sequenceId === eventContext.sequenceId && event.kind === 'probability').map((event) => [event.id, { probability_percent: event.probability_percent, cooldown_days: event.cooldown_days, cooldown_remaining: eventContext.choices?.[event.id] === true ? event.cooldown_days : 0 }]));
  let operations = 0, unmodeled = false;
  const fail = (key, path, field) => { const error = new Error(key); Object.assign(error, { key, path, field }); throw error; };
  const guard = (depth, path) => { if (++operations > 20000 || depth > 64) fail('simulationLimit', path); };
  const finite = (value, path) => { if (typeof value === 'number' && !Number.isFinite(value)) fail('finiteNumber', path); return value; };
  function enumValue(value, parameter, scope, path) {
    const result = value?.type === 'parameter_reference' ? scope.values[value.parameter_id] : value?.type === 'constant' ? value.value : value;
    if (typeof result !== 'string' || !parameter.options.some((option) => option.value === result)) fail('chooseEnumOption', path);
    return result;
  }
  function resolveEvent(value, scope, path, kind = 'any') {
    if (!eventContext.sequenceId) fail('eventDayContextRequired', path);
    const reference = value?.type === 'parameter_reference' ? scope.values[value.parameter_id] : value;
    const id = reference?.type === 'current_event_reference' ? eventContext.current?.()?.groupId : reference?.event_group_id;
    if (!id) fail('currentEventMissing', path);
    const event = catalog.get(id);
    if (!event) fail('missingEventReference', path);
    if (event.sequenceId !== eventContext.sequenceId) fail('crossSequenceEvent', path);
    if (kind === 'probability' && event.kind !== 'probability') fail('probabilityEventRequired', path);
    return { type: 'event_reference', event_group_id: id };
  }
  function checkOwner(owner, id, path) { if (owner && nodeScope(nodes[owner]) === 'environment' && nodes[id] && nodeScope(nodes[id]) !== 'environment') fail('environmentExpressionDependency', path); }
  function operand(op, scope, path, out, depth = 0, owner = null) {
    guard(depth, path);
    if (!op || typeof op !== 'object') fail('chooseOperand', path);
    const event = { kind: 'value', path, label: formatOperand(op, nodes, '?', scope.parameters), children: [] }; out.push(event);
    let value;
    if (op.type === 'constant') {
      if (!['number', 'string', 'boolean'].includes(typeof op.value)) fail('chooseOperand', path);
      value = finite(op.value, `${path}/value`);
    } else if (op.type === 'event_property') {
      const reference = resolveEvent(op.event, scope, path, 'probability');
      value = eventValues[reference.event_group_id][op.property];
      if (typeof value !== 'number') fail('invalidEventProperty', path);
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
    if (parameter.type === 'enum') {
      const result = enumValue(value, parameter, scope, path);
      out.push({ kind: 'argument', label: parameter.display_name, value: result, path }); return result;
    }
    if (parameter.type === 'event_reference') {
      const reference = resolveEvent(value, scope, path, parameter.event_kind);
      out.push({ kind: 'reference', label: parameter.display_name, value: catalog.get(reference.event_group_id).name, path });
      return reference;
    }
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
    if (use.builtin === 'schedule_event') {
      const sequence = draft.sequences.find((item) => item.id === eventContext.sequenceId);
      if (!sequence || !Number.isSafeInteger(eventContext.position)) fail('scheduleContextRequired', path);
      const invalid = scheduledEventErrors({ ...draft, slots: [{ id: 'simulation', task: use }], taskMacros: [] });
      if (invalid.length) fail(invalid[0].key, path);
      const definition = builtinTaskDefinition(use.builtin, draft.builtinTasks, t), children = [];
      const offset = operand(use.date.offset, scope, `${path}/date/offset`, children, depth + 1);
      const target = scheduledPosition(use.date, offset, eventContext.position), range = sequenceRange(sequence);
      const reason = target.error ?? (target.position > range.end || target.position < range.start ? 'scheduleOutsideSequence' : null);
      const event = { kind: 'reservation', label: definition.display_name, path, children, accepted: !reason }; out.push(event);
      if (reason) {
        children.push({ kind: 'message', label: `${t('scheduleRejected')}: ${t(reason)}` });
        calls.push({ kind: 'control', builtin: use.builtin, display_name: definition.display_name, symbol: definition.symbol, accepted: false, reason, path }); return;
      }
      const date = positionDate(target.position), name = use.display_name.trim() || draft.days.find((day) => day.id === eventFirstDayId(eventDaySourceFromData(use)))?.name || '';
      const reservation = { id: crypto.randomUUID(), kind: 'once', sequence_id: sequence.id, display_name: name, icon: use.icon || 'tabler:calendar-event', start: { week_number: date.week, weekday: date.weekday }, target_position: target.position, execution_mode: use.execution_mode, priority: use.priority, ...(use.day_source ? { day_source: structuredClone(use.day_source) } : { day_schedule_id: use.day_schedule_id }), created_at: { position: eventContext.position, ...(eventContext.current?.() ?? {}) }, source_path: path };
      reservations.push(reservation);
      event.reservation_id = reservation.id;
      children.push({ kind: 'message', label: `${t('scheduleAccepted')}: ${name}` }, { kind: 'message', label: eventDateLabel(date, t) }, { kind: 'message', label: reservationSourceText(use, draft.days, t) }, { kind: 'message', label: `${t(`executionMode_${use.execution_mode}`)}; ${t('eventPriority')}: ${use.priority}` });
      calls.push({ kind: 'control', builtin: use.builtin, display_name: definition.display_name, symbol: definition.symbol, accepted: true, reservation_id: reservation.id, path }); return;
    }
    if (use.builtin === 'adjust_probability_event') {
      const reference = resolveEvent(use.event, scope, `${path}/event`, 'probability'), settings = eventValues[reference.event_group_id];
      const property = enumValue(use.property, probabilityEnumContract('property'), scope, `${path}/property`), operation = enumValue(use.operation, probabilityEnumContract('operation'), scope, `${path}/operation`);
      const definition = builtinTaskDefinition(use.builtin, draft.builtinTasks, t);
      const event = { kind: 'builtin', label: definition.display_name, target: `${catalog.get(reference.event_group_id).name}.${property}`, path, before: settings[property], children: [] }; out.push(event);
      const input = operand(use.value, scope, `${path}/value`, event.children, depth + 1);
      const requested = finite(operation === 'increase' ? event.before + input : input, path);
      if (property === 'cooldown_days' && !Number.isSafeInteger(requested)) fail('invalidEventCooldown', path);
      settings[property] = Math.max(0, property === 'probability_percent' ? Math.min(100, requested) : requested);
      event.after = settings[property];
      event.children.push({ kind: 'message', label: t('eventAdjustmentNextDay') });
      calls.push({ kind: 'builtin', builtin: use.builtin, display_name: definition.display_name, symbol: definition.symbol, event_group_id: reference.event_group_id, property, operation, before: event.before, after: event.after, path });
      return;
    }
    if (isBuiltinFlowTask(use)) {
      const definition = builtinTaskDefinition(use.builtin, draft.builtinTasks, t), children = [];
      const result = use.condition == null || condition(use.condition, scope, `${path}/condition`, children, depth + 1);
      const control = { builtin: use.builtin, result, label: definition.display_name, path };
      const outcome = onControl ? onControl(control) : { applied: false, reason: 'controlNoDayContext' };
      out.push({ kind: 'control', ...control, ...outcome, children });
      calls.push({ kind: 'control', builtin: use.builtin, display_name: definition.display_name, symbol: definition.symbol, result, path, ...outcome });
      return;
    }
    if (use.builtin) {
      const definition = builtinVariableDefinition(use.builtin, draft.builtinTasks, t), id = use.target_variable_id;
      const event = { kind: 'builtin', label: definition.display_name, path, children: [], target: nodePath(nodes, id), before: state[id] }; out.push(event);
      let value, increment, amplitude = 0, offset = 0;
      if (use.builtin === 'reset_variable') value = baseline[id];
      else if (use.builtin === 'toggle_variable') value = !state[id];
      else {
        value = operand(use.value, scope, `${path}/value`, event.children, depth + 1);
        if (use.builtin === 'increment_variable') {
          increment = value;
          if (use.random_amplitude !== undefined) amplitude = operand(use.random_amplitude, scope, `${path}/random_amplitude`, event.children, depth + 1);
          try { offset = randomOffset(amplitude, !!nodes[id].integer_only, random); }
          catch (error) { fail(error.message, `${path}/random_amplitude`); }
          value = state[id] + increment + offset;
          if (amplitude > 0) event.children.push({ kind: 'random', label: t('simulationRandomOffset', { amount: increment, amplitude, offset }), value: offset });
        }
      }
      if (typeof value !== nodes[id].value_type) fail('writeTypeMismatch', path);
      event.requested = finite(value, path);
      const truncated = nodes[id].integer_only ? Math.trunc(event.requested) : event.requested;
      if (!Object.is(truncated, event.requested)) event.children.push({ kind: 'truncate', label: t('simulationTruncated', { requested: event.requested, value: Object.is(truncated, -0) ? 0 : truncated }) });
      state[id] = clampVariable(nodes[id], value); event.after = state[id];
      if (!Object.is(truncated, event.after) && !(truncated === 0 && event.after === 0)) event.children.push({ kind: 'clamp', label: t('simulationClamped', { requested: truncated, value: event.after }) });
      calls.push({ kind: 'builtin', display_name: definition.display_name, symbol: definition.symbol, target_variable_id: id, before: event.before, after: event.after, path, ...(amplitude > 0 ? { increment, random_amplitude: amplitude, random_offset: offset } : {}) });
      return;
    }
    const macro = use.task_macro_id ? draft.taskMacros.find((m) => m.id === use.task_macro_id) : null;
    const definition = macro ?? draft.tasks.find((item) => item.id === use.task_id);
    const event = { kind: macro ? 'macro' : 'task', label: definition.display_name, path, children: [] }; out.push(event);
    const args = qualified?.args ?? Object.fromEntries(definition.parameters.map((p) => [p.id, argument(use.arguments[p.id], p, scope, `${path}/arguments/${p.id}`, event.children, depth + 1)]));
    if (!macro) {
      event.unmodeled = true; unmodeled = true;
      calls.push({ kind: 'task', display_name: definition.display_name, symbol: definition.symbol, arguments: definition.parameters.map((p) => ({ id: p.id, display_name: p.display_name, type: p.type, value: args[p.id] })), path, effectsModeled: false });
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
  return { state, eventValues, reservations, calls, trace, operand, branches, runSlot, runControl: (use, path, out) => task(use, { values: {}, parameters: [] }, path, out), guard, get unmodeled() { return unmodeled; } };
}

export function evaluateSimulationExpressions(draft, values) {
  return Object.fromEntries(Object.entries(draft.operandNodes).filter(([, n]) => isComputed(n)).map(([id]) => {
    try { const engine = createSimulationEvaluator(draft, values, simulationInitialValues(draft), translator('en')); return [id, { value: engine.operand({ type: 'expression_macro_reference', expression_macro_id: id }, { values: {}, parameters: [] }, `/expression_macros/${id}`, []) }]; }
    catch (error) { return [id, { error: { key: error.key ?? 'simulationError', path: error.path ?? '/', field: error.field } }]; }
  }));
}

export function simulateSlot(draft, slotId, values = simulationInitialValues(draft), baseline = simulationInitialValues(draft), t = translator('en'), seed = '1') {
  const input = structuredClone(values), errors = [...simulationValueErrors(draft, input), ...simulationValueErrors(draft, baseline).map((error) => ({ ...error, path: error.path.replace('/values/', '/initial_values/') }))];
  const engine = createSimulationEvaluator(draft, input, baseline, t, null, {}, { seed }), slot = draft.slots.find((item) => item.id === slotId);
  if (!slot) errors.push({ path: '/slot_id', key: 'simulationChooseSlot' });
  if (!errors.length) try {
    engine.runSlot(slot);
  }
  catch (error) { errors.push({ path: error.path ?? '/', key: error.key ?? 'simulationError', field: error.field }); }
  return { slotId, seed, reservations: engine.reservations, trace: engine.trace, calls: engine.calls, state: engine.state, errors, unmodeled: engine.unmodeled, changes: Object.keys(input).filter((id) => !Object.is(input[id], engine.state[id])).map((id) => ({ id, name: nodePath(draft.operandNodes, id), before: input[id], after: engine.state[id] })) };
}
