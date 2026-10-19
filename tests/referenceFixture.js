import { createActionSlot as createSlot } from './slotFixture.js';
import { createProject, createDay } from '../src/core/model.js';
import { addOperandNode } from '../src/core/operandModel.js';
import { createTask, createParameter } from '../src/core/taskModel.js';
import { createTaskMacro } from '../src/core/taskMacroModel.js';
import { createEnvironmentInfo } from '../src/core/environmentModel.js';

export function referenceFixture() {
  const draft = createProject(); draft.environment = createEnvironmentInfo('Reference environment');
  let result = addOperandNode({}, null, 'group', 'Engine', 'environment');
  const root = result.id;
  const add = (parent, name, scope = 'environment') => { result = addOperandNode(result.nodes, parent, 'value', name, scope); return result.id; };
  const counter = add(root, 'counter'), limit = add(root, 'limit'), text = add(root, 'text'), local = add(null, 'Local counter', 'application');
  result.nodes[counter].engine_key = 'counter'; result.nodes[limit].read_only = true; result.nodes[text].value_type = 'string'; result.nodes[text].initial_value = ''; result.nodes[text].engine_key = 'text'; result.nodes[limit].engine_key = 'limit';
  draft.operandNodes = result.nodes;
  const task = createTask('Increment variable'); task.engine_key = 'increment_variable';
  const target = { ...createParameter('Target'), type: 'variable_reference', value_type: 'number', access: 'read_write' }, amount = createParameter('Amount');
  task.parameters = [target, amount]; draft.tasks = [task];
  const macro = createTaskMacro('Increase counter');
  const macroTarget = { ...target, id: crypto.randomUUID(), display_name: 'Counter reference' }, macroAmount = { ...amount, id: crypto.randomUUID() };
  macro.parameters = [macroTarget, macroAmount];
  macro.steps = [{ id: crypto.randomUUID(), task: { task_id: task.id, arguments: { [target.id]: { type: 'parameter_reference', parameter_id: macroTarget.id }, [amount.id]: { type: 'parameter_reference', parameter_id: macroAmount.id } } } }];
  draft.taskMacros = [macro];
  const slot = createSlot([], 'Increment engine counter'); slot.branches[0].task = { task_id: task.id, arguments: { [target.id]: { type: 'variable_reference', reference_id: counter }, [amount.id]: { type: 'constant', value: 1 } } };
  const macroSlot = createSlot([slot], 'Increment local counter'); macroSlot.branches[0].task = { task_macro_id: macro.id, arguments: { [macroTarget.id]: { type: 'variable_reference', reference_id: local }, [macroAmount.id]: { type: 'constant', value: 2 } } };
  draft.slots = [slot, macroSlot];
  const day = createDay(draft, 'Day'); day.slotIds[0] = slot.id; day.slotIds[1] = macroSlot.id; draft.days = [day];
  return { draft, task, target, amount, macro, macroTarget, slot, macroSlot, counter, limit, text, local };
}
