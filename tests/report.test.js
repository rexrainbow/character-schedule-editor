import test from 'node:test';
import assert from 'node:assert/strict';
import { compileReport } from '../src/core/reportModel.js';
import { createProjectSession } from '../src/core/projectApi.js';
import { createProject } from '../src/core/model.js';
import { translator } from '../src/i18n/index.js';
import { reportFixture } from './reportFixture.js';
const t = translator('en');

test('report resolves date boundaries, overrides, event candidates and per-phase priority order without executing', () => {
  const f = reportFixture(), before = structuredClone(f.draft), report = compileReport(f.draft);
  assert.deepEqual(report.errors, []); const text = report.data;
  assert.match(text, /Active days: 13/); assert.match(text, /Monday \(Outside execution range\)/);
  assert.match(text, /Day 1 \/ Thursday/); assert.match(text, /Day 13 \/ Tuesday/); assert.doesNotMatch(text, /Day 14/);
  const thursday = text.split('\n').find((line) => line.startsWith('| Day 1 /'));
  assert.match(thursday, /Rest day.*Day override; Originally.*Workday/); assert.match(thursday, /Cold.*Probability candidate/); assert.doesNotMatch(thursday, /Inspection event/);
  const friday = text.split('\n').find((line) => line.startsWith('| Day 2 /'));
  const order = friday.slice(friday.lastIndexOf(' | ', friday.length - 3) + 3);
  assert.ok(order.indexOf('Inspection event') < order.indexOf('Cold')); assert.ok(order.indexOf('Cold') < order.indexOf('Main day schedule')); assert.ok(order.indexOf('Main day schedule') < order.indexOf('Evening event'));
  assert.match(text, /Day override: unassigned/); assert.match(text, /After occurrence, skip the next 7 eligible dates/);
  assert.match(text, /Every 3 eligible dates/); assert.match(text, /Workday.*\n\n- Tags: Office/);
  assert.deepEqual(f.draft, before); assert.equal(compileReport(f.draft).data, text);
});

test('report deduplicates referenced content, includes private days and omits empty event positions', () => {
  const f = reportFixture(), text = compileReport(f.draft).data;
  assert.equal(text.split(`id="day-${f.main.id}"`).length - 1, 1);
  assert.equal(text.split(`id="slot-${f.activity.id}"`).length - 1, 1);
  assert.match(text, /Rest week \/ Wednesday \/ custom day/);
  assert.match(text, /- Slot 2: Unassigned/); assert.doesNotMatch(text, /- Day end event: Unassigned/);
  assert.ok(text.includes('Slot 1 end')); assert.ok(text.includes('Day start'));
  assert.doesNotMatch(text, /Unused day|Unused slot/);
  assert.match(text, /No task assignment/); assert.match(text, /Inspection macro/); assert.match(text, /Adjust probability event \(Cold/);
  const logic = text.slice(text.indexOf('## Slot schedules and task logic'));
  assert.doesNotMatch(logic, /ELSE →|Events \[/);
  assert.doesNotMatch(logic, new RegExp(f.cold.id));
  assert.ok(text.indexOf('## Week sequences') < text.indexOf('## Events'));
  assert.ok(text.indexOf('## Events') < text.indexOf('## Day schedules'));
  assert.ok(text.indexOf('## Day schedules') < text.indexOf('## Slot schedules and task logic'));
});

test('optional unreferenced content, safe Markdown and duplicate names keep every link resolvable', () => {
  const f = reportFixture(); f.unusedDay.name = f.main.name;
  f.unusedSlot.name = '<script>alert(1)</script>| [link](bad)\n# heading';
  const text = compileReport(f.draft, { includeUnreferenced: true }).data;
  assert.ok(text.includes(String.raw`Workday \(item 1\)`)); assert.ok(text.includes(String.raw`\[Unreferenced\]`));
  assert.match(text, /&lt;script&gt;/); assert.doesNotMatch(text, /<script>/);
  const anchors = [...text.matchAll(/<a id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(anchors).size, anchors.length);
  for (const match of text.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(anchors.includes(match[1]), match[1]);
});

test('empty projects are readable, invalid drafts are rejected and Project API follows requested locale', () => {
  const empty = createProject(), report = compileReport(empty);
  assert.deepEqual(report.errors, []); assert.match(report.data, /No week sequences/);
  const f = reportFixture(); const project = createProjectSession(f.draft, { t: translator('zh-TW') });
  const chinese = project.exportReport().data; assert.match(chinese, /## 周序列/); assert.match(chinese, /機率候選/); assert.match(chinese, /冷卻/);
  assert.match(chinese, /日覆蓋/); assert.match(chinese, /增加|調整機率事件/);
  f.draft.days[0].slotIds[0] = crypto.randomUUID();
  const invalid = compileReport(f.draft); assert.equal(invalid.data, null); assert.ok(invalid.errors.some((error) => error.path.includes('/slot_ids/0')));
});
