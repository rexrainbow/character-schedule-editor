import { createActionSlot as createSlot } from './slotFixture.js';
import { createProject } from '../src/model.js';
import { addOperandNode } from '../src/operandModel.js';
import { createEnvironmentInfo } from '../src/environmentModel.js';
import { createTaskMacro } from '../src/taskMacroModel.js';

export function builtinVariableFixture() {
  const draft = createProject(); draft.environment = createEnvironmentInfo('Variable tasks');
  let result = addOperandNode({}, null, 'group', 'Engine');
  const root = result.id;
  const add = (name, type, scope = 'environment', readOnly = false) => {
    result = addOperandNode(result.nodes, scope === 'environment' ? root : null, 'value', name, scope);
    result.nodes[result.id] = { ...result.nodes[result.id], value_type: type, initial_value: type === 'boolean' ? true : type === 'string' ? 'Start' : 10, read_only: readOnly, engine_key: name };
    return result.id;
  };
  const number = add('Counter', 'number'), boolean = add('Enabled', 'boolean'), text = add('Message', 'string', 'application'), readonly = add('Readonly', 'number', 'environment', true);
  draft.operandNodes = result.nodes;
  draft.builtinTasks = Object.fromEntries(['increment_variable', 'toggle_variable', 'reset_variable'].map((kind) => [kind, { engine_key: 'engine.' + kind }]));
  const actions = [
    { builtin: 'increment_variable', target_variable_id: number, value: { type: 'constant', value: -2 } },
    { builtin: 'toggle_variable', target_variable_id: boolean },
    { builtin: 'reset_variable', target_variable_id: text },
  ];
  draft.slots = actions.map((task, index) => { const slot = createSlot([], 'Operation ' + (index + 1)); slot.branches[0].task = structuredClone(task); return slot; });
  const sequence = createTaskMacro('Variable operations');
  sequence.parameters = [{ id: crypto.randomUUID(), display_name: 'Delta', type: 'number' }];
  sequence.steps = actions.map((task) => ({ id: crypto.randomUUID(), task: structuredClone(task) }));
  sequence.steps[0].task.value = { type: 'parameter_reference', parameter_id: sequence.parameters[0].id };
  const branch = createTaskMacro('Reset branch', 'branch'); branch.branches[0].task = structuredClone(actions[2]);
  draft.taskMacros = [sequence, branch];
  return { draft, number, boolean, text, readonly, actions, sequence, branch };
}
