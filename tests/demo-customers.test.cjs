const {test}=require('node:test');const assert=require('node:assert/strict');
const {Customers,localDay}=require('../frontends/web/demo-customers-model.js');
test('customer editing validates contact details and preserves identity and independent snapshots',()=>{
 const m=new Customers(),id=m.save({name:'A sample',email:'A@example.test',source:'WhatsApp'});
 assert.equal(m.get(id).email,'a@example.test');assert.equal(m.get(id).consent,false);
 assert.throws(()=>m.save({name:'Other',email:'a@example.test',source:'Referral'}),/already/);
 assert.throws(()=>m.save({name:'Other',email:'bad',source:'Referral'}),/valid/);
 assert.throws(()=>m.save({name:'Other',source:'Unknown'}),/source/);
 m.save({name:'Updated',email:'a@example.test',source:'WhatsApp',consent:'on'},id);assert.equal(m.get(id).consent,true);
 const s=m.snapshot();s.customers[1].name='Mutated';assert.equal(m.get(id).name,'Updated');
 assert.deepEqual(m.summary(id,[{customerId:id,status:'completed',subtotal:1250,discount:250},{customerId:id,status:'void',subtotal:500,discount:0},{customerId:99,status:'completed',subtotal:800,discount:0}]),{orders:1,netSales:1000});
});
test('follow-ups validate calendar dates, retain history for archived contacts and reset with a new demo',()=>{
 const m=new Customers();m.followup({customerId:1,date:localDay(),task:'Sample next step'});
 const f=m.snapshot().followups.at(-1);m.toggle(f.id);assert.equal(m.snapshot().followups.at(-1).done,true);
 assert.throws(()=>m.followup({customerId:1,date:'2026-02-30',task:'Bad date'}),/valid/);
 assert.throws(()=>m.followup({customerId:88,date:localDay(),task:'Unknown'}),/existing/);
 m.archive(1);assert.throws(()=>m.followup({customerId:1,date:localDay(),task:'Archived'}),/Restore/);assert.equal(m.snapshot().followups.length,2);m.archive(1);assert.equal(m.get(1).archived,false);
 assert.equal(new Customers().snapshot().followups.length,1);
});
