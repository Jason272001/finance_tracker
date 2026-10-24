const {test}=require('node:test');const assert=require('node:assert/strict');
const {Shop}=require('../frontends/web/pos-demo-model.js');const {Customers}=require('../frontends/web/demo-customers-model.js');
const lines=[{productId:1,quantity:1,unitPrice:12.50}];
const cashier={id:101,name:'Jason',branchId:1};
test('register gates sales, purchases and voids; captures immutable cashier and owner-only rules',()=>{
 const shop=new Shop({requireStaff:true}),before=shop.snapshot();
 assert.throws(()=>shop.sale(lines,{payment:'card'}),/Sign in/);assert.throws(()=>shop.purchase(1,[{productId:1,quantity:1,unitCost:7}]),/Sign in/);assert.throws(()=>shop.voidSale('SALE-1000'),/Sign in/);assert.deepEqual(shop.snapshot(),before);
 assert.throws(()=>shop.signIn(cashier,'wrong'),/1111/);shop.signIn(cashier,'1111');assert.throws(()=>shop.setLoyalty({earnPerDollar:2,pointsPerDollar:1000}),/owner/);
 const sale=shop.sale(lines,{payment:'card'}),purchase=shop.purchase(1,[{productId:1,quantity:1,unitCost:7}]);assert.equal(sale.cashier.name,'Jason');assert.equal(purchase.cashier.id,101);
 shop.signIn({id:102,name:'Kay',branchId:1},'1111');assert.equal(shop.snapshot().sales[0].cashier.name,'Jason');shop.voidSale(sale.id);assert.equal(shop.snapshot().sales[0].voidedBy.name,'Kay');shop.signOut();assert.equal(shop.session(),null);
});
test('loyalty earns on discounted pretax spend; redemption/void is atomic and rules are frozen',()=>{
 const s=new Shop(),reward={customerId:1,member:true,points:100};
 assert.equal(s.points(1),1000);const before=s.snapshot();assert.throws(()=>s.sale(lines,{customerId:1,rewards:reward,paid:1}),/cover/);assert.deepEqual(s.snapshot(),before);
 const sale=s.sale(lines,{customerId:1,rewards:reward,taxRate:10,payment:'card'});assert.equal(sale.total,1265);assert.equal(sale.loyalty.earned,11);assert.equal(sale.loyalty.discount,100);assert.equal(s.points(1),911);
 s.setLoyalty({earnPerDollar:2,pointsPerDollar:1000});assert.equal(s.snapshot().sales[0].loyalty.rules.pointsPerDollar,100);assert.equal(s.points(1),911);s.voidSale(sale.id);assert.equal(s.points(1),1000);
 assert.throws(()=>s.quote(lines,0,0,0,{...reward,points:100}),/multiples/);assert.throws(()=>s.quote(lines,0,0,0,{...reward,points:2000}),/enough/);assert.throws(()=>s.quote(lines,0,0,0,{...reward,member:false,points:1000}),/enrolled/);assert.throws(()=>s.sale(lines,{customerId:2,rewards:{...reward,points:0},payment:'card'}),/match/);
 s.setLoyalty({earnPerDollar:1,pointsPerDollar:100});assert.throws(()=>s.quote(lines,1,0,0,reward),/not both/);assert.throws(()=>s.quote(lines,0,0,1,reward),/not both/);
 const promo=s.sale(lines,{customerId:1,rewards:{...reward,points:0},promotionId:1,payment:'card'});assert.equal(promo.loyalty.earned,11);assert.equal(promo.discount,125);
});
test('spent earnings cannot be removed by voiding an older sale; reverse redemption first',()=>{
 const s=new Shop(),r={customerId:2,member:true,points:0};const first=s.sale([{productId:1,quantity:1,unitPrice:100}],{customerId:2,rewards:r,payment:'card'});
 const second=s.sale(lines,{customerId:2,rewards:{...r,points:100},payment:'card'});const before=s.snapshot();assert.throws(()=>s.voidSale(first.id),/already spent/);assert.deepEqual(s.snapshot(),before);s.voidSale(second.id);s.voidSale(first.id);assert.equal(s.points(2),0);
});
test('phone enrollment needs no email/name, normalizes duplicate phones and separates message consent',()=>{
 const c=new Customers();const id=c.enroll({phone:'+1 (555) 010-0200'});assert.equal(c.get(id).member,true);assert.equal(c.get(id).email,'');assert.equal(c.get(id).consent,false);
 assert.throws(()=>c.message(id,'An offer'),/agreed/);assert.equal(c.enroll({phone:'+15550100200',consent:'on'}),id);c.message(id,'Sample deal');c.message(id,'STOP',true);assert.equal(c.get(id).consent,false);assert.throws(()=>c.message(id,'Another offer'),/agreed/);assert.equal(c.snapshot().messages.length,2);
 assert.throws(()=>c.enroll({phone:'5550100200'}),/country/);assert.throws(()=>c.save({name:'Duplicate',phone:'+15550100200',source:'Walk-in'}),/already/);
});
