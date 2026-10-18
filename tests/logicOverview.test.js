import test from 'node:test';
import assert from 'node:assert/strict';
import { slotLogicText } from '../src/logicOverviewModel.js';
import { translator } from '../src/i18n.js';
import { priorityMacroFixture, constant, parameter, reference } from './priorityMacroFixture.js';
import { createTaskMacro, createTaskStep } from '../src/taskMacroModel.js';
const t = translator('en');
function render(fixture, depth = 'summary') { return slotLogicText(fixture.slot, { nodes: fixture.draft.operandNodes, macros: fixture.draft.taskMacros, tasks: fixture.draft.tasks, builtinTasks: fixture.draft.builtinTasks, depth, t }); }

test('priority summary substitutes eligibility arguments, preserves first-match order and marks entries after fallback', () => {
  const f = priorityMacroFixture(), rest = createTaskMacro('Rest'); f.draft.taskMacros.push(rest);
  f.slot.mode = 'priority'; f.slot.candidates = [f.priority.candidates[1], { task: { task_macro_id: rest.id, arguments: {} } }, f.priority.candidates[0]];
  const before = structuredClone(f.draft), text = render(f);
  assert.match(text, /IF \(Engine.Counter >= 5\) → Eligible increase \(Amount: 5\)/);
  assert.match(text, /ELSE → Rest/); assert.match(text, /earlier candidate is unrestricted/);
  assert.ok(text.indexOf('Amount: 5') < text.indexOf('Rest'));
  assert.doesNotMatch(text, /Increase value/); assert.deepEqual(f.draft, before);
});

test('summary, one-level and full expansion preserve nesting and pass expressions through nested parameter scopes', () => {
  const f = priorityMacroFixture(), wrapper = createTaskMacro('Wrapper');
  const p = { id: crypto.randomUUID(), display_name: 'Input', type: 'number' }; wrapper.parameters = [p];
  wrapper.steps = [{ ...createTaskStep(), task: { task_macro_id: f.eligible.id, arguments: { [f.amount.id]: { type: 'expression', operator: '+', operand_a: parameter(p.id), operand_b: constant(2) } } } }];
  f.draft.taskMacros.push(wrapper); f.slot.branches[0].task = { task_macro_id: wrapper.id, arguments: { [p.id]: constant(3) } };
  assert.equal(render(f), 'ELSE → Wrapper (Input: 3)');
  assert.match(render(f, 'one'), /1\. IF \(Engine.Counter >= \(3 \+ 2\)\) → Eligible increase \(Amount: \(3 \+ 2\)\)/);
  assert.doesNotMatch(render(f, 'one'), /Increase value/);
  assert.match(render(f, 'all'), /    1\. Increase value \(Engine.Counter, \(3 \+ 2\)\)/);
});

test('computed conditions expand with ALL/ANY and branch results without evaluating arithmetic', () => {
  const f = priorityMacroFixture(), expressionId = crypto.randomUUID();
  f.draft.operandNodes[expressionId] = { node_type: 'value', source: 'computed', display_name: 'Can work', value_type: 'boolean', definition: { kind: 'branch', branches: [
    { condition: { kind: 'group', mode: 'ANY', items: [{ kind: 'comparison', operand_a: reference(f.number), comparator: '>=', operand_b: constant(10) }] }, result: { kind: 'boolean', condition: { kind: 'comparison', operand_a: constant(true), comparator: '==', operand_b: constant(true) } } },
    { condition: null, result: { kind: 'boolean', condition: { kind: 'comparison', operand_a: constant(false), comparator: '==', operand_b: constant(true) } } },
  ] } };
  f.slot.branches[0].condition = { kind: 'group', mode: 'ALL', items: [{ kind: 'comparison', operand_a: { type: 'expression_macro_reference', expression_macro_id: expressionId }, comparator: '==', operand_b: constant(true) }] };
  f.slot.branches.push({ condition: null, task: { builtin: 'cancel_main_day' } });
  assert.match(render(f), /ALL\(Can work == true\)/);
  assert.match(render(f, 'all'), /Can work \{ IF \(ANY\(Engine.Counter >= 10\)\) → true == true; ELSE → false == true \}/);
  assert.match(render(f, 'all'), /ELSE → Cancel the main schedule for the rest of today/);
});

test('empty and partial drafts remain readable, cycles stop and string arguments retain quoting', () => {
  const f = priorityMacroFixture(); f.slot.branches = [];
  assert.equal(render(f), 'No actions');
  f.slot.branches = [{ condition: null, task: { task_macro_id: f.eligible.id, arguments: {} } }, { condition: null, task: {} }];
  assert.match(render(f), /Argument not configured/); assert.match(render(f), /No task selected/);
  f.eligible.steps[0].task = { task_macro_id: f.eligible.id, arguments: { [f.amount.id]: constant('a "quoted" value') } };
  const text = render(f, 'all');
  assert.match(text, /Circular reference; expansion stopped/); assert.ok(text.includes(JSON.stringify('a "quoted" value')));
});
