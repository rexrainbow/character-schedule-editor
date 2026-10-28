import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceEventsFixture } from './sequenceEventsFixture.js';
import { createScheduleEvent, scheduledPosition, scheduledDayReferences } from '../src/core/scheduledEvents.js';
import { compileProject, projectToDraft, validateDocument } from '../src/core/model.js';
import { compileRuntime } from '../src/core/runtimeModel.js';
import { simulateSequenceDay } from './reference/daySimulationModel.js';
import { simulateSlot, simulationInitialValues } from './reference/simulationModel.js';
import { builtinTaskDefinition, changeBuiltinDefinition } from '../src/core/builtinTaskModel.js';
import { createTaskMacro, duplicateTaskMacro, deleteMacroParameter, changeMacroParameterType } from '../src/core/taskMacroModel.js';
import { compileEnvironment, createEnvironmentInfo, createProjectWithEnvironment } from '../src/core/environmentModel.js';
import { editProject } from '../src/core/projectApi.js';
import { compileReport } from '../src/core/reportModel.js';
import { slotLogicText } from '../src/core/logicOverviewModel.js';
import { translator } from '../src/i18n/index.js';
import { builtinVariableFixture } from './builtinVariableFixture.js';
const t = translator('en');
function fixture() {
  const f = sequenceEventsFixture(), { draft, activity, eventDay } = f;
  const use = { ...createScheduleEvent(), display_name: 'Date night', date: { mode: 'weeks_weekday', offset: { type: 'constant', value: 1 }, weekday: 'thu' }, day_source: { mode: 'random', candidates: [{ day_schedule_id: eventDay.id, weight: 3 }, { day_schedule_id: draft.days[0].id, weight: 1 }] }, execution_mode: 'interrupt_main' };
  delete use.day_schedule_id;
  activity.branches = [{ condition: null, task: use }];
  draft.weeks[0].days.fri = eventDay.id;
  draft.builtinTasks = { schedule_event: { symbol: 'events_schedule' } };
  return { ...f, use };
}

test('reservation dates use calendar-week positions and require safe future offsets', () => {
  assert.deepEqual(scheduledPosition({ mode: 'days' }, 7, 4), { position: 11 });
  assert.deepEqual(scheduledPosition({ mode: 'weeks_weekday', weekday: 'thu' }, 1, 4), { position: 10 });
  assert.deepEqual(scheduledPosition({ mode: 'weeks_weekday', weekday: 'sun' }, 0, 4), { position: 6 });
  assert.equal(scheduledPosition({ mode: 'weeks_weekday', weekday: 'thu' }, 0, 4).error, 'scheduleFutureRequired');
  for (const n of [0, -1, .5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(scheduledPosition({ mode: 'days' }, n, 4).error, 'scheduleOffsetError');
});

test('project, runtime and environment contracts round-trip reservations and omit runtime icons', () => {
  const { draft, sequence, activity, use } = fixture();
  const project = compileProject(draft); assert.deepEqual(project.errors, []);
  assert.deepEqual(compileProject(projectToDraft(project.data)).data, project.data);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  const task = runtime.data.slots[activity.id].branches[0].task;
  assert.equal(task.flow_control, 'schedule_event'); assert.equal(task.task_key, 'events_schedule');
  assert.equal(task.icon, undefined); assert.equal(task.builtin, undefined); assert.deepEqual(task.day_source, use.day_source);
  assert.equal(runtime.data.sequences[sequence.id].event_groups, undefined);
  assert.equal(runtime.data.environment_requirements.tasks.find((item) => item.name === 'events_schedule').parameters.length, 7);
  draft.environment = createEnvironmentInfo('Engine', '1');
  const current = builtinTaskDefinition('schedule_event', draft.builtinTasks, t);
  assert.equal(current.category, 'flowControl');
  draft.builtinTasks = changeBuiltinDefinition(draft.builtinTasks, current, { ...current, display_name: 'Book appointment', parameters: current.parameters.map((p) => ({ ...p, display_name: `Custom ${p.id}` })) });
  const env = compileEnvironment(draft); assert.deepEqual(env.errors, []);
  assert.deepEqual(createProjectWithEnvironment('New project', 3, env.data).builtinTasks, draft.builtinTasks);
  draft.builtinTasks.schedule_event.symbol = ''; assert.ok(compileRuntime(draft).errors.some((e) => e.key === 'invalidSymbol'));
});

test('a day simulation creates independent one-time instances without drawing candidates or modifying the project', () => {
  const { draft, sequence, use, activity } = fixture();
  const original = structuredClone(draft);
  const result = simulateSequenceDay(draft, sequence.id, 4);
  assert.deepEqual(result.errors, []); assert.equal(result.reservations.length, 1);
  const booking = result.reservations[0];
  assert.deepEqual(booking.start, { week_number: 2, weekday: 'thu' });
  assert.equal(booking.kind, 'once'); assert.equal(booking.sequence_id, sequence.id); assert.deepEqual(booking.day_source, use.day_source);
  assert.equal(booking.execution_mode, 'interrupt_main'); assert.equal(booking.target_position, 10); assert.ok(booking.source_path.includes(activity.id));
  assert.equal(booking.day_schedule_id, undefined); assert.equal(booking.created_at.position, 4);
  assert.deepEqual(draft, original);
  const another = simulateSequenceDay(draft, sequence.id, 4); assert.notEqual(another.reservations[0].id, booking.id);
  assert.equal(result.calls.length, 1); // The future day's task is never executed now.
  assert.ok(result.trace.some((phase) => phase.children?.some((entry) => entry.children?.some((branch) => branch.children?.some((task) => task.kind === 'reservation')))));
});

test('out-of-range and past requests are rejected without enqueueing or blocking subsequent task steps', () => {
  const { draft, sequence, use, activity } = fixture();
  const macro = createTaskMacro('Two reservations');
  macro.steps = [30, 1].map((offset) => ({ id: crypto.randomUUID(), task: { ...structuredClone(use), date: { mode: 'days', offset: { type: 'constant', value: offset } } } }));
  draft.taskMacros = [macro]; activity.branches[0].task = { task_macro_id: macro.id, arguments: {} };
  const result = simulateSequenceDay(draft, sequence.id, 4);
  assert.deepEqual(result.errors, []); assert.equal(result.reservations.length, 1);
  assert.equal(result.calls[0].reason, 'scheduleOutsideSequence'); assert.equal(result.calls[1].accepted, true);
  macro.steps = [{ id: crypto.randomUUID(), task: { ...structuredClone(use), date: { mode: 'weeks_weekday', offset: { type: 'constant', value: 0 }, weekday: 'thu' } } }];
  assert.equal(simulateSequenceDay(draft, sequence.id, 4).calls[0].reason, 'scheduleFutureRequired');
  assert.equal(simulateSlot(draft, activity.id).errors[0].key, 'scheduleContextRequired');
});

test('scoped numeric offsets forward through macros, copy correctly and protect parameter types', () => {
  const { draft, activity, use, sequence } = fixture();
  const macro = createTaskMacro('Book after days'), id = crypto.randomUUID();
  macro.parameters = [{ id, display_name: 'Delay', type: 'number' }];
  macro.steps = [{ id: crypto.randomUUID(), task: { ...use, date: { mode: 'days', offset: { type: 'parameter_reference', parameter_id: id } } } }];
  draft.taskMacros = [macro]; activity.branches[0].task = { task_macro_id: macro.id, arguments: { [id]: { type: 'constant', value: 2 } } };
  assert.deepEqual(compileProject(draft).errors, []); assert.deepEqual(compileRuntime(draft).errors, []);
  assert.equal(simulateSequenceDay(draft, sequence.id, 4).reservations[0].target_position, 6);
  const copy = duplicateTaskMacro(macro); assert.equal(copy.steps[0].task.date.offset.parameter_id, copy.parameters[0].id);
  assert.throws(() => deleteMacroParameter(draft, macro.id, id), /macroParameterInUse/);
  assert.ok(changeMacroParameterType(draft, macro.id, id, { type: 'string' }).blocked.length);
});

test('invalid sources and dates reject imports, referenced days cannot be deleted and reports include future candidates', () => {
  const { draft, activity, use, eventDay } = fixture();
  assert.equal(scheduledDayReferences(draft, eventDay.id).length, 1);
  assert.equal(editProject(draft).days.references(eventDay.id).reservations.length, 1);
  assert.equal(editProject(draft).days.remove(eventDay.id).ok, false);
  const report = compileReport(draft); assert.deepEqual(report.errors, []); assert.ok(report.data.includes('Date night'));
  assert.ok(slotLogicText(activity, { days: draft.days, t }).includes('Inspection'));
  for (const change of [
    { day_source: { mode: 'sequential', candidates: [{ day_schedule_id: eventDay.id }] } },
    { day_source: { mode: 'random', candidates: [] } },
    { day_source: { mode: 'random', candidates: [use.day_source.candidates[0], use.day_source.candidates[0]] } },
    { day_source: { mode: 'random', candidates: [{ day_schedule_id: crypto.randomUUID(), weight: 1 }] } },
    { date: { mode: 'days', offset: { type: 'constant', value: .5 } } },
    { execution_mode: 'interrupt_main', priority: -1 },
  ]) {
    const data = compileProject(draft).data; Object.assign(data.slots[activity.id].branches[0].task, change); assert.ok(validateDocument(data).length);
  }
});

test('date expressions export environment contracts, protect variable references and reject fractional results', () => {
  const { draft, activity, sequence, use, eventDay } = fixture(), vars = builtinVariableFixture();
  draft.operandNodes = vars.draft.operandNodes;
  use.date = { mode: 'days', offset: { type: 'expression', operator: '+', operand_a: { type: 'reference', reference_id: vars.number }, operand_b: { type: 'constant', value: 1 } } };
  use.display_name = ''; use.day_schedule_id = eventDay.id; delete use.day_source;
  assert.deepEqual(compileProject(draft).errors, []);
  const runtime = compileRuntime(draft); assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.data.slots[activity.id].branches[0].task.date.offset.operand_a.type, 'environment_reference');
  assert.equal(runtime.data.slots[activity.id].branches[0].task.display_name, 'Inspection');
  assert.equal(editProject(draft).variables.remove(vars.number).ok, false);
  const values = { ...simulationInitialValues(draft), [vars.number]: 2 };
  const result = simulateSequenceDay(draft, sequence.id, 4, values);
  assert.deepEqual(result.errors, []); assert.equal(result.reservations[0].target_position, 7);
  values[vars.number] = 2.5;
  const rejected = simulateSequenceDay(draft, sequence.id, 4, values);
  assert.deepEqual(rejected.errors, []); assert.equal(rejected.reservations.length, 0); assert.equal(rejected.calls[0].reason, 'scheduleOffsetError');
});
