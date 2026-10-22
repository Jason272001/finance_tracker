const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Shop, parseCsv } = require('../frontends/web/pos-demo-model.js');
test('purchase receives stock with weighted cost and preserves selling prices', () => {
  const shop = new Shop(); shop.purchase(1, [{ productId: 1, quantity: 10, unitCost: '10.00' }], 'sample invoice');
  const p = shop.get('products', 1); assert.equal(p.stock, 30); assert.equal(p.cost, 800); assert.equal(p.price, 1250);
  assert.equal(shop.snapshot().purchases[0].total, 10000);
});
test('sales use cents, discount/tax, cash change and stock; void restores once', () => {
  const shop = new Shop(); const sale = shop.sale([{ productId: 2, quantity: 2 }], { discount: 5, taxRate: 8, paid: 30 });
  assert.equal(sale.total, 2700); assert.equal(sale.change, 300); assert.equal(shop.get('products', 2).stock, 6);
  shop.voidSale(sale.id); assert.equal(shop.get('products', 2).stock, 8); assert.throws(() => shop.voidSale(sale.id));
});
test('duplicate sale lines cannot oversell and failures never change stock/history', () => {
  const shop = new Shop(), before = shop.snapshot();
  assert.throws(() => shop.sale([{ productId: 3, quantity: 3 }, { productId: 3, quantity: 2 }], { payment: 'card' }), /Not enough stock/);
  assert.deepEqual(shop.snapshot(), before);
  assert.throws(() => shop.sale([{ productId: 1, quantity: 1 }], { paid: 1 }), /cover/);
  assert.deepEqual(shop.snapshot(), before);
  assert.throws(() => shop.purchase(1, [{ productId: 1, quantity: 10000, unitCost: 7 }]));
  assert.deepEqual(shop.snapshot(), before);
});
test('void restores historical cost into stock after a later supplier purchase', () => {
  const shop = new Shop(), sale = shop.sale([{ productId: 2, quantity: 2 }], { payment: 'card' });
  shop.purchase(1, [{ productId: 2, quantity: 2, unitCost: 10 }]);
  assert.equal(shop.get('products', 2).cost, 700);
  shop.voidSale(sale.id); assert.equal(shop.get('products', 2).stock, 10); assert.equal(shop.get('products', 2).cost, 680);
});
test('CSV handles BOM, quotes and newlines and rejects all partial imports', () => {
  const shop = new Shop();
  const count = shop.importCsv('\uFEFFsku,name,price,cost,stock,brand,category,description\r\nNEW1,"Sample, bag",9.50,4,10,New Brand,Bags,"Line one\nLine two"');
  assert.equal(count, 1); assert.equal(shop.snapshot().products.at(-1).price, 950);
  const before = shop.snapshot();
  assert.throws(() => shop.importCsv('sku,name,price,brand\nNEW2,Valid,1,Temporary\nCOF001,Duplicate,3,Temporary'), /already exists/);
  assert.deepEqual(shop.snapshot(), before);
  assert.throws(() => parseCsv('sku,name,price\nA,"unfinished,1'), /unclosed/);
  assert.throws(() => parseCsv('sku,name,price,price\nA,B,1,2'), /unique headers/);
});
test('catalog edits validate cents, identifiers, quantities and protected history', () => {
  const shop = new Shop();
  assert.throws(() => shop.product({ name: 'Bad', sku: 'BAD', price: 1.005, cost: 1, stock: 1, brandId: 1, categoryId: 1 }));
  assert.throws(() => shop.removeProduct(1), /history/);
  assert.throws(() => shop.removeEntity('brands', 1), /in use/);
  assert.throws(() => shop.product({ name: 'Bad', sku: 'BAD', price: 1, cost: 1, stock: -1, brandId: 1, categoryId: 1 }));
  const sale = shop.sale([{ productId: 1, quantity: 1 }], { payment: 'card' });
  shop.product({ ...shop.get('products', 1), price: 20, cost: 9 }, 1);
  assert.equal(sale.items[0].unitPrice, 1250); assert.equal(shop.snapshot().sales[0].items[0].unitCost, 700);
});
