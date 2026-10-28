import { sequenceRepeatErrors } from './sequenceExecution.js';
import { normalizeSymbols, symbolErrors } from './symbols.js';
import { scheduledDayReferences } from './scheduledEvents.js';
import { eventDayIds } from './eventDaySource.js';
import { slotReleaseErrors, slotReleaseReferences } from './slotRelease.js';
import { subtreeIds } from './operandModel.js';
// Platform-independent project editing. No React, browser storage or filesystem APIs.
import { createProject, createSlot, duplicateSlot, createDay, duplicateDay, compileProject, projectToDraft, validateDocument, deleteSlotAndReferences, assignCell, applySlotEdit, referenceCount } from './model.js';
import { createWeek, duplicateWeek, deleteWeek, deleteSharedDay, setWeekDay, changeWeekCell, dayReferenceCount } from './weekModel.js';
import { createSequence, duplicateSequence, addSequenceRow, replaceSequenceWeek, moveSequenceRow, duplicateSequenceRow, removeSequenceRow, setSequenceOverride, setSequenceRepeat, weekSequenceReferenceCount, dayOverrideReferenceCount } from './sequenceModel.js';
import { setSequenceBoundary, sequenceRange } from './sequenceRange.js';
import { newEventGroup, changeEventStart, duplicateEventGroup, eventGroupName, countDayReferences, positionDate, datePosition } from './sequenceEvents.js';
import { eventCatalog, eventReferencesTo, eventUsageErrors } from './eventReferences.js';
import { addOperandNode, addComputedNode, duplicateOperandSubtree, deleteOperandNode, changeOperandType, changeReadOnly, moveOperandNode, applyComputedDefinition, subtreeReferences, nodeScope, isComputed } from './operandModel.js';
import { addEnumNode, moveEnumNode, duplicateEnumSubtree, enumSubtree, enumReferenceErrors, enumUsageErrors, enumReferences, enumScope } from './enumDefinitions.js';
import { createTask, duplicateTask, deleteTask, taskUses, createParameter, changeParameterType, deleteParameter } from './taskModel.js';
import { createTaskMacro, duplicateTaskMacro, deleteTaskMacro, changeMacroMode, changeMacroParameterType, deleteMacroParameter, macroUses, createTaskStep, macroParameterReferences } from './taskMacroModel.js';
import { builtinTaskDefinitions, changeBuiltinDefinition } from './builtinTaskModel.js';
import { addProgressDefinitions } from './progressEnvironment.js';
import { compileEnvironment, prepareEnvironmentImport, createProjectWithEnvironment } from './environmentModel.js';
import { compileRuntime } from './runtimeModel.js';
import { engineKeyEntries, engineKeyConflicts } from './engineKeyModel.js';
import { translator } from '../i18n/index.js';
import { compileReport } from './reportModel.js';
import { dayUses, matchesDayUse } from './dayUses.js';
import { exportBlueprint, importBlueprint } from './blueprint/index.js';

const clone = (value) => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Preserve NaN in unfinished numeric fields; JSON.stringify would conflate it with null.
function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
const issue = (key, path = '', extra = {}) => ({ key, code: key, path, ...extra });
const fail = (key, path = '', extra) => { const error = new Error(key); error.issues = [issue(key, path, extra)]; throw error; };
function requireItem(items, id, path) {
  const value = Array.isArray(items) ? items.find((item) => item.id === id) : items[id];
  if (!value) fail('unknownProjectObject', `${path}/${id}`, { objectId: id });
  return value;
}
const patchItem = (items, id, patch) => items.map((item) => item.id === id ? { ...item, ...clone(patch), id } : item);
function entityValues(key, values) {
  const next = clone(values), schedule = ['slots', 'days', 'weeks', 'sequences'].includes(key);
  if (schedule && Object.hasOwn(next, 'display_name')) { if (!Object.hasOwn(next, 'name')) next.name = next.display_name; delete next.display_name; }
  if (!schedule && Object.hasOwn(next, 'name')) { if (!Object.hasOwn(next, 'display_name')) next.display_name = next.name; delete next.name; }
  return next;
}
function moveItem(items, index, offset) {
  const target = index + offset;
  if (!Number.isInteger(index) || !Number.isInteger(offset) || index < 0 || target < 0 || index >= items.length || target >= items.length) fail('invalidOrder');
  const next = [...items], [item] = next.splice(index, 1); next.splice(target, 0, item); return next;
}
function checkShape(draft) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(draft) || !object(draft.project) || !object(draft.project.settings)) fail('invalidProjectStructure', '/project');
  for (const key of ['slots', 'days', 'weeks', 'sequences', 'tasks', 'taskMacros']) if (!Array.isArray(draft[key]) || draft[key].some((item) => !object(item))) fail('invalidProjectStructure', `/${key}`);
  for (const key of ['operandNodes', 'enumNodes']) if (!object(draft[key])) fail('invalidProjectStructure', `/${key}`);
  for (const key of ['tasks', 'taskMacros']) for (const item of draft[key]) if (!Array.isArray(item.parameters)) fail('invalidProjectStructure', `/${key}/${item.id}/parameters`);
}
function scopeErrors(before, after, mode) {
  if (mode === 'all') return [];
  if (mode === 'simulation') return equal(before, after) ? [] : [issue('projectModeLocked')];
  const errors = [];
  let permitted = before;
  // Removing an engine parameter must also clear its arguments in user content.
  // Only that derived cleanup is allowed through an environment edit.
  if (mode === 'environment') for (const task of before.tasks) {
    const next = after.tasks.find((item) => item.id === task.id);
    if (next) for (const parameter of task.parameters) if (!next.parameters.some((p) => p.id === parameter.id)) permitted = deleteParameter(permitted, task.id, parameter.id);
  }
  const locked = mode === 'user' ? ['tasks', 'builtinTasks', 'environment'] : ['slots', 'days', 'weeks', 'sequences', 'taskMacros'];
  for (const key of locked) if (!equal(permitted[key], after[key])) errors.push(issue('projectModeLocked', `/${key}`));
  for (const collection of ['operandNodes', 'enumNodes']) {
    const left = before[collection] ?? {}, right = after[collection] ?? {};
    for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const scopes = [left[id], right[id]].filter(Boolean).map((node) => collection === 'enumNodes' ? enumScope(node) : nodeScope(node));
      if (scopes.some((scope) => scope !== (mode === 'user' ? 'application' : 'environment')) && !equal(left[id], right[id])) errors.push(issue('projectModeLocked', `/${collection}/${id}`, { objectId: id }));
    }
  }
  return errors;
}
function transitionErrors(before, after, mode) {
  const errors = scopeErrors(before, after, mode);
  const nextEventIds = new Set(eventCatalog(after).map((group) => group.id));
  const removed = eventCatalog(before).filter((group) => !nextEventIds.has(group.id)).map((group) => group.id);
  const references = eventReferencesTo(after, removed);
  if (references.length) errors.push(issue('eventInUse', '', { references, count: references.length }));
  const previousEventErrors = eventUsageErrors(before);
  errors.push(...eventUsageErrors(after).filter((error) => !previousEventErrors.some((old) => old.key === error.key && old.path === error.path)));
  const oldEnumErrors = [...enumReferenceErrors(before), ...enumUsageErrors(before)];
  errors.push(...[...enumReferenceErrors(after), ...enumUsageErrors(after)].filter((error) => !oldEnumErrors.some((old) => old.path === error.path && old.key === error.key)));
  const previousReleaseErrors = slotReleaseErrors(before);
  errors.push(...slotReleaseErrors(after).filter((error) => !previousReleaseErrors.some((old) => old.key === error.key && old.path === error.path)));
  for (const day of before.days) if (!after.days.some((next) => next.id === day.id) && scheduledDayReferences(after, day.id).length) errors.push(issue('scheduledDayInUse', `/day_schedules/${day.id}`));
  const oldNodes = before.operandNodes, nodes = after.operandNodes;
  for (const [id, node] of Object.entries(oldNodes)) {
    if (equal(node, nodes[id])) continue;
    if (!nodes[id]) {
      const refs = [...subtreeReferences(oldNodes, after.slots, id, after.taskMacros, after.tasks), ...slotReleaseReferences(after, subtreeIds(oldNodes, id))].filter((ref) => !!nodes[ref.ownerId] || !ref.ownerId);
      if (refs.length) errors.push(issue('nodeInUse', `/operand_nodes/${id}`, { references: refs }));
    } else if (!isComputed(node) && node.node_type === 'value') {
      if (node.value_type !== nodes[id].value_type) {
        const result = changeOperandType(oldNodes, after.slots, id, nodes[id].value_type, after.tasks, after.taskMacros);
        if (result.blocked.length) errors.push(issue('typeChangeBlocked', `/operand_nodes/${id}`, { references: result.blocked }));
      }
      if (!node.read_only && nodes[id].read_only) {
        const result = changeReadOnly(nodes, after.slots, id, true, after.taskMacros, after.tasks);
        if (result.blocked.length) errors.push(issue('readOnlyBlocked', `/operand_nodes/${id}`, { references: result.blocked }));
      }
    }
  }
  for (const item of before.tasks) if (!after.tasks.some((next) => next.id === item.id)) {
    const refs = taskUses(after.slots, item.id, after.taskMacros);
    if (refs.length) errors.push(issue('taskInUse', `/tasks/${item.id}`, { references: refs }));
  }
  for (const item of before.taskMacros) if (!after.taskMacros.some((next) => next.id === item.id)) {
    const refs = macroUses(after.slots, item.id, after.taskMacros);
    if (refs.length) errors.push(issue('taskMacroInUse', `/task_macros/${item.id}`, { references: refs }));
  }
  return errors;
}

/** Creates a stable, synchronous store. Strict by default; GUI uses validation:'draft'. */
export function createProjectSession(initial = createProject(), { mode = 'user', validation = 'strict', t = translator('en') } = {}) {
  if (!['user', 'environment', 'simulation', 'all'].includes(mode)) throw new Error('invalidProjectMode');
  if (!['strict', 'draft'].includes(validation)) throw new Error('invalidProjectValidation');
  let snapshot = freeze(normalizeSymbols(initial)), currentMode = mode, revision = 0, batching = false, failures = [], changes = [];
  const listeners = new Set();
  function publish() { for (const listener of [...listeners]) { try { listener(); } catch { /* A view cannot invalidate a completed edit. */ } } }
  function validationErrors(next) { try { return compileProject(next).errors; } catch (error) { return [issue('invalidProjectStructure', '', { detail: error.message })]; } }
  function warnings(next) {
    const entries = engineKeyEntries(next);
    return entries.filter((entry) => engineKeyConflicts(entries, entry.kind, entry.id, entry.key).length).map((entry) => issue('duplicateEngineKey', entry.path ?? `/${entry.kind}/${entry.id}/symbol`, { objectId: entry.id, value: entry.key }));
  }
  function result(ok, value, errors = []) {
    if (ok && value?.id) value = [...snapshot.slots, ...snapshot.days, ...snapshot.weeks, ...snapshot.sequences, ...snapshot.tasks, ...snapshot.taskMacros, ...snapshot.tasks.flatMap((item) => item.parameters ?? []), ...snapshot.taskMacros.flatMap((item) => item.parameters ?? []), ...snapshot.sequences.flatMap((item) => item.eventGroups ?? []), ...Object.entries(snapshot.operandNodes).map(([id, item]) => ({ ...item, id })), ...Object.entries(snapshot.enumNodes).map(([id, item]) => ({ ...item, id }))].find((item) => item.id === value.id) ?? value;
    errors = errors.map((error) => ({ ...error, code: error.code ?? error.key }));
    return { ok, value: clone(value), id: value?.id, draft: snapshot, nodes: snapshot.operandNodes, errors, blocked: ok ? [] : errors.flatMap((error) => error.references ?? [error]), warnings: ok ? warnings(snapshot) : [] };
  }
  function apply(action, transform, policyMode = currentMode) {
    try {
      const transformed = transform(snapshot);
      const next = normalizeSymbols(transformed.draft), value = transformed.value;
      checkShape(next);
      const errors = batching ? [] : [...transitionErrors(snapshot, next, policyMode), ...(validation === 'strict' ? validationErrors(next) : [])];
      if (errors.length) { if (batching) failures.push(...errors); return result(false, null, errors); }
      if (!equal(snapshot, next)) {
        snapshot = freeze(normalizeSymbols(next)); changes.push({ action, objectId: value?.id });
        if (!batching) { revision++; publish(); }
      }
      return result(true, value);
    } catch (error) {
      const errors = error.issues ?? [issue(error.message)];
      if (batching) failures.push(...errors);
      return result(false, null, errors);
    }
  }
  function replace(collection, id, patch) {
    return apply(`${collection}.update`, (draft) => {
      requireItem(draft[collection], id, `/${collection}`);
      const items = patchItem(draft[collection], id, entityValues(collection, patch));
      return { draft: { ...draft, [collection]: items }, value: items.find((item) => item.id === id) };
    });
  }
  function collection(key, create, duplicate, remove) {
    return {
      list: (query = {}) => clone(snapshot[key].filter((item) => (!query.name || (item.name ?? item.display_name).toLocaleLowerCase().includes(query.name.toLocaleLowerCase())) && (!query.scope || item.scope === query.scope || query.scope === 'shared' && !item.scope) && (!query.tag || item.tags?.includes(query.tag)))),
      get: (id) => clone(snapshot[key].find((item) => item.id === id) ?? null),
      create: (values = {}) => apply(`${key}.create`, (draft) => { values = entityValues(key, values); const item = { ...create(draft, values.name ?? values.display_name ?? ''), ...values }; if (draft[key].some((old) => old.id === item.id)) fail('duplicateId', `/${key}/${item.id}`); return { draft: { ...draft, [key]: [...draft[key], item] }, value: item }; }),
      update: (id, patch) => replace(key, id, patch),
      replace: (id, values) => apply(`${key}.replace`, (draft) => { requireItem(draft[key], id, `/${key}`); const value = { ...entityValues(key, values), id }; return { draft: { ...draft, [key]: draft[key].map((item) => item.id === id ? value : item) }, value }; }),
      remove: (id) => apply(`${key}.remove`, (draft) => { requireItem(draft[key], id, `/${key}`); return { draft: remove(draft, id), value: { id } }; }),
      duplicate: (id) => apply(`${key}.duplicate`, (draft) => { const source = requireItem(draft[key], id, `/${key}`), value = duplicate(draft, source); const next = value.weeks ? value : { ...draft, [key]: [...draft[key], value] }; return { draft: next, value: value.weeks ? next.weeks.at(-1) : value }; }),
    };
  }
  function nodeCollection(computed = false) {
    const key = computed ? 'expressions' : 'variables';
    const get = (draft, id) => { const node = requireItem(draft.operandNodes, id, '/operand_nodes'); if (isComputed(node) !== computed) fail('unknownProjectObject', `/operand_nodes/${id}`); return node; };
    const nodesResult = (draft, next, id) => ({ draft: { ...draft, operandNodes: next }, value: { ...next[id], id } });
    function checked(result) { if (result.blocked?.length) fail(computed ? 'definitionChangeBlocked' : 'typeChangeBlocked', '', { references: result.blocked }); if (result.errors?.length) { const error = new Error('invalidDefinition'); error.issues = result.errors; throw error; } return result.nodes; }
    return {
      list: (query = {}) => clone(Object.entries(snapshot.operandNodes).filter(([, node]) => isComputed(node) === computed && (!query.scope || nodeScope(node) === query.scope) && (!query.name || node.display_name.toLocaleLowerCase().includes(query.name.toLocaleLowerCase()))).map(([id, node]) => ({ ...node, id }))),
      get: (id) => { const node = snapshot.operandNodes[id]; return node && isComputed(node) === computed ? clone({ ...node, id }) : null; },
      create: (values = {}) => apply(`${key}.create`, (draft) => {
        const result = computed ? addComputedNode(draft.operandNodes, null, values.display_name ?? '', values.scope ?? 'application') : addOperandNode(draft.operandNodes, values.selectedId ?? null, values.node_type ?? 'value', values.display_name ?? '', values.scope ?? 'application');
        const { selectedId, ...patch } = values; result.nodes[result.id] = { ...result.nodes[result.id], ...clone(patch) }; delete result.nodes[result.id].id;
        return nodesResult(draft, result.nodes, result.id);
      }),
      update: (id, patch) => apply(`${key}.update`, (draft) => {
        const original = get(draft, id); let nodes = draft.operandNodes;
        if (!computed && patch.value_type !== undefined && patch.value_type !== original.value_type) nodes = checked(changeOperandType(nodes, draft.slots, id, patch.value_type, draft.tasks, draft.taskMacros));
        if (!computed && patch.read_only !== undefined && patch.read_only !== original.read_only) nodes = checked(changeReadOnly(nodes, draft.slots, id, patch.read_only, draft.taskMacros, draft.tasks));
        const { id: ignored, ...values } = patch;
        return nodesResult(draft, { ...nodes, [id]: { ...nodes[id], ...clone(values) } }, id);
      }),
      replaceNodes: (nodes) => api.replaceDraft({ ...snapshot, operandNodes: nodes }),
      unset: (id, keys) => apply(`${key}.unset`, (draft) => { const node = clone(get(draft, id)); for (const field of keys) { if (['id', 'node_type', 'source', 'scope', 'parent_id'].includes(field)) fail('protectedProjectField', `/operand_nodes/${id}/${field}`); delete node[field]; } return nodesResult(draft, { ...draft.operandNodes, [id]: node }, id); }),
      duplicate: (id) => apply(`${key}.duplicate`, (draft) => { get(draft, id); const result = duplicateOperandSubtree(draft.operandNodes, id); return nodesResult(draft, result.nodes, result.id); }),
      remove: (id) => apply(`${key}.remove`, (draft) => { get(draft, id); return { draft: { ...draft, operandNodes: deleteOperandNode(draft.operandNodes, draft.slots, id, draft.taskMacros, draft.tasks) }, value: { id } }; }),
      references: (id) => { get(snapshot, id); return clone([...subtreeReferences(snapshot.operandNodes, snapshot.slots, id, snapshot.taskMacros, snapshot.tasks), ...slotReleaseReferences(snapshot, subtreeIds(snapshot.operandNodes, id))]); },
      move: (id, parentId, position) => apply(`${key}.move`, (draft) => { get(draft, id); return nodesResult(draft, moveOperandNode(draft.operandNodes, id, parentId, position), id); }),
      setDefinition: (id, definition, valueType) => apply(`${key}.setDefinition`, (draft) => { get(draft, id); return nodesResult(draft, checked(applyComputedDefinition(draft.operandNodes, draft.slots, id, definition, draft.tasks, draft.taskMacros, valueType)), id); }),
    };
  }
  function parameters(key, id) {
    const macro = key === 'taskMacros';
    return {
      add: (name) => apply(`${key}.parameters.add`, (draft) => { const owner = requireItem(draft[key], id, `/${key}`), p = createParameter(name); return { draft: { ...draft, [key]: patchItem(draft[key], id, { parameters: [...owner.parameters, p] }) }, value: p }; }),
      update: (parameterId, patch) => apply(`${key}.parameters.update`, (draft) => {
        patch = typeof patch === 'string' ? { type: patch } : patch;
        if (patch.id !== undefined && patch.id !== parameterId) fail('protectedProjectField', `/${key}/${id}/parameters/${parameterId}/id`);
        const owner = requireItem(draft[key], id, `/${key}`); requireItem(owner.parameters, parameterId, `/${key}/${id}/parameters`);
        const result = (macro ? changeMacroParameterType : changeParameterType)(draft, id, parameterId, patch);
        if (result.blocked.length) fail(macro ? 'macroChangeBlocked' : 'parameterTypeBlocked', '', { references: result.blocked });
        const next = result.draft, original = next[key].find((item) => item.id === id);
        const parameters = patchItem(original.parameters, parameterId, patch);
        return { draft: { ...next, [key]: patchItem(next[key], id, { parameters }) }, value: parameters.find((p) => p.id === parameterId) };
      }),
      remove: (parameterId) => apply(`${key}.parameters.remove`, (draft) => { const owner = requireItem(draft[key], id, `/${key}`); requireItem(owner.parameters, parameterId, `/${key}/${id}/parameters`); return { draft: (macro ? deleteMacroParameter : deleteParameter)(draft, id, parameterId), value: { id: parameterId } }; }),
      move: (index, offset) => apply(`${key}.parameters.move`, (draft) => { const owner = requireItem(draft[key], id, `/${key}`); return { draft: { ...draft, [key]: patchItem(draft[key], id, { parameters: moveItem(owner.parameters, index, offset) }) } }; }),
      references: (parameterId) => macro ? clone(macroParameterReferences(requireItem(snapshot[key], id, `/${key}`), parameterId)) : clone(taskUses(snapshot.slots, id, snapshot.taskMacros)),
    };
  }
  function sequenceAction(name, id, transform) {
    return apply(`sequences.${name}`, (draft) => { const sequence = requireItem(draft.sequences, id, '/sequences'), next = transform(draft, sequence); const errors = sequenceRepeatErrors(next); if (errors.length) fail(errors[0].key, errors[0].path); return { draft: { ...draft, sequences: patchItem(draft.sequences, id, next) }, value: next }; });
  }
  const api = {
    getSnapshot: () => snapshot,
    getRevision: () => revision,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getMode: () => currentMode,
    setMode: (next) => { if (batching) fail('protectedProjectField', '/mode'); if (!['user', 'environment', 'simulation', 'all'].includes(next)) throw new Error('invalidProjectMode'); currentMode = next; },
    validate: () => ({ errors: validationErrors(snapshot), warnings: warnings(snapshot) }),
    changes: () => clone(changes),
    replaceDraft: (next) => apply('project.replaceDraft', () => ({ draft: next })),
    loadDocument: (data) => {
      const errors = validateDocument(data); if (errors.length) return result(false, null, errors);
      if (batching) return apply('project.loadDocument', () => ({ draft: projectToDraft(data) }));
      snapshot = freeze(projectToDraft(data)); changes = []; revision++; publish(); return result(true);
    },
    reset: (draft = createProject()) => { if (batching) return apply('project.reset', () => ({ draft })); const errors = validation === 'strict' ? validationErrors(draft) : []; if (errors.length) return result(false, null, errors); snapshot = freeze(normalizeSymbols(draft)); changes = []; revision++; publish(); return result(true); },
    toDocument: () => compileProject(snapshot),
    exportRuntime: () => compileRuntime(snapshot, t),
    exportEnvironment: () => compileEnvironment(snapshot),
    exportReport: (options = {}) => compileReport(snapshot, { ...options, t }),
    exportBlueprint: () => exportBlueprint(snapshot),
    importBlueprint: (text) => {
      const compiled = importBlueprint(text);
      return compiled.errors.length ? result(false, null, compiled.errors) : api.loadDocument(compiled.data);
    },
    transaction: (callback, { validate = true } = {}) => {
      if (batching) { const errors = [issue('nestedProjectTransaction')]; failures.push(...errors); return result(false, null, errors); }
      if (callback.constructor?.name === 'AsyncFunction') return result(false, null, [issue('asyncProjectTransaction')]);
      const original = snapshot, originalChanges = changes.length; batching = true; failures = [];
      let value;
      try { value = callback(api); if (value && typeof value.then === 'function') fail('asyncProjectTransaction'); }
      catch (error) { failures.push(...(error.issues ?? [issue(error.message)])); }
      let errors;
      try { errors = [...failures, ...transitionErrors(original, snapshot, currentMode), ...(validate ? validationErrors(snapshot) : [])]; }
      catch (error) { errors = [issue('invalidProjectStructure', '', { detail: error.message })]; }
      batching = false;
      if (errors.length) { snapshot = original; changes.length = originalChanges; return result(false, null, errors); }
      if (!equal(original, snapshot)) { revision++; publish(); }
      return result(true, value);
    },
    settings: {
      get: () => clone(snapshot.project),
      update: (patch) => apply('settings.update', (draft) => {
        if (patch.settings?.slots_per_day !== undefined && patch.settings.slots_per_day !== draft.project.settings.slots_per_day && (draft.days.length || draft.environment)) fail('settingsLocked', '/project/settings/slots_per_day');
        return { draft: { ...draft, project: { ...draft.project, ...clone(patch) } } };
      }),
    },
    environment: {
      previewImport: (data) => prepareEnvironmentImport(snapshot, data),
      update: (environment, count) => apply('environment.update', (draft) => { if (count !== draft.project.settings.slots_per_day && draft.days.length) fail('settingsLocked'); return { draft: { ...draft, environment: clone(environment), project: { ...draft.project, settings: { slots_per_day: count } } } }; }),
      import: (data) => apply('environment.import', (draft) => { if (!['environment', 'all'].includes(currentMode)) fail('projectModeLocked', '/environment'); const result = prepareEnvironmentImport(draft, data); if (result.errors.length) { const error = new Error('environmentImportInvalid'); error.issues = result.errors; throw error; } return { draft: result.draft }; }, 'all'),
    },
  };
  api.slots = collection('slots', (d, name) => createSlot(d.slots, name), (d, item) => duplicateSlot(d.slots, item), deleteSlotAndReferences);
  api.slots.newDraft = (name) => createSlot(snapshot.slots, name);
  api.slots.duplicateDraft = (id) => duplicateSlot(snapshot.slots, requireItem(snapshot.slots, id, '/slots'));
  api.slots.references = (id) => referenceCount(snapshot, id);
  api.days = collection('days', createDay, duplicateDay, deleteSharedDay);
  api.days.uses = (id) => { const uses = dayUses(snapshot); return id === undefined ? uses : uses[id] ?? null; };
  const listDays = api.days.list;
  api.days.list = (query = {}) => { const uses = dayUses(snapshot); return listDays(query).filter((day) => matchesDayUse(uses[day.id], query.use)); };
  api.days.references = (id) => ({ reservations: clone(scheduledDayReferences(snapshot, id)), weeks: dayReferenceCount(snapshot, id), overrides: dayOverrideReferenceCount(snapshot, id), countFilters: clone(countDayReferences(snapshot, id)), events: clone(eventCatalog(snapshot).filter((event) => eventDayIds(event).includes(id))) });
  api.days.assignSlot = (id, index, slotId, editedSlot = null) => apply('days.assignSlot', (draft) => ({ draft: editedSlot ? applySlotEdit(draft, editedSlot, id, index) : assignCell(draft, id, index, slotId) }));
  api.weeks = collection('weeks', createWeek, duplicateWeek, deleteWeek);
  api.weeks.references = (id) => weekSequenceReferenceCount(snapshot, id);
  api.weeks.assignDay = (id, weekday, dayId) => apply('weeks.assignDay', (draft) => ({ draft: setWeekDay(draft, id, weekday, dayId) }));
  api.weeks.assignSlot = (id, weekday, index, slotId, editedSlot = null) => apply('weeks.assignSlot', (draft) => ({ draft: changeWeekCell(draft, id, weekday, index, slotId, editedSlot) }));
  api.sequences = collection('sequences', createSequence, duplicateSequence, (d, id) => ({ ...d, sequences: d.sequences.filter((s) => s.id !== id) }));
  api.sequences.appendWeek = (id, weekId) => sequenceAction('appendWeek', id, (d, s) => addSequenceRow(d, s, weekId));
  api.sequences.replaceWeek = (id, rowId, weekId) => sequenceAction('replaceWeek', id, (d, s) => replaceSequenceWeek(d, s, rowId, weekId));
  api.sequences.moveWeek = (id, rowId, offset) => sequenceAction('moveWeek', id, (d, s) => moveSequenceRow(s, rowId, offset));
  api.sequences.duplicateWeek = (id, rowId) => sequenceAction('duplicateWeek', id, (d, s) => duplicateSequenceRow(s, rowId));
  api.sequences.removeWeek = (id, rowId) => sequenceAction('removeWeek', id, (d, s) => removeSequenceRow(s, rowId));
  api.sequences.setOverride = (id, rowId, weekday, dayId) => sequenceAction('setOverride', id, (d, s) => setSequenceOverride(d, s, rowId, weekday, dayId));
  api.sequences.setRepeat = (id, rowId, count) => sequenceAction('setRepeat', id, (d, s) => setSequenceRepeat(s, rowId, count));
  api.sequences.setBoundary = (id, boundary, weekday) => sequenceAction('setBoundary', id, (d, s) => setSequenceBoundary(s, boundary, weekday));
  api.sequences.events = (id) => {
    function edit(name, transform, pick = (groups, sequence) => sequence) {
      return apply(`sequences.events.${name}`, (draft) => {
        const sequence = requireItem(draft.sequences, id, '/sequences');
        const groups = transform(sequence.eventGroups ?? [], sequence, draft), next = { ...sequence, eventGroups: groups };
        return { draft: { ...draft, sequences: patchItem(draft.sequences, id, next) }, value: pick(groups, next) };
      });
    }
    return {
      list: () => clone(requireItem(snapshot.sequences, id, '/sequences').eventGroups ?? []),
      get: (eventId) => clone((requireItem(snapshot.sequences, id, '/sequences').eventGroups ?? []).find((g) => g.id === eventId) ?? null),
      newDraft: (position) => newEventGroup(requireItem(snapshot.sequences, id, '/sequences'), position),
      create: (values, position) => edit('create', (groups, sequence) => [...groups, { ...newEventGroup(sequence, position), ...clone(values) }], (groups) => groups.at(-1)),
      update: (eventId, patch) => edit('update', (groups) => { requireItem(groups, eventId, `/sequences/${id}/events`); return patchItem(groups, eventId, patch); }, (groups) => groups.find((g) => g.id === eventId)),
      replace: (groups) => edit('replace', () => clone(groups)),
      remove: (eventId) => edit('remove', (groups) => { requireItem(groups, eventId, `/sequences/${id}/events`); return groups.filter((g) => g.id !== eventId); }, () => ({ id: eventId })),
      duplicate: (eventId) => edit('duplicate', (groups, s, draft) => [...groups, duplicateEventGroup(requireItem(groups, eventId, `/sequences/${id}/events`), draft.days)], (groups) => groups.at(-1)),
      references: (eventId) => clone(eventReferencesTo(snapshot, [eventId])),
      moveStart: (eventId, date) => edit('moveStart', (groups) => patchItem(groups, eventId, changeEventStart(requireItem(groups, eventId, `/sequences/${id}/events`), date))),
      normalized: (groups) => groups.map((group) => ({ ...clone(group), display_name: eventGroupName(group, snapshot.days) })),
      duplicateDraft: (group) => duplicateEventGroup(group, snapshot.days),
      moveStartDraft: (group, date) => changeEventStart(group, date),
      changeKindDraft: (group, kind, saved) => ({ ...clone(group), ...clone(saved ?? {}), kind, executionMode: group.executionMode ?? 'overlay', id: group.id, icon: group.icon, description: group.description, display_name: group.display_name, symbol: group.symbol, dayId: group.dayId, sourceMode: group.sourceMode, dayCandidates: clone(group.dayCandidates), priority: group.priority, start: clone(group.start), end: kind === 'once' ? clone(group.start) : saved?.end ?? positionDate(Math.max(datePosition(group.start), sequenceRange(requireItem(snapshot.sequences, id, '/sequences')).end)), interval: kind === 'once' ? 0 : saved?.interval || 1, countFilter: saved?.countFilter ?? { kind: 'all' }, ...(kind === 'probability' ? { probability_percent: saved?.probability_percent ?? 10, cooldown_days: saved?.cooldown_days ?? 7 } : {}) }),
    };
  };
  api.variables = nodeCollection(); api.expressions = nodeCollection(true);
  api.variables.addProgress = () => apply('variables.addProgress', (draft) => ({ draft: { ...draft, operandNodes: addProgressDefinitions(draft.operandNodes, draft.project.settings.slots_per_day, t) } }));
  api.tasks = collection('tasks', (d, name) => createTask(name), (d, item) => duplicateTask(item), deleteTask);
  api.tasks.references = (id) => clone(taskUses(snapshot.slots, id, snapshot.taskMacros));
  api.tasks.parameters = (id) => parameters('tasks', id);
  api.tasks.builtins = {
    list: () => builtinTaskDefinitions(snapshot.builtinTasks, t),
    update: (id, patch) => apply('tasks.builtins.update', (draft) => {
      const current = requireItem(builtinTaskDefinitions(draft.builtinTasks, t), id, '/builtin_tasks');
      const structural = (parameters) => parameters.map(({ display_name, symbol, description, ...p }) => p);
      if (patch.parameters && !equal(structural(current.parameters), structural(patch.parameters))) fail('protectedProjectField', `/builtin_tasks/${id}/parameters`);
      return { draft: { ...draft, builtinTasks: changeBuiltinDefinition(draft.builtinTasks, current, { ...current, ...clone(patch) }) } };
    }),
  };
  api.taskMacros = collection('taskMacros', (d, name) => createTaskMacro(name), (d, item) => duplicateTaskMacro(item), deleteTaskMacro);
  api.taskMacros.references = (id) => clone(macroUses(snapshot.slots, id, snapshot.taskMacros));
  api.taskMacros.parameters = (id) => parameters('taskMacros', id);
  api.taskMacros.setMode = (id, nextMode) => apply('taskMacros.setMode', (draft) => { requireItem(draft.taskMacros, id, '/task_macros'); const result = changeMacroMode(draft, id, nextMode); if (result.blocked.length) fail('macroChangeBlocked', '', { references: result.blocked }); return { draft: result.draft }; });
  api.taskMacros.moveEntry = (id, key, index, offset) => apply('taskMacros.moveEntry', (draft) => {
    if (!['parameters', 'steps', 'branches', 'candidates'].includes(key)) fail('protectedProjectField');
    const macro = requireItem(draft.taskMacros, id, '/task_macros');
    return { draft: { ...draft, taskMacros: patchItem(draft.taskMacros, id, { [key]: moveItem(macro[key], index, offset) }) } };
  });
  api.taskMacros.addStep = (id) => apply('taskMacros.addStep', (draft) => { const macro = requireItem(draft.taskMacros, id, '/task_macros'), step = createTaskStep(); return { draft: { ...draft, taskMacros: patchItem(draft.taskMacros, id, { steps: [...macro.steps, step] }) }, value: step }; });
  api.taskMacros.duplicateStep = (id, index) => apply('taskMacros.duplicateStep', (draft) => { const macro = requireItem(draft.taskMacros, id, '/task_macros'); if (!macro.steps?.[index]) fail('invalidOrder'); const step = clone(macro.steps[index]); step.id = crypto.randomUUID(); const steps = [...macro.steps]; steps.splice(index + 1, 0, step); return { draft: { ...draft, taskMacros: patchItem(draft.taskMacros, id, { steps }) }, value: step }; });
  api.enums = {
    list: (query = {}) => clone(Object.entries(snapshot.enumNodes ?? {}).filter(([, node]) => !query.scope || enumScope(node) === query.scope).map(([id, node]) => ({ ...node, id }))),
    get: (id) => snapshot.enumNodes?.[id] ? clone({ ...snapshot.enumNodes[id], id }) : null,
    replaceNodes: (nodes) => apply('enums.replaceNodes', (draft) => ({ draft: { ...draft, enumNodes: clone(nodes) } })),
    create: (values) => apply('enums.create', (draft) => { const result = addEnumNode(draft.enumNodes ?? {}, values.selectedId, values.node_type ?? 'enum', values.display_name ?? '', values.scope ?? 'application'); const { selectedId, ...patch } = values; result.nodes[result.id] = { ...result.nodes[result.id], ...clone(patch) }; delete result.nodes[result.id].id; return { draft: { ...draft, enumNodes: result.nodes }, value: { ...result.nodes[result.id], id: result.id } }; }),
    update: (id, patch) => apply('enums.update', (draft) => { const node = requireItem(draft.enumNodes, id, '/enum_definitions'); const { id: ignored, ...values } = patch; return { draft: { ...draft, enumNodes: { ...draft.enumNodes, [id]: { ...node, ...clone(values) } } } }; }),
    move: (id, parentId, position) => apply('enums.move', (draft) => ({ draft: { ...draft, enumNodes: moveEnumNode(draft.enumNodes, id, parentId, position) } })),
    duplicate: (id) => apply('enums.duplicate', (draft) => { requireItem(draft.enumNodes, id, '/enum_definitions'); const result = duplicateEnumSubtree(draft.enumNodes, id); return { draft: { ...draft, enumNodes: result.nodes }, value: { id: result.id } }; }),
    remove: (id) => apply('enums.remove', (draft) => { requireItem(draft.enumNodes, id, '/enum_definitions'); const ids = enumSubtree(draft.enumNodes, id); return { draft: { ...draft, enumNodes: Object.fromEntries(Object.entries(draft.enumNodes).filter(([key]) => !ids.has(key))) }, value: { id } }; }),
    references: (id) => { const ids = enumSubtree(snapshot.enumNodes, id); return clone(enumReferences(snapshot).filter((ref) => ids.has(ref.id))); },
  };
  return api;
}

// GUI working-copy adapter: field-level errors are allowed until Apply/export.
// All project data still goes through the live session's mode and reference guards.
export const editProject = (draft, t) => createProjectSession(draft, { mode: 'all', validation: 'draft', t });
export { createProjectWithEnvironment };
