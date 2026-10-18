import { engineMetadata, clearEngineKey } from './engineKeyModel.js';
import { taskMacroDefinitionErrors, macroToData, macroFromData } from './taskMacroModel.js';
import { taskMacroContentErrors } from './operandModel.js';
import { computedErrors, conditionErrors, treeErrors, documentNodes, serializeNodes } from './operandModel.js';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './slots.schema.json' with { type: 'json' };
import { WEEKDAYS } from './scheduleConstants.js';
import { dayAssignments, setDayAssignment, dayEventsFromData, dayEventsToData } from './dayEvents.js';
import { eventGroupsFromData, eventGroupsToData, eventGroupErrors } from './sequenceEvents.js';
import { taskDefinitionErrors, taskUseErrors } from './taskModel.js';

const validate = new Ajv2020({ allErrors: true, strict: false, ownProperties: true }).compile(schema);
export const uid = () => crypto.randomUUID();
export const comparison = () => ({ kind: 'comparison', operand_a: null, comparator: '==', operand_b: null });
export const group = () => ({ kind: 'group', mode: 'ALL', items: [comparison()] });
export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const clone = (value) => structuredClone(value);

export function branchFromData(branch) {
  return { uid: uid(), condition: clone(branch.condition), task: clone(branch.task ?? { task_id: '', arguments: {} }) };
}

export function documentToDraft(data) {
  return Object.entries(data.slots).map(([id, slot]) => ({
    uid: uid(), id, name: slot.display_name, ...engineMetadata(slot), icon: slot.icon, branches: slot.branches.map(branchFromData),
  }));
}

export function nextSlotId(slots) {
  let id;
  do { id = uid(); } while (slots.some((slot) => slot.id === id));
  return id;
}

export function createSlot(slots, name) {
  return { uid: uid(), id: nextSlotId(slots), name, icon: 'tabler:calendar-event', branches: [] };
}

export function duplicateSlot(slots, slot) {
  return { ...clearEngineKey(slot), uid: uid(), id: nextSlotId(slots), name: `${slot.name} (副本)`,
    branches: slot.branches.map((branch) => ({ ...clone(branch), uid: uid() })) };
}

export function addBranch(branches) {
  const next = [...branches];
  next.splice(Math.max(0, next.length - 1), 0, branchFromData({ condition: comparison() }));
  return next;
}

export function moveBranch(branches, index, offset) {
  const target = index + offset;
  if (index < 0 || index >= branches.length - 1 || target < 0 || target >= branches.length - 1) return branches;
  const next = [...branches];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeBranch(branches, index) {
  return branches[index]?.condition === null ? branches : branches.filter((_, i) => i !== index);
}

export function validateDocument(data) {
  validate(data);
  const errors = (validate.errors ?? []).map((error) => ({
    path: error.instancePath || '/', key: `schema_${error.keyword}`,
    field: error.params.missingProperty ?? error.params.additionalProperty ?? '',
  }));
  if (data && typeof data.slots === 'object' && !Array.isArray(data.slots) && data.slots) {
    for (const [id, slot] of Object.entries(data.slots)) {
      const branches = slot?.branches;
      if (Array.isArray(branches) && branches.length > 0 && (branches.filter((b) => b?.condition === null).length !== 1 || branches.at(-1)?.condition !== null)) {
        errors.push({ path: `/slots/${id}/branches`, key: 'elseLast' });
      }
    }
  }
  if (data?.day_schedules && typeof data.day_schedules === 'object' && !Array.isArray(data.day_schedules)) {
    for (const [id, day] of Object.entries(data.day_schedules)) {
      if (!Array.isArray(day?.slot_ids)) continue;
      if (day.slot_ids.length !== data.project?.settings?.slots_per_day) {
        errors.push({ path: `/day_schedules/${id}/slot_ids`, key: 'cellCountMismatch' });
      }
      day.slot_ids.forEach((slotId, index) => {
        if (slotId !== null && !Object.hasOwn(data.slots ?? {}, slotId)) {
          errors.push({ path: `/day_schedules/${id}/slot_ids/${index}`, key: 'missingSlot' });
        }
      });
      const eventRefs = [['day_start_slot_id', day.day_start_slot_id], ['day_end_slot_id', day.day_end_slot_id]];
      if (Array.isArray(day.slot_events)) {
        if (day.slot_events.length !== day.slot_ids.length) errors.push({ path: `/day_schedules/${id}/slot_events`, key: 'cellCountMismatch' });
        day.slot_events.forEach((entry, index) => { for (const key of ['start_slot_id', 'end_slot_id']) eventRefs.push([`slot_events/${index}/${key}`, entry?.[key]]); });
      }
      for (const [path, slotId] of eventRefs) if (slotId !== undefined && slotId !== null && !Object.hasOwn(data.slots ?? {}, slotId)) errors.push({ path: `/day_schedules/${id}/${path}`, key: 'missingSlot' });
    }
  }
  const days = data?.day_schedules;
  const weeks = data?.week_schedules;
  const privateRefs = new Map();
  if (weeks && typeof weeks === 'object' && !Array.isArray(weeks)) {
    for (const [weekId, week] of Object.entries(weeks)) {
      for (const weekday of WEEKDAYS) {
        const dayId = week?.days?.[weekday];
        if (dayId == null) continue;
        const path = `/week_schedules/${weekId}/days/${weekday}`;
        if (!days || !Object.hasOwn(days, dayId)) { errors.push({ path, key: 'missingDay' }); continue; }
        const day = days[dayId];
        if (day?.scope === 'week_private') {
          privateRefs.set(dayId, (privateRefs.get(dayId) ?? 0) + 1);
          if (day.owner?.week_schedule_id !== weekId || day.owner?.weekday !== weekday) errors.push({ path, key: 'privateOwnerMismatch' });
        }
      }
    }
  }
  if (days && typeof days === 'object' && !Array.isArray(days)) {
    for (const [dayId, day] of Object.entries(days)) {
      if (day?.scope !== 'week_private') continue;
      if (privateRefs.get(dayId) !== 1 || weeks?.[day.owner?.week_schedule_id]?.days?.[day.owner?.weekday] !== dayId) {
        errors.push({ path: `/day_schedules/${dayId}/owner`, key: 'privateOwnerMismatch' });
      }
    }
  }
  const sequences = data?.week_sequences;
  const eventGroupIds = new Set();
  if (sequences && typeof sequences === 'object' && !Array.isArray(sequences)) {
    for (const [id, sequence] of Object.entries(sequences)) {
      const weekIds = sequence?.week_schedule_ids;
      if (Array.isArray(sequence?.event_groups) && Array.isArray(weekIds)) {
        const groups = eventGroupsFromData(sequence.event_groups);
        groups.forEach((group, index) => { if (eventGroupIds.has(group.id)) errors.push({ path: `/week_sequences/${id}/event_groups/${index}/id`, key: 'duplicateId' }); eventGroupIds.add(group.id); });
        const eventDays = Object.entries(days ?? {}).map(([id, day]) => ({ id, scope: day?.scope }));
        errors.push(...eventGroupErrors({ rows: weekIds, eventGroups: groups }, eventDays).map((error) => ({ ...error, path: `/week_sequences/${id}${error.path}` })));
      }
      if (Array.isArray(weekIds) && weekIds.length === 1 && WEEKDAYS.indexOf(sequence.start_weekday ?? 'mon') > WEEKDAYS.indexOf(sequence.end_weekday ?? 'sun')) errors.push({ path: `/week_sequences/${id}/end_weekday`, key: 'invalidSequenceRange' });
      if (Array.isArray(weekIds)) weekIds.forEach((weekId, index) => {
        if (!weeks || !Object.hasOwn(weeks, weekId)) errors.push({ path: `/week_sequences/${id}/week_schedule_ids/${index}`, key: 'missingWeek' });
      });
      if (!Array.isArray(sequence?.day_overrides)) continue;
      const seen = new Set();
      sequence.day_overrides.forEach((override, index) => {
        const path = `/week_sequences/${id}/day_overrides/${index}`;
        if (!override || typeof override !== 'object') return;
        const key = `${override.week_number}:${override.weekday}`;
        if (seen.has(key)) errors.push({ path, key: 'duplicateOverride' });
        seen.add(key);
        if (!Number.isInteger(override.week_number) || override.week_number < 1 || override.week_number > (weekIds?.length ?? 0)) errors.push({ path: `${path}/week_number`, key: 'overrideRange' });
        const dayId = override.day_schedule_id;
        if (dayId === null) return;
        if (!days || !Object.hasOwn(days, dayId)) errors.push({ path: `${path}/day_schedule_id`, key: 'missingDay' });
        else if (days[dayId]?.scope && days[dayId].scope !== 'shared') errors.push({ path: `${path}/day_schedule_id`, key: 'overrideSharedOnly' });
      });
    }
  }
  const nodes = documentNodes(data);
  for (const id of Object.keys(data?.expression_macros ?? {})) if (Object.hasOwn(data?.operand_nodes ?? {}, id)) errors.push({ path: `/expression_macros/${id}`, key: 'duplicateId' });
  errors.push(...treeErrors(nodes), ...computedErrors(nodes));
  const tasks = data?.tasks && typeof data.tasks === 'object' && !Array.isArray(data.tasks) ? Object.entries(data.tasks).map(([id, task]) => ({ ...task, id })) : [];
  const taskMacros = data?.task_macros && typeof data.task_macros === 'object' && !Array.isArray(data.task_macros) ? Object.entries(data.task_macros).map(([id, sequence]) => ({ ...sequence, id })) : [];
  errors.push(...taskDefinitionErrors(tasks), ...taskMacroDefinitionErrors(taskMacros), ...taskMacroContentErrors(taskMacros, tasks, nodes));
  if (data?.slots && typeof data.slots === 'object') for (const [id, slot] of Object.entries(data.slots)) {
    if (Array.isArray(slot?.branches)) slot.branches.forEach((branch, i) => errors.push(...conditionErrors(branch?.condition, nodes, `/slots/${id}/branches/${i}/condition`)));
    if (Array.isArray(slot?.branches)) slot.branches.forEach((branch, i) => errors.push(...taskUseErrors(branch?.task, tasks, nodes, `/slots/${id}/branches/${i}/task`, [], taskMacros)));
  }
  return errors;
}

export function compileDraft(slots, operandNodes = {}, tasks = [], taskMacros = []) {
  const errors = [];
  const entries = [];
  const seen = new Set();
  for (const slot of slots) {
    const path = `/slots/${slot.id || '(empty)'}`;
    if (!idPattern.test(slot.id)) errors.push({ path, key: 'idPattern' });
    if (seen.has(slot.id)) errors.push({ path, key: 'duplicateId' });
    seen.add(slot.id);
    const branches = slot.branches.map((branch) => ({ condition: branch.condition, task: clone(branch.task) }));
    entries.push([slot.id, { display_name: slot.name, ...engineMetadata(slot), icon: slot.icon, branches }]);
  }
  const data = { slots: Object.fromEntries(entries) };
  errors.push(...validateDocument({ project: createProject().project, ...data, day_schedules: {}, ...serializeNodes(operandNodes), tasks: Object.fromEntries(tasks.map(({ id, ...task }) => [id, task])), task_macros: Object.fromEntries(taskMacros.map((macro) => [macro.id, macroToData(macro)])) }));
  return { data, errors };
}

export function createProject() {
  return { project: { schema_version: 'dev', name: 'Character Schedule', settings: { slots_per_day: 3 } }, slots: [], days: [], weeks: [], sequences: [], operandNodes: {}, tasks: [], taskMacros: [] };
}

export function projectToDraft(data) {
  return { ...(data.environment === undefined ? {} : { environment: clone(data.environment) }), ...(data.builtin_tasks === undefined ? {} : { builtinTasks: clone(data.builtin_tasks) }), project: clone(data.project), operandNodes: documentNodes(data), taskMacros: Object.entries(data.task_macros ?? {}).map(([id, macro]) => macroFromData(id, macro)), tasks: Object.entries(data.tasks).map(([id, task]) => ({ ...clone(task), id })), slots: documentToDraft(data),
    days: Object.entries(data.day_schedules).map(([id, day]) => ({ id, name: day.display_name, ...engineMetadata(day), icon: day.icon ?? 'tabler:calendar', slotIds: [...day.slot_ids],
      ...dayEventsFromData(day),
      ...(day.scope === undefined ? {} : { scope: day.scope }), ...(day.owner === undefined ? {} : { owner: clone(day.owner) }) })),
    weeks: Object.entries(data.week_schedules ?? {}).map(([id, week]) => ({ id, name: week.display_name, ...engineMetadata(week), icon: week.icon ?? 'tabler:calendar-week', days: clone(week.days) })),
    sequences: Object.entries(data.week_sequences ?? {}).map(([id, sequence]) => ({ id, name: sequence.display_name, ...engineMetadata(sequence), icon: sequence.icon ?? 'tabler:calendar-stats',
      ...(sequence.start_weekday === undefined ? {} : { startWeekday: sequence.start_weekday }), ...(sequence.end_weekday === undefined ? {} : { endWeekday: sequence.end_weekday }),
      ...(sequence.event_groups === undefined ? {} : { eventGroups: eventGroupsFromData(sequence.event_groups) }),
      rows: sequence.week_schedule_ids.map((weekId, index) => ({ uid: uid(), weekId,
        overrides: Object.fromEntries(sequence.day_overrides.filter((item) => item.week_number === index + 1).map((item) => [item.weekday, item.day_schedule_id])) })) })) };
}

export function compileProject(draft) {
  const { data, errors } = compileDraft(draft.slots, draft.operandNodes, draft.tasks, draft.taskMacros);
  errors.push(...taskDefinitionErrors(draft.tasks), ...taskMacroDefinitionErrors(draft.taskMacros));
  const seen = new Set();
  for (const day of draft.days) {
    if (seen.has(day.id)) errors.push({ path: `/day_schedules/${day.id}`, key: 'duplicateId' });
    seen.add(day.id);
  }
  const document = { ...(draft.environment === undefined ? {} : { environment: clone(draft.environment) }), ...(draft.builtinTasks === undefined ? {} : { builtin_tasks: clone(draft.builtinTasks) }), task_macros: Object.fromEntries((draft.taskMacros ?? []).map((macro) => [macro.id, macroToData(macro)])), tasks: Object.fromEntries((draft.tasks ?? []).map(({ id, ...task }) => [id, clone(task)])), ...serializeNodes(draft.operandNodes), project: clone(draft.project), slots: data.slots,
    day_schedules: Object.fromEntries(draft.days.map((day) => [day.id, { display_name: day.name, ...engineMetadata(day), icon: day.icon ?? 'tabler:calendar', slot_ids: [...day.slotIds],
      ...dayEventsToData(day),
      ...(day.scope === undefined ? {} : { scope: day.scope }), ...(day.owner === undefined ? {} : { owner: clone(day.owner) }) }])),
    week_schedules: Object.fromEntries((draft.weeks ?? []).map((week) => [week.id, { display_name: week.name, ...engineMetadata(week), icon: week.icon ?? 'tabler:calendar-week', days: clone(week.days) }])),
    week_sequences: Object.fromEntries((draft.sequences ?? []).map((sequence) => [sequence.id, {
      display_name: sequence.name, ...engineMetadata(sequence), icon: sequence.icon ?? 'tabler:calendar-stats', week_schedule_ids: sequence.rows.map((row) => row.weekId),
      ...(sequence.startWeekday === undefined ? {} : { start_weekday: sequence.startWeekday }), ...(sequence.endWeekday === undefined ? {} : { end_weekday: sequence.endWeekday }),
      ...(sequence.eventGroups === undefined ? {} : { event_groups: eventGroupsToData(sequence.eventGroups, draft.days) }),
      day_overrides: sequence.rows.flatMap((row, index) => WEEKDAYS.filter((weekday) => Object.hasOwn(row.overrides, weekday)).map((weekday) => ({ week_number: index + 1, weekday, day_schedule_id: row.overrides[weekday] }))),
    }])) };
  const sequenceIds = new Set();
  for (const sequence of draft.sequences ?? []) {
    if (sequenceIds.has(sequence.id)) errors.push({ path: `/week_sequences/${sequence.id}`, key: 'duplicateId' });
    sequenceIds.add(sequence.id);
  }
  const weekIds = new Set();
  for (const week of draft.weeks ?? []) {
    if (weekIds.has(week.id)) errors.push({ path: `/week_schedules/${week.id}`, key: 'duplicateId' });
    weekIds.add(week.id);
  }
  const combined = [...errors, ...validateDocument(document)];
  return { data: document, errors: combined.filter((error, index) => combined.findIndex((other) => other.path === error.path && other.key === error.key && other.field === error.field) === index) };
}

export function createDay(draft, name) {
  return { id: nextSlotId(draft.days), name, icon: 'tabler:calendar', slotIds: Array(draft.project.settings.slots_per_day).fill(null) };
}

export function duplicateDay(draft, day) {
  return { id: nextSlotId(draft.days), name: `${day.name} (副本)`, icon: day.icon ?? 'tabler:calendar', slotIds: [...day.slotIds], ...clone(dayEventsFromData(dayEventsToData(day))) };
}

export function referenceCount(draft, slotId) {
  return draft.days.reduce((count, day) => count + dayAssignments(day).filter((entry) => entry.id === slotId).length, 0);
}

export function deleteSlotAndReferences(draft, slotId) {
  return { ...draft, slots: draft.slots.filter((slot) => slot.id !== slotId),
    days: draft.days.map((day) => dayAssignments(day).filter((entry) => entry.id === slotId).reduce((next, entry) => setDayAssignment(next, entry.target, null), day)) };
}

export function assignCell(draft, dayId, index, slotId) {
  if (slotId !== null && !draft.slots.some((slot) => slot.id === slotId)) throw new Error('Unknown slot');
  const day = draft.days.find((item) => item.id === dayId);
  if (!day) throw new Error('Unknown day');
  return { ...draft, days: draft.days.map((item) => item.id === dayId
    ? setDayAssignment(item, index, slotId) : item) };
}

export function applySlotEdit(draft, slot, dayId, index) {
  if (compileDraft([slot], draft.operandNodes, draft.tasks, draft.taskMacros).errors.length) throw new Error('Invalid slot draft');
  const exists = draft.slots.some((item) => item.id === slot.id);
  const next = { ...draft, slots: exists ? draft.slots.map((item) => item.id === slot.id ? clone(slot) : item) : [...draft.slots, clone(slot)] };
  return assignCell(next, dayId, index, slot.id);
}

export function taskSummary(slot, unnamed, tasks = [], taskMacros = [], builtinName = 'Set variable') {
  const names = typeof builtinName === 'string' ? { set_variable: builtinName, increment_variable: 'Increase value', toggle_variable: 'Toggle boolean', reset_variable: 'Reset initial value' } : builtinName;
  return slot.branches.map((branch) => (branch.task?.builtin ? { display_name: names[branch.task.builtin] } : branch.task?.task_macro_id !== undefined ? taskMacros.find((sequence) => sequence.id === branch.task.task_macro_id) : tasks.find((task) => task.id === branch.task?.task_id))?.display_name || unnamed).join(' / ');
}
