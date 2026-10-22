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
    constructor() {
      this.next = 1001;
      this.data = {
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
        return { productId: p.id, name: p.name, sku: p.sku, quantity, unitCost: kind === "purchase" ? cents(item.unitCost) : p.cost, ...(kind === "sale" ? { unitPrice: item.unitPrice === undefined ? p.price : cents(item.unitPrice) } : {}) };
      });
    }
    purchase(supplierId, items, reference = "") {
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
      const order = { id: `PO-${++this.next}`, date: new Date().toISOString(), supplier: supplier.name, supplierId: supplier.id, reference: clean(reference, 200), items: lines, total: lines.reduce((n, l) => n + l.quantity * l.unitCost, 0) };
      this.data.purchases.unshift(order); return copy(order);
    }
    quote(items, discount = 0, taxRate = 0) {
      const lines = this.lines(items, "sale"), subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0), discountCents = cents(discount), rate = Number(taxRate);
      if (discountCents > subtotal || !Number.isFinite(rate) || rate < 0 || rate > 30) throw Error("Discount cannot exceed the subtotal; tax must be between 0% and 30%.");
      const tax = Math.round((subtotal - discountCents) * rate / 100);
      return { items: lines, subtotal, discount: discountCents, tax, total: subtotal - discountCents + tax };
    }
    sale(items, options = {}) {
      const order = this.quote(items, options.discount || 0, options.taxRate || 0), quantities = new Map();
      for (const line of order.items) quantities.set(line.productId, (quantities.get(line.productId) || 0) + line.quantity);
      for (const [id, qty] of quantities) if (qty > this.get("products", id).stock) throw Error(`Not enough stock for ${this.get("products", id).name}.`);
      const payment = options.payment || "cash";
      if (!["cash", "card"].includes(payment)) throw Error("Choose cash or simulated card.");
      const paid = payment === "card" ? order.total : cents(options.paid);
      if (paid < order.total) throw Error("Cash received must cover the sale total.");
      for (const [id, qty] of quantities) this.get("products", id).stock -= qty;
      Object.assign(order, { id: `SALE-${++this.next}`, date: new Date().toISOString(), customer: clean(options.customer) || "Walk-in sample customer", payment, paid, change: paid - order.total, status: "completed" });
      this.data.sales.unshift(order); return copy(order);
    }
    voidSale(id) {
      const sale = this.data.sales.find(s => s.id === id);
      if (!sale || sale.status !== "completed") throw Error("This sale is already void or does not exist.");
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
      sale.status = "void";
    }
  }
  const api = { Shop, parseCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PosDemoModel = api;
})(typeof window !== "undefined" ? window : globalThis);
