import { descriptionComments } from './descriptions.js';
import { isComputed, macroEligibility, nodePath } from './operandModel.js';
import { builtinTaskDefinition, isBuiltinFlowTask } from './builtinTaskModel.js';

// Static explanation only: never evaluates conditions or changes project data.
export function slotLogicText(slot, { nodes = {}, tasks = [], macros = [], builtinTasks, events = [], days = [], depth = 'summary', showDescriptions = true, t }) {
  return logicText(slot, { nodes, tasks, macros, builtinTasks, events, days, depth, showDescriptions, t });
}

export function taskMacroLogicText(macro, options) {
  return logicText(null, options, macro);
}

function logicText(slot, { nodes = {}, tasks = [], macros = [], builtinTasks, events = [], days = [], depth = 'summary', showDescriptions = true, t }, rootMacro) {
  const limit = depth === 'all' ? 64 : depth === 'one' ? 1 : 0;
  const lines = [], taskStack = new Set(), expressionStack = new Set();
  let operations = 0, truncated = false;
  const missing = () => t('logicMissingValue');
  function guard(level = 0) { if (++operations > 5000 || level > 64) { truncated = true; return false; } return true; }
  function line(indent, text) { if (lines.length >= 1000) { truncated = true; return; } lines.push(`${'  '.repeat(indent)}${text}`); }
  function comments(value, indent = 0) { if (showDescriptions) descriptionComments(value?.description).forEach((text) => line(indent, text)); }
  function operand(value, scope, remaining, level = 0) {
    if (!guard(level)) return t('logicExpansionLimit');
    if (value?.type === 'constant') return typeof value.value === 'string' ? JSON.stringify(value.value) : ['number', 'boolean'].includes(typeof value.value) && (typeof value.value !== 'number' || Number.isFinite(value.value)) ? String(value.value) : missing();
    if (value?.type === 'parameter_reference') return scope[value.parameter_id] ?? missing();
    if (value?.type === 'current_event_reference') return t('currentEvent');
    if (value?.type === 'event_reference') return events.find((event) => event.id === value.event_group_id)?.name ?? `${t('eventReferences')} [${value.event_group_id}]`;
    if (value?.type === 'event_property') return `${operand(value.event, scope, remaining, level + 1)}.${t(`eventProperty_${value.property}`)}`;
    if (value?.type === 'reference' || value?.type === 'variable_reference') return nodePath(nodes, value.reference_id) || missing();
    if (value?.type === 'expression') return `(${operand(value.operand_a, scope, remaining, level + 1)} ${value.operator || '?'} ${operand(value.operand_b, scope, remaining, level + 1)})`;
    if (value?.type === 'expression_macro_reference') {
      const id = value.expression_macro_id, node = nodes[id];
      if (!node || !isComputed(node)) return missing();
      const name = node.display_name || missing();
      if (!remaining) return name;
      if (expressionStack.has(id)) return `${name} [${t('logicCycle')}]`;
      expressionStack.add(id);
      const text = definition(node.definition, scope, remaining - 1, level + 1);
      expressionStack.delete(id);
      const notes = showDescriptions ? descriptionComments(node.description) : [];
      const content = [...notes, text].join('\n');
      return notes.length || content.includes('\n') ? `${name} {\n${content.split('\n').map((line) => `  ${line}`).join('\n')}\n}` : `${name} { ${text} }`;
    }
    return missing();
  }
  function condition(value, scope, remaining, level = 0) {
    if (!guard(level)) return t('logicExpansionLimit');
    if (!value) return missing();
    if (value.kind === 'group') return `${value.mode || '?'}(${(value.items ?? []).map((item) => condition(item, scope, remaining, level + 1)).join(', ')})`;
    return `${operand(value.operand_a, scope, remaining, level + 1)} ${value.comparator || '?'} ${operand(value.operand_b, scope, remaining, level + 1)}`;
  }
  function definition(value, scope, remaining, level) {
    if (!guard(level)) return t('logicExpansionLimit');
    if (value?.kind === 'branch' && value.branches?.length === 1 && value.branches[0].condition === null) return `${showDescriptions ? descriptionComments(value.branches[0].description).map((line) => line + '\n').join('') : ''}${definition(value.branches[0].result, scope, remaining, level + 1)}`;
    if (value?.kind === 'branch') {
      const branches = (value.branches ?? []).map((item, index) => `${showDescriptions && item.description?.trim() ? descriptionComments(item.description).join('\n') + '\n' : ''}${item.condition === null ? 'ELSE' : `${index ? 'ELSE IF' : 'IF'} (${condition(item.condition, scope, remaining, level + 1)})`} → ${definition(item.result, scope, remaining, level + 1)}`);
      return branches.join(branches.some((text) => text.includes('\n')) ? '\n' : '; ') || t('logicNoActions');
    }
    return value?.kind === 'number' ? operand(value.expression, scope, remaining, level + 1) : condition(value?.condition, scope, remaining, level + 1);
  }
  function invocation(use, scope, remaining) {
    const macro = macros.find((item) => item.id === use?.task_macro_id && item.id), task = tasks.find((item) => item.id === use?.task_id && item.id);
    const target = macro ?? task;
    if (!target) return { label: t('logicMissingTask'), scope: {}, macro: null };
    const args = Object.fromEntries((target.parameters ?? []).map((p) => [p.id, Object.hasOwn(use.arguments ?? {}, p.id) ? operand(use.arguments[p.id], scope, remaining) : t('logicMissingArgument')]));
    const suffix = (target.parameters ?? []).map((p) => `${p.display_name}: ${args[p.id]}`).join(', ');
    return { macro, target, scope: args, label: `${target.display_name || t('unnamedTask')}${suffix ? ` (${suffix})` : ''}` };
  }
  function task(use, indent, remaining, scope = {}, prefix = '', skipEligibility = false) {
    if (!guard()) return;
    if (use?.builtin) {
      const known = ['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable', 'adjust_probability_event', 'schedule_event'].includes(use.builtin) || isBuiltinFlowTask(use);
      if (!known) { line(indent, `${prefix}${t('logicMissingTask')}`); return; }
      const built = builtinTaskDefinition(use.builtin, builtinTasks, t); comments(built, indent);
      if (use.builtin === 'schedule_event') {
        const source = use.day_source?.candidates ?? [{ day_schedule_id: use.day_schedule_id }];
        const labels = source.map((item) => `${days.find((day) => day.id === item.day_schedule_id)?.name || item.day_schedule_id || missing()}${item.weight === undefined ? '' : ` (${t('eventWeight')}: ${item.weight})`}`).join(', ');
        line(indent, `${prefix}${built.display_name}: ${use.display_name || labels}`);
        line(indent + 1, `${t(`scheduleDate_${use.date?.mode}`)}: ${operand(use.date?.offset, scope, remaining)}${use.date?.weekday ? ` / ${t(use.date.weekday)}` : ''}`);
        line(indent + 1, labels); line(indent + 1, `${t(`executionMode_${use.execution_mode}`)}; ${t('eventPriority')}: ${use.priority}`); return;
      }
      if (use.builtin === 'adjust_probability_event') { line(indent, `${prefix}${built.display_name} (${operand(use.event, scope, remaining)}, ${typeof use.property === 'string' ? t(`eventProperty_${use.property}`) : operand(use.property, scope, remaining)}, ${typeof use.operation === 'string' ? t(`eventOperation_${use.operation}`) : operand(use.operation, scope, remaining)} ${operand(use.value, scope, remaining)})`); return; }
      if (isBuiltinFlowTask(use)) {
        line(indent, `${prefix}${built.display_name}`);
        line(indent + 1, use.condition == null ? t('releaseUnconditional') : `IF (${condition(use.condition, scope, remaining)})`);
        return;
      }
      const args = isBuiltinFlowTask(use) ? [] : [nodePath(nodes, use.target_variable_id) || missing(), ...(['set_variable', 'increment_variable'].includes(use.builtin) ? [operand(use.value, scope, remaining), ...(use.builtin === 'increment_variable' && use.random_amplitude !== undefined ? [`${t('randomAmplitude')}: ${operand(use.random_amplitude, scope, remaining)}`] : [])] : [])];
      line(indent, `${prefix}${built.display_name}${args.length ? ` (${args.join(', ')})` : ''}`); return;
    }
    const call = invocation(use, scope, remaining), eligibility = call.macro && macroEligibility(call.macro);
    comments(call.target, indent);
    const qualifier = !skipEligibility && eligibility != null ? `IF (${condition(eligibility, call.scope, remaining)}) → ` : '';
    line(indent, `${prefix}${qualifier}${call.label}`);
    if (!call.macro || !remaining) return;
    if (taskStack.has(call.macro.id)) { line(indent + 1, t('logicCycle')); return; }
    taskStack.add(call.macro.id);
    const macro = call.macro;
    if (macro.mode === 'priority') priority(macro.candidates ?? [], indent + 1, remaining - 1, call.scope);
    else if (macro.mode === 'branch') branches(macro.branches ?? [], indent + 1, remaining - 1, call.scope);
    else {
      const steps = macro.mode === 'conditional' ? [{ task: macro.task }] : macro.steps ?? [];
      if (!steps.length) line(indent + 1, t('logicNoActions'));
      steps.forEach((step, index) => { comments(step, indent + 1); task(step.task, indent + 1, remaining - 1, call.scope, `${index + 1}. `); });
    }
    taskStack.delete(macro.id);
  }
  function branches(items, indent, remaining, scope) {
    if (!items.length) line(indent, t('logicNoActions'));
    if (items.length === 1 && items[0].condition === null) { comments(items[0], indent); task(items[0].task, indent, remaining, scope); return; }
    items.forEach((item, index) => { comments(item, indent); task(item.task, indent, remaining, scope, `${item.condition === null ? 'ELSE' : `${index ? 'ELSE IF' : 'IF'} (${condition(item.condition, scope, remaining)})`} → `); });
  }
  function priority(items, indent, remaining, scope) {
    line(indent, t('logicPriorityHint'));
    if (!items.length) line(indent + 1, t('logicNoActions'));
    let fallback = false;
    items.forEach((item, index) => {
      comments(item, indent + 1);
      const call = invocation(item.task, scope, remaining), eligibility = call.macro ? macroEligibility(call.macro) : undefined;
      if (fallback) line(indent + 1, `# ${t('logicAfterFallback')}`);
      const unrestricted = !!call.macro && eligibility == null;
      const prefix = unrestricted ? 'ELSE' : `${index ? 'ELSE IF' : 'IF'} (${call.macro ? condition(eligibility, call.scope, remaining) : missing()})`;
      task(item.task, indent + 1, remaining, scope, `${prefix} → `, true);
      fallback ||= unrestricted;
    });
  }
  comments(rootMacro ?? slot);
  if (rootMacro) {
    const scope = Object.fromEntries((rootMacro.parameters ?? []).map((p) => [p.id, p.display_name || missing()]));
    const eligibility = macroEligibility(rootMacro), indent = eligibility == null ? 0 : 1;
    if (eligibility != null) line(0, `IF (${condition(eligibility, scope, limit)})`);
    taskStack.add(rootMacro.id);
    if (rootMacro.mode === 'priority') priority(rootMacro.candidates ?? [], indent, limit, scope);
    else if (rootMacro.mode === 'branch') branches(rootMacro.branches ?? [], indent, limit, scope);
    else {
      const steps = rootMacro.mode === 'conditional' ? [{ task: rootMacro.task }] : rootMacro.steps ?? [];
      if (!steps.length) line(indent, t('logicNoActions'));
      steps.forEach((step, index) => { comments(step, indent); task(step.task, indent, limit, scope, `${index + 1}. `); });
    }
  }
  else if (slot.mode === 'priority') priority(slot.candidates ?? [], 0, limit, {});
  else branches(slot.branches ?? [], 0, limit, {});
  if (truncated) lines.push(t('logicExpansionLimit'));
  return lines.join('\n');
}
