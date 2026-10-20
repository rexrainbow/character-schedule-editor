import { sequenceEventsFixture, rule } from './sequenceEventsFixture.js';
import { createDay, createSlot, assignCell } from '../src/core/model.js';
import { createTaskMacro, createTaskStep, createCandidate } from '../src/core/taskMacroModel.js';
import { createRelease } from '../src/core/builtinTaskModel.js';

export function dayUsesFixture() {
  let { draft, main, eventDay, sequence, activity } = sequenceEventsFixture();
  const extra = createDay(draft, 'Interrupt day'), override = createDay(draft, 'Override only'), unused = createDay(draft, 'Unused day');
  draft.days.push(extra, override, unused); main.tags = ['Office'];
  sequence.rows[0].overrides.tue = override.id;
  const macro = createTaskMacro('Takeover macro', 'branch'); macro.branches = [];
  const wrapper = createTaskMacro('Wrapper'); wrapper.steps = [{ ...createTaskStep(), task: { task_macro_id: macro.id, arguments: {} } }];
  const priority = createTaskMacro('Choose takeover', 'priority'); priority.candidates = [{ ...createCandidate(), task: { task_macro_id: wrapper.id, arguments: {} } }];
  draft.taskMacros = [macro, wrapper, priority];
  const slot = createSlot(draft.slots, 'Control'); slot.mode = 'priority'; slot.candidates = [{ ...createCandidate(), task: { task_macro_id: priority.id, arguments: {} } }]; draft.slots.push(slot);
  draft = assignCell(draft, extra.id, { index: 2, edge: 'end' }, slot.id);
  const groups = [main, eventDay, extra].map((day) => ({ ...rule(sequence, day.id, 0, 0, 0), display_name: `${day.name} event` }));
  groups[2].executionMode = 'interrupt_main';
  draft.sequences[0].eventGroups = groups;
  for (const [id, purposes] of [[main.id, ['main', 'overlay']], [eventDay.id, ['overlay']], [extra.id, ['interrupt']], [override.id, ['main']], [unused.id, []]]) draft.days.find((day) => day.id === id).purposes = purposes;
  return { draft, main, eventDay, extra, override, unused, macro, wrapper, priority, slot, activity, groups };
}
