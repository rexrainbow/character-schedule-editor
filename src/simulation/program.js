import { Program } from '../runtime/index.js';
import { normalizeSymbols } from '../core/symbols.js';
import { dayAssignments } from '../core/dayEvents.js';
import { daySimulationPlan } from './planning.js';

// Validate the selected execution graph, not unfinished unrelated definitions.
export function simulationProgram(input, { slotId, sequenceId, position, expressions = [] } = {}) {
  const draft = normalizeSymbols(input), slots = new Set(slotId ? [slotId] : []), macros = new Set(), tasks = new Set(), enums = new Set(), computed = new Set(expressions), events = new Set();
  const selectedDays = new Set();
  if (sequenceId) {
    const plan = daySimulationPlan(draft, sequenceId, position);
    if (plan.errors.length) throw Object.assign(new Error('invalidDay'), { issues: plan.errors });
    if (plan.mainDayId) selectedDays.add(plan.mainDayId);
    for (const group of plan.eventDayOptions) for (const id of group.dayCandidates?.map((item) => item.dayId) ?? [group.dayId]) selectedDays.add(id);
    for (const day of draft.days) if (selectedDays.has(day.id)) for (const entry of dayAssignments(day)) if (entry.id) slots.add(entry.id);
  }
  const seen = new Set();
  function scan(value) {
    if (!value || typeof value !== 'object') return;
    if (value.task_macro_id) macros.add(value.task_macro_id);
    if (value.task_id) tasks.add(value.task_id);
    if (value.expression_macro_id) computed.add(value.expression_macro_id);
    if (value.enum_id) enums.add(value.enum_id);
    if (value.event_group_id) events.add(value.event_group_id);
    Object.values(value).forEach(scan);
  }
  for (const day of draft.days) if (selectedDays.has(day.id)) scan(day.slotReleases);
  for (const slot of draft.slots) if (slots.has(slot.id)) scan(slot);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, entries] of [['macro', draft.taskMacros.filter((item) => macros.has(item.id))], ['expression', Object.entries(draft.operandNodes).filter(([id]) => computed.has(id)).map(([id, item]) => ({ ...item, id }))]]) for (const item of entries) {
      if (seen.has(`${key}:${item.id}`)) continue;
      seen.add(`${key}:${item.id}`); scan(item); changed = true;
    }
  }
  draft.slots = draft.slots.filter((item) => slots.has(item.id));
  draft.taskMacros = draft.taskMacros.filter((item) => macros.has(item.id));
  draft.tasks = draft.tasks.filter((item) => tasks.has(item.id));
  for (const task of draft.tasks) scan(task.parameters);
  for (const ref of [...enums]) { let parent = draft.enumNodes[ref]?.parent_id; const visited = new Set(); while (parent && !visited.has(parent)) { visited.add(parent); enums.add(parent); parent = draft.enumNodes[parent]?.parent_id; } }
  draft.enumNodes = Object.fromEntries(Object.entries(draft.enumNodes).filter(([id]) => enums.has(id)));
  const siblings = new Map();
  for (const node of Object.values(draft.enumNodes)) { const key = `${node.scope}:${node.parent_id}`; const list = siblings.get(key) ?? []; list.push(node); siblings.set(key, list); }
  for (const list of siblings.values()) list.sort((a, b) => a.order - b.order).forEach((node, index) => { node.order = index; });
  draft.operandNodes = Object.fromEntries(Object.entries(draft.operandNodes).filter(([id, item]) => item.source !== 'computed' || computed.has(id)));
  draft.sequences = draft.sequences.filter((item) => item.id === sequenceId || item.eventGroups?.some((event) => events.has(event.id)));
  const usedWeeks = new Set(draft.sequences.flatMap((item) => item.rows.map((row) => row.weekId)));
  draft.weeks = draft.weeks.filter((week) => usedWeeks.has(week.id));
  // Other days still describe the calendar for count filters; their actions are irrelevant.
  draft.days = draft.days.map((day) => {
    const { owner, slotEvents, slotReleases, dayStartId, dayEndId, ...base } = day;
    return selectedDays.has(day.id) ? day : { ...base, scope: 'shared', slotIds: day.slotIds.map(() => null) };
  });
  return Program.fromProject(draft, { referenceMode: 'uuid' });
}
