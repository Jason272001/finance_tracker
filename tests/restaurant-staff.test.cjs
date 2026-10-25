const {test}=require('node:test');const assert=require('node:assert/strict');
const {Shop}=require('../frontends/web/pos-demo-model.js');const {Access}=require('../frontends/web/demo-staff-access-model.js');const menu=require('../frontends/web/demo-restaurant-model.js');
const people=[{id:101,name:'Jason',branchId:1},{id:102,name:'Kay',branchId:1},{id:103,name:'Morgan',branchId:2}];
test('staff credentials validate branch, unique IDs and owner-controlled PIN changes',()=>{
 const a=new Access();assert.equal(a.authenticate('10101','1111',1,people).name,'Jason');assert.throws(()=>a.authenticate('10103','1111',1,people),/another branch/);
 assert.throws(()=>a.save(101,'123456','9876',null,people),/owner/);assert.throws(()=>a.save(101,'10102','9876',{role:'owner'},people),/already/);
 a.save(101,'012345','9876',{role:'owner'},people);assert.throws(()=>a.authenticate('10101','1111',1,people),/incorrect/);assert.equal(a.authenticate('012345','9876',1,people).id,101);assert.equal(a.list(people)[0].pin,undefined);
});
test('till sessions are independent; locks prevent checkout and cashier replacement',()=>{
 const s=new Shop({requireStaff:true});s.signIn(people[0],'1111');s.selectDevice('register-2');assert.equal(s.session(),null);s.signIn(people[1],'1111');s.selectDevice('register-1');assert.equal(s.session().name,'Jason');s.lock();assert.throws(()=>s.sale([{productId:1,quantity:1,unitPrice:12.5}],{payment:'card'}),/Sign in/);assert.throws(()=>s.signIn(people[1],'1111'),/same staff/);s.signIn(people[0],'1111');assert.equal(s.session().locked,false);s.revokeEmployee(101);assert.equal(s.session(),null);s.selectDevice('register-2');assert.equal(s.session().name,'Kay');
});
test('combo lines retain components, costs, extras and notes through sale and void',()=>{
 const s=new Shop();menu.catalog.forEach(p=>s.product({...p,brandId:1,categoryId:1,cost:p.cost/100,price:p.price/100}));
 const order=menu.order('burger',{quantity:2,meal:true,patty:true,sauce:true,drink:'Water',note:'No onions'},s.snapshot().products,'meal-1');assert.equal(order.total,2300);assert.equal(order.lines.length,5);
 const before=s.snapshot().products.map(p=>p.stock);const sale=s.sale(order.lines,{payment:'card',industry:'restaurant',fulfillment:'dine-in'});assert.equal(sale.total,2300);assert.equal(sale.fulfillment,'Dine-in');assert.equal(sale.items[0].groupId,'meal-1');assert.match(sale.items[0].note,/No onions/);s.voidSale(sale.id);assert.deepEqual(s.snapshot().products.map(p=>p.stock),before);
 const oversized=menu.order('burger',{quantity:100,meal:true},s.snapshot().products,'oversized');const snapshot=s.snapshot();assert.throws(()=>s.sale(oversized.lines,{payment:'card'}),/stock/);assert.deepEqual(s.snapshot(),snapshot);
});
