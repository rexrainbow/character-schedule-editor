import test from 'node:test';
import assert from 'node:assert/strict';
import { continuousTrendSeries, continuousTrendEvents } from '../src/simulation/trends.js';

test('trends use captured simulation inputs for Day 0 and complete daily snapshots thereafter', () => {
  const nodes = { energy: { value_type: 'number' }, flag: { value_type: 'boolean' }, formula: { value_type: 'number', source: 'computed' } };
  const result = { initialValues: { energy: 60, flag: true }, days: [{ dayNumber: 1, before: { energy: 99 }, after: { energy: 48 } }, { dayNumber: 2, after: { energy: 63 } }] };
  const before = structuredClone(result);
  assert.deepEqual(continuousTrendSeries(result, nodes, ['energy', 'flag', 'energy', 'formula', 'missing']), [{ id: 'energy', points: [{ day: 0, value: 60 }, { day: 1, value: 48 }, { day: 2, value: 63 }] }]);
  assert.deepEqual(result, before);
  assert.deepEqual(continuousTrendSeries({ initialValues: { energy: -10 }, days: [] }, nodes, ['energy'])[0].points, [{ day: 0, value: -10 }]);
});

test('missing and non-finite snapshots become gaps without introducing zeroes or partial days', () => {
  const nodes = { n: { value_type: 'number' } };
  const result = { status: 'cancelled', days: [{ dayNumber: 1, checkpoint: { state: { variables: { n: 5 } } }, after: { n: 0 } }, { dayNumber: 2, after: {} }, { dayNumber: 3, after: { n: Infinity } }, { dayNumber: 4, after: { n: -7 } }] };
  assert.deepEqual(continuousTrendSeries(result, nodes, ['n'])[0].points, [{ day: 0, value: 5 }, { day: 1, value: 0 }, { day: 2, value: null }, { day: 3, value: null }, { day: 4, value: -7 }]);
});

test('event marker choices contain only occurrences in completed history and retain all same-day events', () => {
  const result = { days: [
    { dayNumber: 1, events: [{ eventRef: 'cold', name: 'Cold', dayRef: 'sick' }, { eventRef: 'bonus', name: 'Bonus', dayRef: 'gift' }] },
    { dayNumber: 2, events: [{ eventRef: 'bonus', name: 'Bonus', dayRef: 'gift' }] },
    { dayNumber: 3, events: [{ eventRef: 'cold', name: 'Cold', dayRef: 'sick' }] },
  ] };
  assert.deepEqual(continuousTrendEvents(result), [
    { id: 'cold', name: 'Cold', dayRef: 'sick', days: [1, 3] },
    { id: 'bonus', name: 'Bonus', dayRef: 'gift', days: [1, 2] },
  ]);
});
