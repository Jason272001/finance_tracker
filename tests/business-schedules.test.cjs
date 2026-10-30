const {test}=require('node:test'),assert=require('node:assert/strict');
const schedules=require('../frontends/web/business-schedules-ui.js');
const seconds=value=>Date.parse(value)/1000;
test('weekly dates normalize to Monday across year and leap boundaries',()=>{
 assert.equal(schedules.monday('2027-01-03'),'2026-12-28');assert.equal(schedules.addDays('2028-02-28',1),'2028-02-29');assert.throws(()=>schedules.monday('2026-02-30'));
});
test('weekly rows show first names and IDs and separate branches',()=>{
 const data={business:{timezone:'America/Los_Angeles'},staff:[{id:'j',name:'Jason Smith',code:'10002',branch:'a',active:true},{id:'k',name:'Kay Lee',code:'10003',branch:'b',active:true}],schedules:[{staff:'j',branch:'a',start:seconds('2026-11-02T17:00Z'),end:seconds('2026-11-02T22:00Z')}]};const result=schedules.model(data,'a','2026-11-02');assert.equal(result.rows.length,1);assert.equal(result.rows[0].first,'Jason');assert.equal(result.rows[0].code,'10002');assert.deepEqual(result.rows[0].cells[0],['9:00 AM - 2:00 PM']);
});
test('overnight shifts are represented on both dates without a phantom midnight shift',()=>{
 const data={business:{timezone:'America/Los_Angeles'},staff:[{id:'j',name:'Jason',code:'10002',branch:'a',active:false}],schedules:[{staff:'j',branch:'a',start:seconds('2026-11-03T07:00Z'),end:seconds('2026-11-03T10:00Z')}]};const row=schedules.model(data,'a','2026-11-02').rows[0];assert.deepEqual(row.cells[0],['11:00 PM - 12:00 AM (+1 day)']);assert.deepEqual(row.cells[1],['12:00 AM - 2:00 AM']);data.schedules[0].end=seconds('2026-11-03T08:00Z');assert.deepEqual(schedules.model(data,'a','2026-11-02').rows[0].cells[1],[]);
});
test('DST dates use the store time zone rather than the browser date',()=>{
 assert.equal(schedules.localDate(seconds('2026-11-02T01:00Z'),'America/Los_Angeles'),'2026-11-01');assert.equal(schedules.localDate(seconds('2026-11-02T01:00Z'),'Asia/Tokyo'),'2026-11-02');
});
