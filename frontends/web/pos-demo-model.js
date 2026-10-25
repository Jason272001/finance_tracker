/* Demo-only inventory ledger. Prices are integer cents; nothing is persisted. */
(function (root) {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const clean = (value, limit = 120) => String(value ?? "").trim().slice(0, limit);
  const integer = (value, minimum = 0) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < minimum || n > 10000) throw Error(`Quantity must be a whole number between ${minimum} and 10,000.`);
    return n;
  };
  const cents = value => {
    const n = Number(value);
    if (value === "" || !Number.isFinite(n) || n < 0 || n > 100000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw Error("Use a price from 0 to 100,000 with at most two decimal places.");
    return Math.round(n * 100);
  };
  function parseCsv(text) {
    if (text.length > 1000000) throw Error("CSV must be under 1 MB.");
    text = text.replace(/^\uFEFF/, "");
    const rows = []; let row = [], cell = "", quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; }
        else cell += c;
      } else if (c === ',' || c === '\n' || c === '\r') {
        row.push(cell); cell = ""; closed = false;
        if (c !== ',') { if (c === '\r' && text[i + 1] === '\n') i++; if (row.some(v => v.trim())) rows.push(row); row = []; }
      } else if (c === '"' && !cell && !closed) quoted = true;
      else { if (closed || c === '"') throw Error("Invalid CSV quoting."); cell += c; }
    }
    if (quoted) throw Error("CSV contains an unclosed quoted field.");
    row.push(cell); if (row.some(v => v.trim())) rows.push(row);
    if (rows.length < 2 || rows.length > 501) throw Error("Include a header and 1–500 product rows.");
    const headers = rows.shift().map(h => h.trim().toLowerCase());
    if (new Set(headers).size !== headers.length || !["sku", "name", "price"].every(h => headers.includes(h))) throw Error("CSV needs unique headers including sku, name and price.");
    return rows.map((r, i) => {
      if (r.length !== headers.length) throw Error(`Row ${i + 2} has the wrong number of columns.`);
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    });
  }
  class Shop {
    constructor({requireStaff = false} = {}) {
      this.requireStaff = requireStaff; this.sessions = new Map(); this.deviceId = 'register-1';
      this.next = 1001;
      this.data = {
        promotions: [{id: 1, name: "Welcome offer", code: "WELCOME10", type: "percent", value: 10, minimum: 0, start: "", end: "", enabled: true}],
        loyalty: {earnPerDollar: 1, pointsPerDollar: 100},
        openingPoints: [{customerId:1,points:1000}],
        brands: [{ id: 1, name: "Bean Co" }, { id: 2, name: "Studio Goods" }],
        categories: [{ id: 1, name: "Drinks" }, { id: 2, name: "Accessories" }, { id: 3, name: "Stationery" }],
        suppliers: [{ id: 1, name: "Sample Wholesale", email: "wholesale@example.test", phone: "", address: "Fictional warehouse" }, { id: 2, name: "Sample Paper Supply", email: "paper@example.test", phone: "", address: "" }],
        products: [
          { id: 1, sku: "COF001", name: "Coffee beans · 250g", brandId: 1, categoryId: 1, cost: 700, price: 1250, stock: 20, description: "Fictional medium roast coffee", image: "" },
          { id: 2, sku: "MUG001", name: "Ceramic mug", brandId: 2, categoryId: 2, cost: 600, price: 1500, stock: 8, description: "Fictional reusable mug", image: "" },
          { id: 3, sku: "NOTE001", name: "Pocket notebook", brandId: 2, categoryId: 3, cost: 300, price: 800, stock: 4, description: "Fictional lined notebook", image: "" },
        ],
        purchases: [{ id: "PO-1000", date: new Date().toISOString(), supplier: "Sample Wholesale", supplierId: 1, reference: "Sample opening delivery", total: 20000, items: [{ productId: 1, name: "Coffee beans · 250g", sku: "COF001", quantity: 20, unitCost: 700 }, { productId: 2, name: "Ceramic mug", sku: "MUG001", quantity: 10, unitCost: 600 }] }],
        sales: [{ id: "SALE-1000", date: new Date().toISOString(), customer: "Walk-in sample customer", payment: "cash", status: "completed", subtotal: 3000, discount: 0, tax: 0, total: 3000, paid: 3000, change: 0, items: [{ productId: 2, name: "Ceramic mug", sku: "MUG001", quantity: 2, unitPrice: 1500, unitCost: 600 }] }],
      };
    }
    get operator() { return this.sessions.get(this.deviceId)||null; }
    set operator(value) { if(value)this.sessions.set(this.deviceId,value);else this.sessions.delete(this.deviceId); }
    selectDevice(id) { if(!['register-1','register-2'].includes(id))throw Error('Choose a sample register.');this.deviceId=id; }
    lock() { if(this.operator)this.operator.locked=true; }
    revokeEmployee(id) { for(const [key,s] of this.sessions)if(s.id===Number(id))this.sessions.delete(key); }
    signIn(staff, pin) {
      if(this.operator&&!this.operator.locked)throw Error('Sign out of the current register before signing in another cashier.');
      if(this.operator&&this.operator.id!==staff?.id)throw Error('Unlock with the same staff member, or sign out to switch cashier.');
      if (staff?.id === 'owner') {
        if (String(pin) !== '0000') throw Error('Use the public demo owner PIN 0000.');
        this.operator = {id:'owner', name:'Demo owner', role:'owner', staffCode:staff.staffCode||'90000', branchId:staff.branchId || 1, deviceId:this.deviceId, locked:false};
      } else {
        if (!Number.isSafeInteger(staff?.id) || staff.id<1 || !clean(staff.name) || !Number.isSafeInteger(staff.branchId)) throw Error('Select an existing demo staff member.');
        if (String(pin) !== '1111') throw Error('Use the public demo staff PIN 1111.');
        this.operator = {id:staff.id,name:clean(staff.name),role:'cashier',staffCode:staff.staffCode||String(10000+staff.id),branchId:staff.branchId,deviceId:this.deviceId,locked:false};
      }
      return copy(this.operator);
    }
    signOut() { this.operator = null; }
    session() { return copy(this.operator); }
    requireOperator(owner = false) {
      if (this.requireStaff && (!this.operator || this.operator.locked || (owner && this.operator.role!=='owner'))) throw Error(owner?'Sign in as demo owner to change loyalty rules.':'Sign in to the demo register before completing this action.');
    }
    setLoyalty(values) {
      this.requireOperator(true);
      const earnPerDollar=Number(values.earnPerDollar),pointsPerDollar=Number(values.pointsPerDollar);
      if (!Number.isInteger(earnPerDollar)||earnPerDollar<0||earnPerDollar>1000||!Number.isInteger(pointsPerDollar)||pointsPerDollar<1||pointsPerDollar>100000) throw Error('Use whole numbers: earning 0–1,000 points per dollar; redemption 1–100,000 points per dollar.');
      this.data.loyalty={earnPerDollar,pointsPerDollar};
    }
    points(customerId) {
      return this.data.openingPoints.filter(r=>r.customerId===Number(customerId)).reduce((n,r)=>n+r.points,0)+this.data.sales.filter(s=>s.customerId===Number(customerId)&&s.status==='completed').reduce((n,s)=>n+(s.loyalty?.earned||0)-(s.loyalty?.redeemed||0),0);
    }
    snapshot() { return copy(this.data); }
    get(collection, id) {
      const row = this.data[collection].find(r => r.id === Number(id));
      if (!row) throw Error("Select an existing sample record.");
      return row;
    }
    entity(collection, values, id = 0) {
      if (!["brands", "categories", "suppliers"].includes(collection)) throw Error("Unknown catalog type.");
      const name = clean(values.name, 80);
      if (!name) throw Error("A name is required.");
      if (this.data[collection].some(r => r.id !== Number(id) && r.name.toLowerCase() === name.toLowerCase())) throw Error("That name already exists.");
      const row = { name, ...(collection === "suppliers" ? { email: clean(values.email), phone: clean(values.phone), address: clean(values.address, 300) } : {}) };
      if (id) Object.assign(this.get(collection, id), row);
      else { if (this.data[collection].length >= 100) throw Error("Demo limit: 100 records per list."); this.data[collection].push({ id: ++this.next, ...row }); }
    }
    removeEntity(collection, id) {
      const row = this.get(collection, id);
      const used = collection === "suppliers" ? this.data.purchases.some(p => p.supplierId === row.id) : this.data.products.some(p => p[collection === "brands" ? "brandId" : "categoryId"] === row.id);
      if (used) throw Error("This record is in use. Keep it for the sample history.");
      this.data[collection].splice(this.data[collection].indexOf(row), 1);
    }
    product(values, id = 0) {
      const name = clean(values.name), sku = clean(values.sku, 60);
      if (!name || !sku) throw Error("Product name and SKU are required.");
      if (this.data.products.some(p => p.id !== Number(id) && p.sku.toLowerCase() === sku.toLowerCase())) throw Error(`SKU ${sku} already exists. Edit that product instead.`);
      const brandId = this.get("brands", values.brandId).id, categoryId = this.get("categories", values.categoryId).id;
      const image = String(values.image || "");
      if (image && (!/^data:image\/(png|jpeg|webp);base64,/i.test(image) || image.length > 2000000)) throw Error("Use a PNG, JPEG or WebP image under 1.5 MB.");
      const row = { name, sku, brandId, categoryId, price: cents(values.price), cost: cents(values.cost), stock: integer(values.stock), description: clean(values.description, 2000), image };
      if (this.data.products.reduce((n, p) => n + (p.id === Number(id) ? 0 : p.image.length), 0) + image.length > 14000000) throw Error("Demo image limit reached. Remove some images or restart.");
      if (id) Object.assign(this.get("products", id), row);
      else { if (this.data.products.length >= 500) throw Error("Demo limit: 500 products."); this.data.products.push({ id: ++this.next, ...row }); }
    }
    removeProduct(id) {
      const row = this.get("products", id);
      if ([...this.data.sales, ...this.data.purchases].some(order => order.items.some(item => item.productId === row.id))) throw Error("This product has sample sales/purchase history and cannot be deleted.");
      this.data.products.splice(this.data.products.indexOf(row), 1);
    }
    importCsv(text) {
      const rows = parseCsv(text), before = this.snapshot(), next = this.next;
      try {
        for (const row of rows) {
          const find = (list, name, fallback) => {
            name = clean(name, 80) || fallback;
            let item = this.data[list].find(v => v.name.toLowerCase() === name.toLowerCase());
            if (!item) { this.entity(list, { name }); item = this.data[list].at(-1); }
            return item.id;
          };
          this.product({ ...row, brandId: find("brands", row.brand, "Unbranded"), categoryId: find("categories", row.category, "General"), cost: row.cost || 0, stock: row.stock || 0 });
        }
      } catch (error) { this.data = before; this.next = next; throw error; }
      return rows.length;
    }
    lines(items, kind) {
      if (!items.length || items.length > 100) throw Error("Add 1–100 order lines.");
      return items.map(item => {
        const p = this.get("products", item.productId), quantity = integer(item.quantity, 1);
        return { productId: p.id, name: p.name, sku: p.sku, note:clean(item.note,200), groupId:clean(item.groupId,60), quantity, unitCost: kind === "purchase" ? cents(item.unitCost) : p.cost, ...(kind === "sale" ? { unitPrice: item.unitPrice === undefined ? p.price : cents(item.unitPrice) } : {}) };
      });
    }
    purchase(supplierId, items, reference = "") {
      this.requireOperator();
      const supplier = this.get("suppliers", supplierId), lines = this.lines(items, "purchase"), grouped = new Map();
      for (const line of lines) {
        const group = grouped.get(line.productId) || { quantity: 0, cost: 0 };
        group.quantity += line.quantity; group.cost += line.quantity * line.unitCost; grouped.set(line.productId, group);
      }
      for (const [id, group] of grouped) integer(this.get("products", id).stock + group.quantity);
      for (const [id, group] of grouped) {
        const p = this.get("products", id), stock = p.stock + group.quantity;
        p.cost = Math.round((p.stock * p.cost + group.cost) / stock); p.stock = stock;
      }
      const order = { id: `PO-${++this.next}`, date: new Date().toISOString(), supplier: supplier.name, supplierId: supplier.id, cashier: this.session(), reference: clean(reference, 200), items: lines, total: lines.reduce((n, l) => n + l.quantity * l.unitCost, 0) };
      this.data.purchases.unshift(order); return copy(order);
    }
    promotion(values) {
      const name = clean(values.name,80), code = clean(values.code,30).toUpperCase();
      const value = Number(values.value), minimum = cents(values.minimum || 0);
      const start = clean(values.start,10), end = clean(values.end,10);
      const validDate = d => !d || (/^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d);
      if (!name || !/^[A-Z0-9_-]+$/.test(code)) throw Error("Enter an offer name and a code using letters, numbers, underscores or hyphens.");
      if (this.data.promotions.some(p=>p.code===code)) throw Error("That promotion code already exists.");
      if (!['percent','fixed'].includes(values.type) || !Number.isFinite(value) || value<=0 || (values.type==='percent' && value>100)) throw Error("Use a percentage from 0.01 to 100 or a positive fixed discount.");
      cents(value);
      if (!validDate(start) || !validDate(end) || (start && end && start>end)) throw Error("Use valid dates with the end on or after the start.");
      if (this.data.promotions.length>=100) throw Error("Demo limit: 100 promotions.");
      this.data.promotions.push({id:++this.next,name,code,type:values.type,value,minimum,start,end,enabled:true});
    }
    togglePromotion(id) { const p=this.get('promotions',id); p.enabled=!p.enabled; }
    quote(items, discount = 0, taxRate = 0, promotionId = 0, rewards = {}) {
      const lines = this.lines(items, "sale"), subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0), rate = Number(taxRate);
      let discountCents = cents(discount), promotion = null;
      if (Number(promotionId)) {
        const p = this.get('promotions', promotionId), now = new Date(), today = [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
        if (discountCents) throw Error("Choose one promotion or a manual discount, not both.");
        if (!p.enabled || (p.start && today<p.start) || (p.end && today>p.end)) throw Error("This promotion is inactive or outside its dates.");
        if (subtotal<p.minimum) throw Error("The cart does not meet this promotion's minimum spend.");
        discountCents = Math.min(subtotal,p.type==='percent'?Math.round(subtotal*p.value/100):cents(p.value));
        promotion = copy(p);
      }
      if (discountCents > subtotal || !Number.isFinite(rate) || rate < 0 || rate > 30) throw Error("Discount cannot exceed the subtotal; tax must be between 0% and 30%.");
      const points=Number(rewards.points||0), member=!!rewards.member && Number(rewards.customerId)>0;
      if (!Number.isSafeInteger(points)||points<0) throw Error('Redeem a whole number of points.');
      if (points && (!member || points>this.points(rewards.customerId))) throw Error('Choose an enrolled member with enough available points.');
      if (points && (discountCents || Number(promotionId))) throw Error('Use points or a promotion/manual discount, not both.');
      if (points % this.data.loyalty.pointsPerDollar) throw Error('Redeem points in multiples of '+this.data.loyalty.pointsPerDollar+' (one dollar each).');
      const rewardDiscount=points/this.data.loyalty.pointsPerDollar*100;
      if(rewardDiscount>subtotal) throw Error('Point redemption cannot exceed the subtotal.');
      discountCents+=rewardDiscount;
      const loyalty=member?{earned:Math.floor((subtotal-discountCents)*this.data.loyalty.earnPerDollar/100),redeemed:points,discount:rewardDiscount,rules:copy(this.data.loyalty)}:null;
      const tax = Math.round((subtotal - discountCents) * rate / 100);
      return { items: lines, promotion, loyalty, subtotal, discount: discountCents, tax, total: subtotal - discountCents + tax };
    }
    sale(items, options = {}) {
      this.requireOperator();
      const order = this.quote(items, options.discount || 0, options.taxRate || 0, options.promotionId || 0, options.rewards || {}), quantities = new Map();
      for (const line of order.items) quantities.set(line.productId, (quantities.get(line.productId) || 0) + line.quantity);
      for (const [id, qty] of quantities) if (qty > this.get("products", id).stock) throw Error(`Not enough stock for ${this.get("products", id).name}.`);
      const customerId = Number(options.customerId || 0);
      if (!Number.isSafeInteger(customerId) || customerId < 0) throw Error("Choose a valid sample customer.");
      if(options.rewards?.member && Number(options.rewards.customerId)!==customerId) throw Error("The loyalty member must match the sale customer.");
      const payment = options.payment || "cash";
      if (!["cash", "card"].includes(payment)) throw Error("Choose cash or simulated card.");
      const paid = payment === "card" ? order.total : cents(options.paid);
      if (paid < order.total) throw Error("Cash received must cover the sale total.");
      for (const [id, qty] of quantities) this.get("products", id).stock -= qty;
      Object.assign(order, { id: `SALE-${++this.next}`, date: new Date().toISOString(), industry: options.industry==='restaurant'?'restaurant':'retail', fulfillment:options.industry==='restaurant'&&options.fulfillment==='dine-in'?'Dine-in':options.industry==='restaurant'?'Takeaway':null, cashier: this.session(), customerId: customerId || null, customer: clean(options.customer) || "Walk-in sample customer", payment, paid, change: paid - order.total, status: "completed" });
      this.data.sales.unshift(order); return copy(order);
    }
    voidSale(id) {
      this.requireOperator();
      const sale = this.data.sales.find(s => s.id === id);
      if (!sale || sale.status !== "completed") throw Error("This sale is already void or does not exist.");
      if(sale.loyalty && this.points(sale.customerId)-sale.loyalty.earned+sale.loyalty.redeemed<0) throw Error('These earned points were already spent. Void the redemption sale first.');
      const quantities = new Map();
      for (const item of sale.items) {
        const group = quantities.get(item.productId) || { quantity: 0, cost: 0 };
        group.quantity += item.quantity; group.cost += item.quantity * item.unitCost; quantities.set(item.productId, group);
      }
      for (const [id, group] of quantities) integer(this.get("products", id).stock + group.quantity);
      for (const [id, group] of quantities) {
        const p = this.get("products", id), stock = p.stock + group.quantity;
        p.cost = Math.round((p.stock * p.cost + group.cost) / stock); p.stock = stock;
      }
      sale.status = "void"; sale.voidedBy=this.session();
    }
  }
  const api = { Shop, parseCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PosDemoModel = api;
})(typeof window !== "undefined" ? window : globalThis);
