import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { probabilityEnumContract } from '../src/core/enumParameters.js';
import { createTaskMacro, createTaskStep } from '../src/core/taskMacroModel.js';
import { translator } from '../src/i18n/index.js';
export const constant = (value) => ({ type: 'constant', value });
export const parameterRef = (parameter) => ({ type: 'parameter_reference', parameter_id: parameter.id });
export function enumFixture() {
  const f = sequenceEventsFixture();
  const property = { id: crypto.randomUUID(), display_name: 'Property input', ...probabilityEnumContract('property', translator('en')) }, operation = { id: crypto.randomUUID(), display_name: 'Operation input', ...probabilityEnumContract('operation', translator('en')) };
  const amount = { id: crypto.randomUUID(), display_name: 'Amount', type: 'number' };
  const macro = { ...createTaskMacro('Adjust event settings'), parameters: [property, operation, amount], steps: [{ ...createTaskStep(), task: { builtin: 'adjust_probability_event', event: { type: 'current_event_reference' }, property: parameterRef(property), operation: parameterRef(operation), value: parameterRef(amount) } }] };
  f.activity.branches = [{ condition: null, task: { task_macro_id: macro.id, arguments: { [property.id]: constant('probability_percent'), [operation.id]: constant('increase'), [amount.id]: constant(5) } } }];
  f.draft.taskMacros = [macro];
  f.draft.builtinTasks = { adjust_probability_event: { engine_key: 'events.adjust' } };
  const group = { ...rule(f.sequence, f.eventDay.id), kind: 'probability', display_name: 'Cold', probability_percent: 10, cooldown_days: 7 };
  f.sequence.eventGroups = [group];
  return { ...f, macro, property, operation, amount, group };
}
