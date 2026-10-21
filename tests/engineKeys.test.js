import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSession } from '../src/core/projectApi.js';
import { engineKeyEntries, engineKeyConflicts } from '../src/core/engineKeyModel.js';

test('persistent names are unique within a type, while different types can share names', () => {
 const p=createProjectSession();
 const a=p.days.create({name:'Day',symbol:'work'});assert.equal(a.ok,true);
 assert.equal(p.slots.create({name:'Slot',symbol:'work'}).ok,true);
 assert.equal(p.days.create({name:'Other',symbol:'work'}).ok,false);
 const entries=engineKeyEntries(p.getSnapshot());
 assert.deepEqual(engineKeyConflicts(entries,'days',a.id,'work'),[]);
 assert.deepEqual(p.toDocument().errors,[]);
});

test('copies receive new UUIDs and unique persistent names while retaining icons', () => {
 const p=createProjectSession(); const a=p.slots.create({name:'Work',symbol:'work',icon:'tabler:books'});
 const b=p.slots.duplicate(a.id),c=p.slots.duplicate(a.id);
 assert.equal(b.ok,true);assert.equal(c.ok,true);
 assert.equal(b.value.symbol,'work_copy');assert.equal(c.value.symbol,'work_copy_2');
 assert.equal(b.value.icon,'tabler:books');assert.notEqual(b.id,a.id);
 assert.equal(p.toDocument().data.slots[a.id].name,'work');
});
