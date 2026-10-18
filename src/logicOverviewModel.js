import { isComputed, macroEligibility, nodePath } from './operandModel.js';
import { builtinTaskDefinition, isBuiltinFlowTask } from './builtinTasks.js';

// Static explanation only: never evaluates conditions or changes project data.
export function slotLogicText(slot, { nodes = {}, tasks = [], macros = [], builtinTasks, depth = 'summary', t }) {
  const limit = depth === 'all' ? 64 : depth === 'one' ? 1 : 0;
  const lines = [], taskStack = new Set(), expressionStack = new Set();
  let operations = 0, truncated = false;
  const missing = () => t('logicMissingValue');
  function guard(level = 0) { if (++operations > 5000 || level > 64) { truncated = true; return false; } return true; }
  function line(indent, text) { if (lines.length >= 1000) { truncated = true; return; } lines.push(`${'  '.repeat(indent)}${text}`); }
  function operand(value, scope, remaining, level = 0) {
    if (!guard(level)) return t('logicExpansionLimit');
    if (value?.type === 'constant') return typeof value.value === 'string' ? JSON.stringify(value.value) : ['number', 'boolean'].includes(typeof value.value) && (typeof value.value !== 'number' || Number.isFinite(value.value)) ? String(value.value) : missing();
    if (value?.type === 'parameter_reference') return scope[value.parameter_id] ?? missing();
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
      expressionStack.delete(id); return `${name} { ${text} }`;
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
    if (value?.kind === 'branch' && value.branches?.length === 1 && value.branches[0].condition === null) return definition(value.branches[0].result, scope, remaining, level + 1);
    if (value?.kind === 'branch') return (value.branches ?? []).map((item, index) => `${item.condition === null ? 'ELSE' : `${index ? 'ELSE IF' : 'IF'} (${condition(item.condition, scope, remaining, level + 1)})`} → ${definition(item.result, scope, remaining, level + 1)}`).join('; ') || t('logicNoActions');
    return value?.kind === 'number' ? operand(value.expression, scope, remaining, level + 1) : condition(value?.condition, scope, remaining, level + 1);
  }
  function invocation(use, scope, remaining) {
    const macro = macros.find((item) => item.id === use?.task_macro_id && item.id), task = tasks.find((item) => item.id === use?.task_id && item.id);
    const target = macro ?? task;
    if (!target) return { label: t('logicMissingTask'), scope: {}, macro: null };
    const args = Object.fromEntries((target.parameters ?? []).map((p) => [p.id, Object.hasOwn(use.arguments ?? {}, p.id) ? operand(use.arguments[p.id], scope, remaining) : t('logicMissingArgument')]));
    const suffix = (target.parameters ?? []).map((p) => `${p.display_name}: ${args[p.id]}`).join(', ');
    return { macro, scope: args, label: `${target.display_name || t('unnamedTask')}${suffix ? ` (${suffix})` : ''}` };
  }
  function task(use, indent, remaining, scope = {}, prefix = '', skipEligibility = false) {
    if (!guard()) return;
    if (use?.builtin) {
      const known = ['set_variable', 'increment_variable', 'toggle_variable', 'reset_variable'].includes(use.builtin) || isBuiltinFlowTask(use);
      if (!known) { line(indent, `${prefix}${t('logicMissingTask')}`); return; }
      const built = builtinTaskDefinition(use.builtin, builtinTasks, t);
      if (isBuiltinFlowTask(use)) {
        line(indent, `${prefix}${built.display_name}`);
        line(indent + 1, `IF (${condition(use.condition, scope, remaining)})`);
        line(indent + 2, `${t('logicTakeover')}: ${t(`takeover_${use.scope}`)} / ${t(`takeover_${use.target}`)}`);
        line(indent + 1, 'ELSE');
        line(indent + 2, `${t('logicWithdraw')}: ${t(`takeover_${use.scope}`)} / ${t('takeoverSelf')}`);
        return;
      }
      const args = isBuiltinFlowTask(use) ? [] : [nodePath(nodes, use.target_variable_id) || missing(), ...(['set_variable', 'increment_variable'].includes(use.builtin) ? [operand(use.value, scope, remaining)] : [])];
      line(indent, `${prefix}${built.display_name}${args.length ? ` (${args.join(', ')})` : ''}`); return;
    }
    const call = invocation(use, scope, remaining), eligibility = call.macro && macroEligibility(call.macro);
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
      steps.forEach((step, index) => task(step.task, indent + 1, remaining - 1, call.scope, `${index + 1}. `));
    }
    taskStack.delete(macro.id);
  }
  function branches(items, indent, remaining, scope) {
    if (!items.length) line(indent, t('logicNoActions'));
    if (items.length === 1 && items[0].condition === null) { task(items[0].task, indent, remaining, scope); return; }
    items.forEach((item, index) => task(item.task, indent, remaining, scope, `${item.condition === null ? 'ELSE' : `${index ? 'ELSE IF' : 'IF'} (${condition(item.condition, scope, remaining)})`} → `));
  }
  function priority(items, indent, remaining, scope) {
    line(indent, t('logicPriorityHint'));
    if (!items.length) line(indent + 1, t('logicNoActions'));
    let fallback = false;
    items.forEach((item, index) => {
      const call = invocation(item.task, scope, remaining), eligibility = call.macro ? macroEligibility(call.macro) : undefined;
      if (fallback) line(indent + 1, `# ${t('logicAfterFallback')}`);
      const unrestricted = !!call.macro && eligibility == null;
      const prefix = unrestricted ? 'ELSE' : `${index ? 'ELSE IF' : 'IF'} (${call.macro ? condition(eligibility, call.scope, remaining) : missing()})`;
      task(item.task, indent + 1, remaining, scope, `${prefix} → `, true);
      fallback ||= unrestricted;
    });
  }
  if (slot.mode === 'priority') priority(slot.candidates ?? [], 0, limit, {});
  else branches(slot.branches ?? [], 0, limit, {});
  if (truncated) lines.push(t('logicExpansionLimit'));
  return lines.join('\n');
}
