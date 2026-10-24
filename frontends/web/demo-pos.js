(function () {
  "use strict";
  if (document.documentElement.dataset.demo !== "workspace" || !window.KeeperDemo) return;
  window.PosDemo = { prototype: true };
  document.addEventListener("DOMContentLoaded", () => {
    const business = document.getElementById("businessWorkspace"); if (!business) return;
    const shop = new PosDemoModel.Shop({requireStaff:true}); let saleCart = [], purchaseCart = [], image = "", editing = 0;
    window.PosDemo.snapshot = () => shop.snapshot();
    const cash = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const host = document.createElement("section"); host.id = "demoPos"; host.className = "card pos-demo";
    host.innerHTML = `<div class="section-head"><div><p class="pos-eyebrow">BUSINESS DEMO</p><h2>Sample shop · Point of sale</h2><p>Try a complete sample stock → purchase → sale workflow. This POS prototype is not available for real business use. No real payment, supplier order or accounting entry is created.</p></div></div>
      <div id="posMetrics" class="pos-metrics"></div>
      <nav class="pos-tabs" aria-label="POS sections">${["Checkout", "Products", "Purchases", "Sales", "Promotions", "Suppliers", "Brands", "Categories"].map((name, i) => `<button type="button" data-pos-tab="${name.toLowerCase()}" aria-pressed="${i === 0}">${name}</button>`).join("")}</nav>
      <p id="posStatus" role="status" aria-live="polite"></p>
      <section data-pos-panel="checkout"><h3>Sales checkout</h3><p>Sample inventory only. Card payments are simulated; never enter card details.</p>
        <form id="posSaleLine" class="pos-fields"><label>Sale product<select id="posSaleProduct"></select></label><label>Sale quantity<input id="posSaleQty" type="number" min="1" max="10000" step="1" value="1" required></label><label>Sale unit price (USD)<input id="posSalePrice" type="number" min="0" max="100000" step="0.01" required></label><button>Add to sale</button></form>
        <div id="posSaleCart" class="pos-table-wrap"></div>
        <form id="posCheckout"><div class="pos-fields"><label>Sample customer<input id="posCustomer" maxlength="120" placeholder="Walk-in sample customer"></label><label>Promotion<select id="posPromotion"><option value="0">No promotion</option></select></label><label>Discount (USD)<input id="posDiscount" type="number" min="0" step="0.01" value="0"></label><label>Example tax (%)<input id="posTax" type="number" min="0" max="30" step="0.01" value="0"></label><label>Payment method<select id="posPayment"><option value="cash">Sample cash</option><option value="card">Simulated card</option></select></label><label id="posPaidLabel">Cash received (USD)<input id="posPaid" type="number" min="0" max="100000" step="0.01" value="0"></label></div><p id="posSaleTotal" class="pos-total"></p><button id="posCompleteSale">Complete sample sale</button><button type="button" data-pos-clear="sale" class="secondary">Clear sale</button></form></section>
      <section data-pos-panel="products" hidden><h3>Product catalog</h3><p>Add/edit sample products or import new products from CSV. Opening/current stock edits are sample adjustments; receive purchases to test the purchasing workflow.</p>
        <form id="posProductForm"><div class="pos-fields"><label>Product name<input id="posProductName" maxlength="120" required></label><label>SKU / barcode<input id="posProductSku" maxlength="60" required></label><label>Product brand<select id="posProductBrand"></select></label><label>Product category<select id="posProductCategory"></select></label><label>Cost price (USD)<input id="posProductCost" type="number" min="0" max="100000" step="0.01" value="0" required></label><label>Selling price (USD)<input id="posProductPrice" type="number" min="0" max="100000" step="0.01" value="0" required></label><label>Stock quantity<input id="posProductStock" type="number" min="0" max="10000" step="1" value="0" required></label><label>Product photo (optional)<input id="posProductPhoto" type="file" accept="image/png,image/jpeg,image/webp"></label></div><label>Description<textarea id="posProductDescription" maxlength="2000" rows="2"></textarea></label><p id="posPhotoStatus" class="muted"></p><div class="row"><button id="posSaveProduct">Add product</button><button type="button" data-pos-new-product class="secondary">Clear product form</button><button type="button" data-pos-remove-photo class="secondary">Remove sample photo</button></div></form>
        <details class="pos-import"><summary>Upload products from CSV</summary><p>Headers: sku,name,brand,category,cost,price,stock,description. Name, SKU and price are required. Import adds new products; duplicate SKUs reject the whole file. Up to 500 rows and 1 MB; no images in CSV.</p><div class="pos-fields"><label>Product CSV<input id="posCsvFile" type="file" accept=".csv,text/csv"></label><button type="button" id="posImportCsv">Import sample CSV</button><button type="button" id="posTemplate" class="secondary">Download CSV template</button></div></details>
        <label>Search products<input id="posProductSearch" type="search" placeholder="Name, SKU, brand or category"></label><div id="posProductTable" class="pos-table-wrap"></div></section>
      <section data-pos-panel="purchases" hidden><h3>Purchases from suppliers</h3><p>Build a sample delivery and receive it to increase stock. Inventory cost uses a weighted average; selling prices stay unchanged.</p>
        <div class="pos-fields"><label>Purchase supplier<select id="posPurchaseSupplier"></select></label><label>Supplier reference<input id="posPurchaseReference" maxlength="200" placeholder="Sample invoice number"></label></div>
        <form id="posPurchaseLine" class="pos-fields"><label>Purchase product<select id="posPurchaseProduct"></select></label><label>Purchase quantity<input id="posPurchaseQty" type="number" min="1" max="10000" step="1" value="1" required></label><label>Purchase unit cost (USD)<input id="posPurchaseCost" type="number" min="0" max="100000" step="0.01" required></label><button>Add to purchase</button></form><div id="posPurchaseCart" class="pos-table-wrap"></div><p id="posPurchaseTotal" class="pos-total"></p><button type="button" id="posReceivePurchase">Receive sample purchase</button><button type="button" data-pos-clear="purchase" class="secondary">Clear purchase</button><h3>Purchase history</h3><div id="posPurchaseTable" class="pos-table-wrap"></div></section>
      <section data-pos-panel="promotions" hidden><h3>Promotions & discounts</h3><p>Create an offer, then choose it at checkout. One offer per sale; tax is calculated after discounts. Dates use this device’s local calendar. Refresh resets offers.</p><form id="posPromotionForm" class="pos-fields"><label>Offer name<input name="name" required maxlength="80"></label><label>Promotion code<input name="code" required maxlength="30"></label><label>Discount type<select name="type"><option value="percent">Percentage</option><option value="fixed">Fixed amount (USD)</option></select></label><label>Discount value<input name="value" type="number" min="0.01" step="0.01" required></label><label>Minimum subtotal (USD)<input name="minimum" type="number" min="0" step="0.01" value="0"></label><label>Starts (optional)<input name="start" type="date"></label><label>Ends (optional)<input name="end" type="date"></label><button>Create promotion</button></form><div id="posPromotionTable" class="pos-table-wrap"></div></section>
      <section data-pos-panel="sales" hidden><h3>Sales history</h3><p>View sample receipts or void a sale to return its units to stock. Voiding is a simulation, not a payment refund.</p><div id="posSalesTable" class="pos-table-wrap"></div></section>
      ${["suppliers", "brands", "categories"].map(kind => `<section data-pos-panel="${kind}" hidden><h3>${kind[0].toUpperCase() + kind.slice(1)}</h3><form data-pos-entity="${kind}" class="pos-fields"><input type="hidden" name="id" value="0"><label>${kind === "categories" ? "Category" : kind === "brands" ? "Brand" : "Supplier"} name<input name="name" maxlength="80" required></label>${kind === "suppliers" ? '<label>Supplier email<input name="email" type="email" maxlength="120" placeholder="supplier@example.test"></label><label>Supplier phone<input name="phone" maxlength="120"></label><label>Supplier address<input name="address" maxlength="300"></label>' : ''}<button>Save ${kind === "categories" ? "category" : kind.slice(0, -1)}</button><button type="reset" class="secondary">Clear form</button></form><div id="pos${kind}Table" class="pos-table-wrap"></div></section>`).join("")}`;
    business.insertBefore(host, business.children[1] || null);
    const $ = id => host.querySelector('#' + id);
    function message(text, error = false) { $('posStatus').textContent = text; $('posStatus').classList.toggle('error-text', error); }
    function guard(action, prevent = true) { return async event => { if (event && prevent) event.preventDefault(); try { await action(event); } catch (error) { message(error.message, true); } }; }
    function table(headers, rows) { return `<table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">No sample records yet.</td></tr>`}</tbody></table>`; }
    const button = (action, id, label) => `<button type="button" class="secondary" data-pos-action="${action}" data-pos-id="${esc(id)}">${label}</button>`;
    function select(id, rows, label) {
      const el = $(id), previous = el.value;
      el.innerHTML = rows.map(row => `<option value="${row.id}">${esc(label(row))}</option>`).join('');
      if (rows.some(row => String(row.id) === previous)) el.value = previous;
    }
    function carts() {
      for (const [kind, rows, id] of [['sale', saleCart, 'posSaleCart'], ['purchase', purchaseCart, 'posPurchaseCart']]) {
        const data = shop.snapshot();
        $(id).innerHTML = table(['Product', 'Qty', 'Unit price', 'Line total', 'Action'], rows.map((line, i) => `<tr><td>${esc(data.products.find(p => p.id === line.productId)?.name || 'Removed product')}</td><td>${line.quantity}</td><td>${cash(Math.round(Number(line[kind === 'sale' ? 'unitPrice' : 'unitCost']) * 100))}</td><td>${cash(Math.round(Number(line[kind === 'sale' ? 'unitPrice' : 'unitCost']) * 100) * line.quantity)}</td><td>${button('remove-' + kind, i, 'Remove')}</td></tr>`));
      }
      try {
        const q = saleCart.length ? shop.quote(saleCart, $('posDiscount').value, $('posTax').value, $('posPromotion').value, window.PosLoyalty?.options()||{}) : null;
        $('posSaleTotal').textContent = q ? `Subtotal ${cash(q.subtotal)} − discount ${cash(q.discount)} + example tax ${cash(q.tax)} = ${cash(q.total)}` : 'Add products to start a sample sale.';
        $('posCompleteSale').disabled = !q || !shop.session();
      } catch (error) { $('posSaleTotal').textContent = error.message; $('posCompleteSale').disabled = true; }
      $('posPurchaseTotal').textContent = 'Purchase total: ' + cash(purchaseCart.reduce((n, l) => n + Math.round(Number(l.unitCost) * 100) * l.quantity, 0));
      $('posReceivePurchase').disabled = !purchaseCart.length || !shop.session();
      $('posPaidLabel').hidden = $('posPayment').value !== 'cash';
    }
    function render() {
      document.dispatchEvent(new Event('keeper-pos-change'));
      const data = shop.snapshot();
      select('posPromotion', [{id:0,name:'No promotion'},...data.promotions], p=>p.id ? p.code+' · '+p.name+(p.enabled?'':' (disabled)') : p.name);
      $('posPromotionTable').innerHTML=table(['Offer','Discount','Minimum','Dates','Status','Action'],data.promotions.map(p=>`<tr><td>${esc(p.name)}<br>${esc(p.code)}</td><td>${p.type==='percent'?p.value+'%':cash(Math.round(p.value*100))}</td><td>${cash(p.minimum)}</td><td>${esc(p.start||'Any time')} → ${esc(p.end||'No end')}</td><td>${p.enabled?'Enabled':'Disabled'}</td><td>${button('toggle-promotion',p.id,p.enabled?'Disable':'Enable')}</td></tr>`));
      $('posMetrics').innerHTML = [['Products', data.products.length], ['Units in stock', data.products.reduce((n, p) => n + p.stock, 0)], ['Stock value at cost', cash(data.products.reduce((n, p) => n + p.stock * p.cost, 0))], ['Completed sales', cash(data.sales.filter(s => s.status === 'completed').reduce((n, s) => n + s.total, 0))]].map(([name, value]) => `<article><span>${name}</span><strong>${value}</strong></article>`).join('');
      select('posProductBrand', data.brands, r => r.name); select('posProductCategory', data.categories, r => r.name);
      select('posPurchaseSupplier', data.suppliers, r => r.name);
      for (const id of ['posSaleProduct', 'posPurchaseProduct']) select(id, data.products, p => `${p.name} · ${p.sku} · stock ${p.stock}`);
      const name = (list, id) => data[list].find(r => r.id === id)?.name || '—';
      const query = $('posProductSearch').value.toLowerCase();
      $('posProductTable').innerHTML = table(['Product / SKU', 'Brand', 'Category', 'Cost', 'Price', 'Stock', 'Actions'], data.products.filter(p => [p.name, p.sku, name('brands', p.brandId), name('categories', p.categoryId)].some(v => v.toLowerCase().includes(query))).map(p => `<tr><td>${p.image ? `<img class="pos-thumb" src="${esc(p.image)}" alt="${esc(p.name)}">` : ''}<strong>${esc(p.name)}</strong><br>${esc(p.sku)}<p class="muted">${esc(p.description)}</p></td><td>${esc(name('brands', p.brandId))}</td><td>${esc(name('categories', p.categoryId))}</td><td>${cash(p.cost)}</td><td>${cash(p.price)}</td><td>${p.stock}${p.stock <= 5 ? '<br><span class="pos-low-stock">Low stock</span>' : ''}</td><td>${button('edit-product', p.id, 'Edit')} ${button('delete-product', p.id, 'Delete')}</td></tr>`));
      for (const kind of ['suppliers', 'brands', 'categories']) $('pos' + kind + 'Table').innerHTML = table(kind === 'suppliers' ? ['Name', 'Email', 'Phone / address', 'Actions'] : ['Name', 'Actions'], data[kind].map(row => `<tr><td>${esc(row.name)}</td>${kind === 'suppliers' ? `<td>${esc(row.email)}</td><td>${esc(row.phone)}<br>${esc(row.address)}</td>` : ''}<td>${button('edit-' + kind, row.id, 'Edit')} ${button('delete-' + kind, row.id, 'Delete')}</td></tr>`));
      $('posPurchaseTable').innerHTML = table(['Purchase', 'Supplier / cashier', 'Reference', 'Total', 'Details'], data.purchases.map(p => `<tr><td>${esc(p.id)}<br>${esc(new Date(p.date).toLocaleDateString())}</td><td>${esc(p.supplier)}<br>${esc(p.cashier?.name || "Legacy sample")}</td><td>${esc(p.reference)}</td><td>${cash(p.total)}</td><td>${button('view-purchase', p.id, 'View purchase')}</td></tr>`));
      $('posSalesTable').innerHTML = table(['Sale', 'Customer / cashier', 'Payment', 'Status', 'Total', 'Actions'], data.sales.map(s => `<tr><td>${esc(s.id)}<br>${esc(new Date(s.date).toLocaleDateString())}</td><td>${esc(s.customer)}<br>Cashier: ${esc(s.cashier?.name || "Legacy sample")}</td><td>${esc(s.payment)}</td><td>${esc(s.status)}${s.voidedBy?" · by "+esc(s.voidedBy.name):""}</td><td>${cash(s.total)}</td><td>${button('view-sale', s.id, 'View receipt')} ${s.status === 'completed' ? button('void-sale', s.id, 'Void sale') : ''}</td></tr>`));
      carts();
    }
    function prices() {
      const data = shop.snapshot();
      $('posSalePrice').value = ((data.products.find(p => p.id === Number($('posSaleProduct').value))?.price || 0) / 100).toFixed(2);
      $('posPurchaseCost').value = ((data.products.find(p => p.id === Number($('posPurchaseProduct').value))?.cost || 0) / 100).toFixed(2);
    }
    function clearProduct() { editing = 0; image = ''; $('posProductForm').reset(); $('posPhotoStatus').textContent = ''; $('posSaveProduct').textContent = 'Add product'; }
    function download(name, content) {
      const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function receipt(kind, id) {
      const order = shop.snapshot()[kind === 'sale' ? 'sales' : 'purchases'].find(o => o.id === id);
      const box = document.createElement('dialog'); box.className = 'demo-dialog pos-receipt';
      box.innerHTML = `<h2>${kind === 'sale' ? 'Sample receipt' : 'Sample purchase'} · ${esc(order.id)}</h2><p>DEMO ONLY · Not a real invoice, payment or tax document.</p><p>${esc(order.customer || order.supplier)} · ${esc(order.status || 'Received')}</p><p>Cashier: ${esc(order.cashier?.name || 'Legacy sample')}</p><div class="pos-table-wrap">${table(['Product', 'Qty', 'Unit', 'Total'], order.items.map(l => `<tr><td>${esc(l.name)}<br>${esc(l.sku)}</td><td>${l.quantity}</td><td>${cash(l.unitPrice ?? l.unitCost)}</td><td>${cash((l.unitPrice ?? l.unitCost) * l.quantity)}</td></tr>`))}</div>${kind === 'sale' ? `<p>${order.promotion ? esc(order.promotion.code)+" · "+esc(order.promotion.name) : "Manual / no promotion"}</p><p>Subtotal ${cash(order.subtotal)} · Discount ${cash(order.discount)} · Example tax ${cash(order.tax)}</p>${order.loyalty?`<p>Points earned: ${order.loyalty.earned} · Points redeemed: ${order.loyalty.redeemed} · Reward discount ${cash(order.loyalty.discount)}</p>`:''}<p>Received ${cash(order.paid)} · Change ${cash(order.change)}</p>` : ''}<p class="pos-total">Total ${cash(order.total)}</p><button type="button" class="pos-receipt-download">Download sample record</button><button type="button" class="secondary pos-receipt-close">Close receipt</button>`;
      box.querySelector('.pos-receipt-close').onclick = () => box.close();
      box.querySelector('.pos-receipt-download').onclick = () => download(order.id + '-DEMO.csv', CreatorTools.reportCsv({ rows: order.items.map(l => ({ date: order.date, type: kind, category: l.name, amount: (l.unitPrice ?? l.unitCost) * l.quantity / 100, note: `${order.id}; qty ${l.quantity}; cashier ${order.cashier?.name || "Legacy sample"}; points earned ${order.loyalty?.earned || 0}; points redeemed ${order.loyalty?.redeemed || 0}; DEMO ONLY; ${order.status || 'received'}` })), income: kind === 'sale' ? order.total / 100 : 0, expenses: kind === 'purchase' ? order.total / 100 : 0, net: (kind === 'sale' ? 1 : -1) * order.total / 100 }));
      document.body.append(box); box.addEventListener('close', () => box.remove()); box.showModal();
    }
    host.addEventListener('click', guard(event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.dataset.posTab) {
        host.querySelectorAll('[data-pos-panel]').forEach(p => { p.hidden = p.dataset.posPanel !== target.dataset.posTab; });
        host.querySelectorAll('[data-pos-tab]').forEach(b => b.setAttribute('aria-pressed', String(b === target))); message(''); return;
      }
      if (target.hasAttribute('data-pos-new-product')) { clearProduct(); return; }
      if (target.hasAttribute('data-pos-remove-photo')) { image = ''; $('posProductPhoto').value = ''; $('posPhotoStatus').textContent = 'Sample photo removed. Save the product to apply.'; return; }
      if (target.dataset.posClear) { if (target.dataset.posClear === 'sale') saleCart = []; else purchaseCart = []; carts(); return; }
      const action = target.dataset.posAction, id = target.dataset.posId; if (!action) return;
      if(action==='toggle-promotion'){shop.togglePromotion(id);render();return;}
      if (action.startsWith('remove-')) { (action === 'remove-sale' ? saleCart : purchaseCart).splice(Number(id), 1); carts(); return; }
      if (action === 'view-sale' || action === 'view-purchase') { receipt(action === 'view-sale' ? 'sale' : 'purchase', id); return; }
      if (action === 'void-sale') { if (!confirm('Void this sample sale and restore its stock? No real refund occurs.')) return; shop.voidSale(id); render(); message('Sample sale voided; stock restored.'); return; }
      if (action === 'edit-product') {
        const p = shop.get('products', id); editing = p.id; image = p.image;
        for (const [key, value] of Object.entries({ Name: p.name, Sku: p.sku, Brand: p.brandId, Category: p.categoryId, Cost: (p.cost / 100).toFixed(2), Price: (p.price / 100).toFixed(2), Stock: p.stock, Description: p.description })) $('posProduct' + key).value = value;
        $('posProductPhoto').value = ''; $('posPhotoStatus').textContent = image ? 'Existing sample photo selected.' : ''; $('posSaveProduct').textContent = 'Save product'; $('posProductName').focus(); return;
      }
      if (action === 'delete-product') { shop.removeProduct(id); render(); prices(); message('Sample product deleted.'); return; }
      const [verb, collection] = action.split('-');
      if (['brands', 'categories', 'suppliers'].includes(collection)) {
        if (verb === 'delete') { shop.removeEntity(collection, id); render(); message('Sample record deleted.'); }
        else { const form = host.querySelector(`[data-pos-entity="${collection}"]`), row = shop.get(collection, id); for (const input of form.elements) if (input.name) input.value = row[input.name] ?? ''; form.elements.name.focus(); }
      }
    }, false));
    // Button click delegation above does not submit forms; explicit submit
    // handlers provide keyboard/Enter support and preserve browser validation.
    $('posProductForm').onsubmit = guard(async () => {
      const file = $('posProductPhoto').files[0];
      if (file) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1500000) throw Error('Use a PNG, JPEG or WebP image under 1.5 MB.');
        image = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Could not read the sample photo.')); r.readAsDataURL(file); });
      }
      shop.product({ name: $('posProductName').value, sku: $('posProductSku').value, brandId: $('posProductBrand').value, categoryId: $('posProductCategory').value, cost: $('posProductCost').value, price: $('posProductPrice').value, stock: $('posProductStock').value, description: $('posProductDescription').value, image }, editing);
      clearProduct(); render(); prices(); message('Sample product saved. It will disappear on refresh.');
    });
    for (const form of host.querySelectorAll('[data-pos-entity]')) { form.onsubmit = guard(() => { shop.entity(form.dataset.posEntity, Object.fromEntries(new FormData(form)), Number(form.elements.id.value)); form.reset(); render(); message('Sample catalog record saved.'); }); form.onreset = () => { setTimeout(() => { form.elements.id.value = '0'; }, 0); }; }
    $('posSaleLine').onsubmit = guard(() => { shop.quote([{ productId: Number($('posSaleProduct').value), quantity: Number($('posSaleQty').value), unitPrice: $('posSalePrice').value }]); saleCart.push({ productId: Number($('posSaleProduct').value), quantity: Number($('posSaleQty').value), unitPrice: $('posSalePrice').value }); carts(); message('Product added to sample sale.'); });
    $('posPurchaseLine').onsubmit = guard(() => { shop.lines([{ productId: Number($('posPurchaseProduct').value), quantity: Number($('posPurchaseQty').value), unitCost: $('posPurchaseCost').value }], 'purchase'); purchaseCart.push({ productId: Number($('posPurchaseProduct').value), quantity: Number($('posPurchaseQty').value), unitCost: $('posPurchaseCost').value }); carts(); message('Product added to sample purchase.'); });
    $('posPromotionForm').onsubmit=guard(()=>{shop.promotion(Object.fromEntries(new FormData($('posPromotionForm'))));$('posPromotionForm').reset();render();message('Promotion created. Choose it at checkout.');});
    $('posPromotion').addEventListener('change',()=>{if($('posPromotion').value!=='0')$('posDiscount').value='0';$('posDiscount').disabled=$('posPromotion').value!=='0';carts();});
    $('posCheckout').onsubmit = guard(() => { const order = shop.sale(saleCart, { customer: Number(document.getElementById('posSavedCustomer')?.value) ? window.CustomerDemo.get(document.getElementById('posSavedCustomer').value).name : $('posCustomer').value, customerId: document.getElementById('posSavedCustomer')?.value || 0, rewards: window.PosLoyalty?.options()||{}, discount: $('posDiscount').value, promotionId: $('posPromotion').value, taxRate: $('posTax').value, payment: $('posPayment').value, paid: $('posPaid').value }); saleCart = []; $('posCheckout').reset(); $('posDiscount').disabled=false; render(); prices(); message('Sample sale completed; stock reduced. No real payment occurred.'); receipt('sale', order.id); });
    $('posReceivePurchase').onclick = guard(() => { const order = shop.purchase($('posPurchaseSupplier').value, purchaseCart, $('posPurchaseReference').value); purchaseCart = []; $('posPurchaseReference').value = ''; render(); prices(); message(`Sample purchase ${order.id} received; stock increased.`); });
    $('posSaleProduct').onchange = prices; $('posPurchaseProduct').onchange = prices;
    for (const id of ['posDiscount', 'posTax', 'posPayment', 'posPromotion']) $(id).oninput = carts;
    $('posProductSearch').oninput = render;
    $('posTemplate').onclick = () => download('keeperbma-products-template.csv', 'sku,name,brand,category,cost,price,stock,description\r\nDEMO001,Sample tote,Studio Goods,Accessories,4.50,9.00,10,Fictional cotton tote');
    $('posImportCsv').onclick = guard(async () => { const file = $('posCsvFile').files[0]; if (!file || file.size > 1000000) throw Error('Choose a CSV file under 1 MB.'); const count = shop.importCsv(await file.text()); $('posCsvFile').value = ''; render(); prices(); message(`${count} sample product(s) imported. Nothing was uploaded to a server.`); });
    Object.assign(window.PosDemo,{signIn:(staff,pin)=>{shop.signIn(staff,pin);render();},signOut:()=>{shop.signOut();render();},session:()=>shop.session(),points:id=>shop.points(id),setLoyalty:v=>{shop.setLoyalty(v);render();},refreshCart:carts});
    render(); prices();
    if (location.hash === '#demoPos') {
      document.getElementById('btnModeBusiness')?.click(); host.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  });
})();
