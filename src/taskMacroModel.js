import { updateParameterContract } from './parameterModel.js';
import { clearEngineKey } from './engineKeyModel.js';
import { branchOrderErrors, macroEntries, operandAt, argumentErrors, referencesIn, taskMacroContentErrors, taskOperandRoots } from './operandModel.js';
import { taskDefinitionErrors } from './taskModel.js';

export const createMacroBranch = () => ({ uid: crypto.randomUUID(), condition: null, task: { task_id: '', arguments: {} } });
export const createTaskMacro = (name, mode = 'sequence') => ({ id: crypto.randomUUID(), display_name: name, parameters: [], mode, ...(mode === 'branch' ? { branches: [createMacroBranch()] } : { steps: [] }) });
export const createTaskStep = () => ({ id: crypto.randomUUID(), task: { task_id: '', arguments: {} } });
export const macroToData = ({ id, ...macro }) => macro.mode === 'branch' ? { ...structuredClone(macro), branches: macro.branches.map(({ condition, task }) => structuredClone({ condition, task })) } : structuredClone(macro);
export const macroFromData = (id, macro) => ({ ...structuredClone(macro), id, ...(macro.mode === 'branch' ? { branches: macro.branches.map((branch) => ({ ...structuredClone(branch), uid: crypto.randomUUID() })) } : {}) });

export function macroUses(slots, id, macros = []) {
  return [...slots.flatMap((slot) => slot.branches.flatMap((branch, index) => branch.task?.task_macro_id === id ? [{ slot: slot.name, branch: index + 1, path: `/slots/${slot.id}/branches/${index}/task`, task: branch.task }] : [])),
    ...macros.flatMap((macro) => macroEntries(macro).flatMap(({ entry, path, index }) => entry.task?.task_macro_id === id ? [{ slot: macro.display_name, ownerId: macro.id, branch: index + 1, scope: macro.parameters, path: `${path}/task`, task: entry.task }] : []))];
}
export function macroParameterReferences(macro, id) {
  return macroEntries(macro).flatMap(({ entry, path }) => [...referencesIn(entry.condition, `${path}/condition`, 'parameter_reference'), ...taskOperandRoots(entry.task, `${path}/task`).flatMap((root) => referencesIn(root.value, root.path, 'parameter_reference'))]).filter((ref) => ref.nodeId === id);
}
export function taskMacroDefinitionErrors(macros = []) {
  const errors = taskDefinitionErrors(macros).map((error) => ({ ...error, path: error.path.replace('/tasks/', '/task_macros/') }));
  for (const macro of macros) {
    const path = `/task_macros/${macro.id}`;
    if (!['sequence', 'branch'].includes(macro.mode)) errors.push({ path: `${path}/mode`, key: 'invalidMacroMode' });
    if (macro.mode === 'branch' && !(Array.isArray(macro.branches) && macro.branches.length === 0)) errors.push(...branchOrderErrors(macro.branches, `${path}/branches`));
    else if (macro.mode === 'sequence') {
      const seen = new Set();
      if (!Array.isArray(macro.steps)) errors.push({ path: `${path}/steps`, key: 'invalidTaskSteps' });
      for (const [index, step] of (Array.isArray(macro.steps) ? macro.steps : []).entries()) {
        if (seen.has(step?.id)) errors.push({ path: `${path}/steps/${index}/id`, key: 'duplicateStep' }); seen.add(step?.id);
      }
    }
  }
  return errors;
}
export function duplicateTaskMacro(macro) {
  const next = clearEngineKey(macro), mapping = new Map(macro.parameters.map((p) => [p.id, crypto.randomUUID()]));
  next.id = crypto.randomUUID(); next.display_name += ' (副本)'; next.parameters.forEach((p) => { p.id = mapping.get(p.id); });
  for (const { entry } of macroEntries(next)) {
    if (next.mode === 'sequence') entry.id = crypto.randomUUID(); else entry.uid = crypto.randomUUID();
    for (const value of [entry.condition, ...taskOperandRoots(entry.task).map((root) => root.value)]) for (const ref of referencesIn(value, '', 'parameter_reference')) if (mapping.has(ref.nodeId)) operandAt(value, ref.path.split('/').filter(Boolean)).parameter_id = mapping.get(ref.nodeId);
  }
  return next;
}
export function deleteTaskMacro(draft, id) {
  if (macroUses(draft.slots, id, draft.taskMacros).length) throw new Error('taskMacroInUse');
  return { ...draft, taskMacros: draft.taskMacros.filter((macro) => macro.id !== id) };
}
export function changeMacroMode(draft, id, mode) {
  if (!['sequence', 'branch'].includes(mode)) throw new Error('invalidMacroMode');
  const macro = draft.taskMacros.find((item) => item.id === id);
  if (macro.mode === mode) return { draft, blocked: [] };
  const blocked = mode === 'branch' ? macroUses(draft.slots, id, draft.taskMacros).filter((use) => use.ownerId) : [];
  if (blocked.length) return { draft, blocked };
  const { steps, branches, ...base } = macro;
  const next = { ...base, mode, ...(mode === 'branch' ? { branches: [createMacroBranch()] } : { steps: [] }) };
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
  return { ...draft, taskMacros: draft.taskMacros.map((item) => ({ ...item, ...(item.id === macroId ? { parameters: item.parameters.filter((p) => p.id !== parameterId) } : {}), ...(item.mode === 'branch' ? { branches: item.branches.map(clear) } : {}) })),
    slots: draft.slots.map((slot) => ({ ...slot, branches: slot.branches.map(clear) })) };
}
