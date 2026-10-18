import { updateParameterContract } from './parameterModel.js';
import { clearEngineKey } from './engineKeyModel.js';
import { branchOrderErrors, macroEntries, mapMacroEntries, slotEntries, mapSlotEntries, TASK_MACRO_MODES, allowedMacroModes, operandAt, argumentErrors, referencesIn, taskMacroContentErrors, taskOperandRoots } from './operandModel.js';
import { taskDefinitionErrors } from './taskModel.js';

export const createMacroBranch = () => ({ uid: crypto.randomUUID(), condition: null, task: { task_id: '', arguments: {} } });
const modeContent = (mode) => mode === 'branch' ? { branches: [createMacroBranch()] } : mode === 'priority' ? { candidates: [] } : { steps: [] };
export function createTaskMacro(name, mode = 'sequence') {
  if (!TASK_MACRO_MODES.includes(mode)) throw new Error('invalidMacroMode');
  return { id: crypto.randomUUID(), display_name: name, parameters: [], mode, ...modeContent(mode) };
}
export const createTaskStep = () => ({ id: crypto.randomUUID(), task: { task_id: '', arguments: {} } });
export const createCandidate = () => ({ id: crypto.randomUUID(), task: { task_macro_id: '', arguments: {} } });
export function normalizeTaskMacro(macro) {
  if (macro.mode !== 'conditional') return macro;
  const { condition, task, ...base } = structuredClone(macro);
  return { ...base, mode: 'sequence', eligibility: condition, steps: [{ id: crypto.randomUUID(), task }] };
}
export function macroToData(value) {
  const { id, ...macro } = normalizeTaskMacro(value);
  return macro.mode === 'branch' ? { ...structuredClone(macro), branches: macro.branches.map(({ condition, task }) => structuredClone({ condition, task })) } : structuredClone(macro);
}
export function macroFromData(id, value) {
  const macro = normalizeTaskMacro(value);
  return { ...structuredClone(macro), id, ...(macro.mode === 'branch' ? { branches: macro.branches.map((branch) => ({ ...structuredClone(branch), uid: crypto.randomUUID() })) } : {}) };
}

export function macroUses(slots, id, macros = []) {
  return [...slots.flatMap((slot) => slotEntries(slot).flatMap(({ entry: branch, index, path }) => branch.task?.task_macro_id === id ? [{ slot: slot.name, branch: index + 1, path: `${path}/task`, task: branch.task }] : [])),
    ...macros.flatMap((macro) => macroEntries(macro).flatMap(({ entry, path, index }) => entry.task?.task_macro_id === id ? [{ slot: macro.display_name, ownerId: macro.id, allowedModes: allowedMacroModes(macro.mode), branch: index + 1, scope: macro.parameters, path: `${path}/task`, task: entry.task }] : []))];
}
export function macroParameterReferences(macro, id) {
  return [...referencesIn(macro.eligibility, `/task_macros/${macro.id}/eligibility`, 'parameter_reference'), ...macroEntries(macro).flatMap(({ entry, path }) => [...referencesIn(entry.condition, `${path}/condition`, 'parameter_reference'), ...taskOperandRoots(entry.task, `${path}/task`).flatMap((root) => referencesIn(root.value, root.path, 'parameter_reference'))])].filter((ref) => ref.nodeId === id);
}
export function taskMacroDefinitionErrors(macros = []) {
  const errors = taskDefinitionErrors(macros).map((error) => ({ ...error, path: error.path.replace('/tasks/', '/task_macros/') }));
  for (const macro of macros) {
    const path = `/task_macros/${macro.id}`;
    if (![...TASK_MACRO_MODES, 'conditional'].includes(macro.mode)) errors.push({ path: `${path}/mode`, key: 'invalidMacroMode' });
    if (macro.mode === 'branch' && !(Array.isArray(macro.branches) && macro.branches.length === 0)) errors.push(...branchOrderErrors(macro.branches, `${path}/branches`));
    else if (['sequence', 'priority'].includes(macro.mode)) {
      const key = macro.mode === 'priority' ? 'candidates' : 'steps';
      const seen = new Set();
      if (!Array.isArray(macro[key])) errors.push({ path: `${path}/${key}`, key: 'invalidTaskSteps' });
      for (const [index, step] of (Array.isArray(macro[key]) ? macro[key] : []).entries()) {
        if (seen.has(step?.id)) errors.push({ path: `${path}/${key}/${index}/id`, key: 'duplicateStep' }); seen.add(step?.id);
      }
    }
  }
  const byId = new Map(macros.map((macro) => [macro.id, macro])), colors = new Map();
  for (const macro of macros) {
    if (colors.has(macro.id)) continue;
    const stack = [{ id: macro.id, index: 0 }]; colors.set(macro.id, 1);
    while (stack.length) {
      const frame = stack.at(-1), links = macroEntries(byId.get(frame.id));
      if (frame.index === links.length) { colors.set(frame.id, 2); stack.pop(); continue; }
      const link = links[frame.index++], target = link.entry.task?.task_macro_id;
      if (!byId.has(target)) continue;
      if (colors.get(target) === 1) errors.push({ path: `${link.path}/task/task_macro_id`, key: 'taskMacroCycle' });
      else if (!colors.has(target)) { colors.set(target, 1); stack.push({ id: target, index: 0 }); }
    }
  }
  return errors;
}
export function duplicateTaskMacro(macro) {
  const next = clearEngineKey(macro), mapping = new Map(macro.parameters.map((p) => [p.id, crypto.randomUUID()]));
  next.id = crypto.randomUUID(); next.display_name += ' (副本)'; next.parameters.forEach((p) => { p.id = mapping.get(p.id); });
  for (const ref of referencesIn(next.eligibility, '', 'parameter_reference')) if (mapping.has(ref.nodeId)) operandAt(next.eligibility, ref.path.split('/').filter(Boolean)).parameter_id = mapping.get(ref.nodeId);
  for (const { entry } of macroEntries(next)) {
    if (['sequence', 'priority'].includes(next.mode)) entry.id = crypto.randomUUID(); else if (next.mode === 'branch') entry.uid = crypto.randomUUID();
    for (const value of [entry.condition, ...taskOperandRoots(entry.task).map((root) => root.value)]) for (const ref of referencesIn(value, '', 'parameter_reference')) if (mapping.has(ref.nodeId)) operandAt(value, ref.path.split('/').filter(Boolean)).parameter_id = mapping.get(ref.nodeId);
  }
  return next;
}
export function deleteTaskMacro(draft, id) {
  if (macroUses(draft.slots, id, draft.taskMacros).length) throw new Error('taskMacroInUse');
  return { ...draft, taskMacros: draft.taskMacros.filter((macro) => macro.id !== id) };
}
export function changeMacroMode(draft, id, mode) {
  if (!TASK_MACRO_MODES.includes(mode)) throw new Error('invalidMacroMode');
  const macro = draft.taskMacros.find((item) => item.id === id);
  if (macro.mode === mode) return { draft, blocked: [] };
  const blocked = macroUses(draft.slots, id, draft.taskMacros).filter((use) => use.ownerId && !use.allowedModes.includes(mode));
  if (blocked.length) return { draft, blocked };
  const { steps, branches, candidates, condition, task, ...base } = macro;
  const next = { ...base, mode, ...modeContent(mode) };
  return { draft: { ...draft, taskMacros: draft.taskMacros.map((item) => item.id === id ? next : item) }, blocked: [] };
}
export function changeMacroParameterType(draft, macroId, parameterId, change) {
  const macro = draft.taskMacros.find((item) => item.id === macroId), next = { ...macro, parameters: macro.parameters.map((p) => p.id === parameterId ? updateParameterContract(p, change) : p) };
  const macros = draft.taskMacros.map((item) => item.id === macroId ? next : item);
  const errors = taskMacroContentErrors([next], draft.tasks, draft.operandNodes, macros);
  const internal = macroParameterReferences(macro, parameterId).filter((ref) => errors.some((error) => ref.path.startsWith(error.path.replace(/\/comparator$/, ''))));
  const external = macroUses(draft.slots, macroId, macros).filter((use) => {
    const value = use.task.arguments?.[parameterId]; return value && argumentErrors(value, next.parameters.find((p) => p.id === parameterId), draft.operandNodes, '', use.scope).length;
  });
  const blocked = [...internal, ...external];
  return { blocked, draft: blocked.length ? draft : { ...draft, taskMacros: macros } };
}
export function deleteMacroParameter(draft, macroId, parameterId) {
  const macro = draft.taskMacros.find((item) => item.id === macroId);
  if (macroParameterReferences(macro, parameterId).length) throw new Error('macroParameterInUse');
  const clear = (entry) => entry.task?.task_macro_id !== macroId ? entry : { ...entry, task: { ...entry.task, arguments: Object.fromEntries(Object.entries(entry.task.arguments).filter(([id]) => id !== parameterId)) } };
  return { ...draft, taskMacros: draft.taskMacros.map((item) => ({ ...mapMacroEntries(item, clear), ...(item.id === macroId ? { parameters: item.parameters.filter((p) => p.id !== parameterId) } : {}) })),
    slots: draft.slots.map((slot) => mapSlotEntries(slot, clear)) };
}
