import { formatCondition, formatOperand, nodePath } from '../core/operandModel.js';
import { builtinTaskDefinition } from '../core/builtinTaskModel.js';
import { eventDateLabel, positionDate } from '../core/sequenceEvents.js';
import { reservationSourceText } from '../core/scheduledEvents.js';

export function phaseLabel(context, t) {
  return context.phase === 'day.start' ? t('dayStartEvent') : context.phase === 'day.end' ? t('dayEndEvent') : t(context.phase === 'slot.start' ? 'slotStartEvent' : context.phase === 'slot.end' ? 'slotEndEvent' : 'cell', { count: context.slotIndex + 1 });
}

/** Presentation-only subscriber. Runtime owns all decisions and never retains these records. */
export class TraceCollector {
  constructor(draft, t, { standalone = false } = {}) {
    this.draft = draft; this.t = t; this.standalone = standalone; this.trace = []; this.calls = []; this.nodes = new Map();
    this.parameters = [...draft.tasks, ...draft.taskMacros].flatMap((owner) => owner.parameters);
  }
  accept(record) {
    const t = this.t, parent = this.nodes.get(record.parentId);
    if (record.type === 'enter') {
      const node = this.#node(record);
      this.nodes.set(record.id, node);
      if (record.kind === 'daySlot' && !record.context.slotRef && !record.context.release && !(record.context.phase === 'slot.start' && record.context.type === 'event' && record.context.executionMode !== 'overlay')) { node.children = parent?.children ?? this.trace; return; }
      // Standalone execution has no calendar/source wrappers in the existing UI.
      if (this.standalone && ['phase', 'daySlot'].includes(record.kind)) { node.children = parent?.children ?? this.trace; return; }
      (parent?.children ?? this.trace).push(node); return;
    }
    if (record.type === 'exit') {
      const node = this.nodes.get(record.id); if (!node) return;
      for (const key of ['value', 'result', 'failed', 'skipped', 'before', 'after', 'requested', 'applied', 'reason', 'accepted']) if (record[key] !== undefined) node[key] = record[key];
      if (record.completed && record.pending) {
        const { pending } = record, use = pending.use, context = { ...pending.context, phase: phaseLabel(pending.context, t), groupId: pending.context.eventRef, dayId: pending.context.dayRef, slotId: pending.context.slotRef };
        const definition = use.builtin ? builtinTaskDefinition(use.builtin, this.draft.builtinTasks, t) : this.draft.tasks.find((task) => task.id === pending.taskRef);
        const call = { kind: use.builtin ? ['release_slot', 'schedule_event'].includes(use.builtin) ? 'control' : 'builtin' : 'task', display_name: definition.display_name, symbol: definition.symbol, path: pending.path, context, ...(use.builtin ? { builtin: use.builtin } : { arguments: definition.parameters.map((p) => ({ id: p.id, display_name: p.display_name, type: p.type, value: pending.arguments[p.symbol ?? p.display_name] ?? Object.values(pending.arguments)[definition.parameters.indexOf(p)] })), effectsModeled: false }), ...Object.fromEntries(['before', 'after', 'target_variable_id', 'event_group_id', 'property', 'operation', 'accepted', 'reason', 'applied', 'result'].filter((key) => record[key] !== undefined).map((key) => [key, record[key]])), ...(pending.random ?? {}) };
        this.calls.push(call);
        if (!use.builtin) node.unmodeled = true;
        if (record.target_variable_id) node.target = nodePath(this.draft.operandNodes, record.target_variable_id);
        if (record.event_group_id) node.target = `${this.#eventName(record.event_group_id)}.${record.property}`;
        if (use.builtin === 'schedule_event') {
          node.children.push({ kind: 'message', label: record.accepted ? `${t('scheduleAccepted')}: ${use.display_name || this.draft.days.find((day) => day.id === use.day_schedule_id)?.name || ''}` : `${t('scheduleRejected')}: ${t(record.reason)}` });
          if (record.reservation) node.children.push({ kind: 'message', label: eventDateLabel(positionDate(record.reservation.position), t) }, { kind: 'message', label: reservationSourceText(use, this.draft.days, t) });
        }
        if (record.requested !== undefined && record.after !== record.requested) node.children.push({ kind: 'clamp', label: t('simulationClamped', { requested: record.requested, value: record.after }) });
      }
      return;
    }
    if (record.type !== 'record' || !parent) return;
    if (record.kind === 'selection') { parent.result = record.result; return; }
    if (record.kind === 'weightedSelection') {
      parent.children.push({ kind: 'message', label: record.index !== null ? t('weightedSelected', { count: record.index }) : t(record.fallback ? 'weightedUseFallback' : 'weightedNoSelection') });
      parent.children.push({ kind: 'message', label: t('weightedPool', { value: record.weights.map((item) => `${item.index}: ${item.weight}`).join(', ') || '—' }) });
      if (record.draw !== null) parent.children.push({ kind: 'message', label: t('weightedDraw', { value: record.draw }) });
      return;
    }
    if (record.kind === 'return') parent.children.push({ kind: 'return', label: t('computedReturn'), value: record.value, path: record.path });
    else if (record.kind === 'skipped') parent.children.push({ kind: 'skipped', label: t('computedReturn') });
    else if (record.kind === 'random' && record.random_amplitude > 0) parent.children.push({ kind: 'random', label: t('simulationRandomOffset', { amount: record.increment, amplitude: record.random_amplitude, offset: record.random_offset }), value: record.random_offset });
    else if (record.kind === 'argument') {
      const value = record.value?.type === 'variable_reference' ? nodePath(this.draft.operandNodes, record.value.reference_id) : record.value?.type === 'event_reference' ? this.#eventName(record.value.event_group_id) : record.value;
      parent.children.push({ kind: 'argument', label: record.parameter.display_name, value, path: record.path });
    }
  }
  #eventName(id) { return this.draft.sequences.flatMap((sequence) => sequence.eventGroups ?? []).find((event) => event.id === id)?.display_name || id; }
  #node(record) {
    const t = this.t, node = { kind: record.kind, path: record.path ?? '/', children: [], ...Object.fromEntries(['index', 'isElse', 'unconditional', 'empty', 'skipped', 'cancelled'].filter((key) => record[key] !== undefined).map((key) => [key, record[key]])) };
    if (record.kind === 'phase') node.label = phaseLabel(record.context, t);
    else if (record.kind === 'daySlot') {
      const c = record.context, day = this.draft.days.find((item) => item.id === c.dayRef), slot = this.draft.slots.find((item) => item.id === c.slotRef);
      node.label = `${c.name ?? day?.name ?? ''} [${c.type === 'main' ? t('simulationMainDay') : `${t('eventPriority')}: ${c.priority}`}] → ${slot?.name ?? t('unassigned')}`;
      node.dayId = c.dayRef; node.slotId = c.slotRef; node.groupId = c.eventRef;
      if (record.cancelledBy) node.cancelledBy = { name: record.cancelledBy.name, task: t(record.cancelledBy.reason ?? `executionMode_${record.cancelledBy.executionMode}`), scope: 'slot', phase: phaseLabel(c, t), path: record.cancelledBy.path ?? '/' };
    } else if (record.kind === 'branch') node.label = record.isElse ? 'ELSE' : formatCondition(record.condition, this.draft.operandNodes, '?', this.parameters);
    else if (record.kind === 'condition') node.label = formatCondition(record.condition, this.draft.operandNodes, '?', this.parameters);
    else if (record.kind === 'value') node.label = formatOperand(record.operand, this.draft.operandNodes, '?', this.parameters);
    else if (record.kind === 'slot') node.label = this.draft.slots.find((slot) => slot.id === record.slotRef)?.name ?? '?';
    else if (record.kind === 'macro') node.label = this.draft.taskMacros.find((macro) => macro.id === record.macroRef)?.display_name ?? '?';
    else if (record.kind === 'step') node.label = t('taskStep', { count: record.index });
    else if (record.kind === 'candidate') node.label = `${t('candidateNumber', { count: record.index })}: ${record.task?.builtin ? builtinTaskDefinition(record.task.builtin, this.draft.builtinTasks, t).display_name : (record.task?.task_macro_id ? this.draft.taskMacros : this.draft.tasks).find((item) => item.id === (record.task?.task_macro_id ?? record.task?.task_id))?.display_name ?? '?'}`;
    else if (record.kind === 'weighted') node.label = t('weightedCandidates');
    else if (record.kind === 'weight') node.label = `${t('candidateNumber', { count: record.index })}: ${t('randomWeight')}`;
    else if (record.kind === 'guard') node.label = t('candidateCondition');
    else if (record.use) node.label = record.use.builtin ? builtinTaskDefinition(record.use.builtin, this.draft.builtinTasks, t).display_name : this.draft.tasks.find((task) => task.id === record.use.task_id)?.display_name ?? '?';
    else node.label = record.kind;
    return node;
  }
}
