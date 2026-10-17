import { updateParameterContract } from './parameterModel.js';
import { clearEngineKey } from './engineKeyModel.js';
import { taskUseErrors, argumentErrors, macroEntries } from './operandModel.js';

export const taskUses = (slots, id, sequences = []) => [
  ...slots.flatMap((slot) => slot.branches.flatMap((branch, index) => branch.task?.task_id === id ? [{ slot: slot.name, branch: index + 1, path: `/slots/${slot.id}/branches/${index}/task`, task: branch.task }] : [])),
  ...sequences.flatMap((macro) => macroEntries(macro).flatMap(({ entry, path, index }) => entry.task?.task_id === id ? [{ slot: macro.display_name, ...(macro.mode === 'branch' ? { branch: index + 1 } : { step: index + 1 }), scope: macro.parameters, path: `${path}/task`, task: entry.task }] : [])),
];
export const createTask = (name) => ({ id: crypto.randomUUID(), display_name: name, parameters: [] });
export const createParameter = (name) => ({ id: crypto.randomUUID(), display_name: name, type: 'number' });
export const duplicateTask = (task) => ({ ...clearEngineKey(task), id: crypto.randomUUID(), display_name: `${task.display_name} (副本)`, parameters: task.parameters.map((parameter) => ({ ...parameter, id: crypto.randomUUID() })) });
export function taskDefinitionErrors(tasks = []) {
  const errors = [], ids = new Set();
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const path = `/tasks/${task.id}`;
    if (ids.has(task.id)) errors.push({ path, key: 'duplicateId' }); ids.add(task.id);
    if (typeof task.display_name !== 'string' || !task.display_name.trim()) errors.push({ path: `${path}/display_name`, key: 'requiredText' });
    const parameters = new Set();
    for (const p of Array.isArray(task.parameters) ? task.parameters : []) {
      if (!p || typeof p !== 'object') continue;
      if (parameters.has(p.id)) errors.push({ path: `${path}/parameters`, key: 'duplicateParameter' }); parameters.add(p.id);
      if (typeof p.display_name !== 'string' || !p.display_name.trim()) errors.push({ path: `${path}/parameters/${p.id}/display_name`, key: 'requiredText' });
    }
  }
  return errors;
}
export function changeParameterType(draft, taskId, parameterId, change) {
  const original = draft.tasks.find((task) => task.id === taskId).parameters.find((p) => p.id === parameterId);
  const parameter = updateParameterContract(original, change);
  const blocked = taskUses(draft.slots, taskId, draft.taskMacros).filter((use) => { const value = use.task.arguments?.[parameterId]; return value && argumentErrors(value, parameter, draft.operandNodes, '', use.scope).length; });
  return { blocked, draft: blocked.length ? draft : { ...draft, tasks: draft.tasks.map((task) => task.id === taskId ? { ...task, parameters: task.parameters.map((p) => p.id === parameterId ? parameter : p) } : task) } };
}
export function deleteTask(draft, id) {
  if (taskUses(draft.slots, id, draft.taskMacros).length) throw new Error('taskInUse');
  return { ...draft, tasks: draft.tasks.filter((task) => task.id !== id) };
}
export function deleteParameter(draft, taskId, parameterId) {
  return { ...draft, tasks: draft.tasks.map((task) => task.id === taskId ? { ...task, parameters: task.parameters.filter((p) => p.id !== parameterId) } : task),
    taskMacros: (draft.taskMacros ?? []).map((macro) => { const key = macro.mode === 'branch' ? 'branches' : 'steps'; return { ...macro, [key]: macro[key].map((entry) => entry.task.task_id !== taskId ? entry : { ...entry, task: { ...entry.task, arguments: Object.fromEntries(Object.entries(entry.task.arguments).filter(([id]) => id !== parameterId)) } }) }; }),
    slots: draft.slots.map((slot) => ({ ...slot, branches: slot.branches.map((branch) => branch.task?.task_id !== taskId ? branch : { ...branch, task: { ...branch.task, arguments: Object.fromEntries(Object.entries(branch.task.arguments).filter(([id]) => id !== parameterId)) } }) })) };
}
export { taskUseErrors };
