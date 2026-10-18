import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';
import { createDay, createSlot } from '../src/model.js';
import { setDayAssignment } from '../src/dayEvents.js';
import { createTaskMacro } from '../src/taskMacroModel.js';

export function flowControlFixture(kind = 'cancel_lower_priority_slot', target = { index: 0, edge: 'start' }, controller = 'High') {
  const { draft, sequence } = sequenceEventsFixture(), vars = builtinVariableFixture();
  draft.environment = vars.draft.environment;
  draft.operandNodes = vars.draft.operandNodes; draft.builtinTasks = { ...vars.draft.builtinTasks, cancel_lower_priority_slot: { engine_key: 'control.slot' }, cancel_lower_priority_day: { engine_key: 'control.day' } };
  draft.tasks = []; draft.slots = []; draft.days = []; draft.taskMacros = [];
  function slot(name, task) { const result = createSlot(draft.slots, name); result.branches = [{ condition: null, task }]; draft.slots.push(result); return result; }
  const increment = { builtin: 'increment_variable', target_variable_id: vars.number, value: { type: 'constant', value: 1 } };
  const activity = slot('Increase counter', increment);
  const macro = createTaskMacro('Control then continue');
  macro.steps = [{ id: crypto.randomUUID(), task: { builtin: kind } }, { id: crypto.randomUUID(), task: increment }]; draft.taskMacros = [macro];
  const control = slot('Override activity', { task_macro_id: macro.id, arguments: {} });
  const targets = ['dayStart', ...Array.from({ length: 3 }, (_, index) => [{ index, edge: 'start' }, index, { index, edge: 'end' }]).flat(), 'dayEnd'];
  const days = {};
  for (const name of ['High', 'Peer', 'Zero', 'Main', 'Negative', 'Lower negative']) {
    let day = createDay(draft, name); for (const item of targets) day = setDayAssignment(day, item, activity.id);
    if (name === controller) day = setDayAssignment(day, target, control.id);
    draft.days.push(day); days[name] = day;
  }
  draft.weeks[0].days.mon = days.Main.id;
  sequence.eventGroups = [['High', 10], ['Peer', 10], ['Zero', 0], ['Negative', -1], ['Lower negative', -3]].map(([name, priority]) => ({ ...rule(sequence, days[name].id, 0, 20, 1, priority), display_name: name }));
  return { draft, sequence, days, activity, control, macro, number: vars.number, increment };
}
