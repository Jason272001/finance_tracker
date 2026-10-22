/* Memory-only adapter for the real app screens. No network or persistent storage. */
(function () {
  "use strict";
  if (!document.documentElement.dataset.demo) return;
  const embedded = window.parent !== window && window.parent.KeeperDemo;
  const clone = value => JSON.parse(JSON.stringify(value));
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const now = new Date(), memory = new Map();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const date = day => `${month}-${String(day).padStart(2, "0")}T12:00:00`;
  const storage = { getItem: key => memory.get(String(key)) ?? null, setItem: (key, value) => memory.set(String(key), String(value)), removeItem: key => memory.delete(String(key)), clear: () => memory.clear() };
  const profile = { user_id: 1, name: "Sample creator", email: "creator@example.test", phone: "+1 202 555 0123", email_notifications_enabled: false, profile_image_url: "" };
  const permissions = { can_sales: true, can_purchase: true, can_inventory: true, can_reports: true, can_customers: true, can_suppliers: true, can_settings: true };
  const subscription = { plan_code: "premium_plus", subscription_status: "active", billing_cycle: "monthly", billing_provider: "demo", billing_subscription_id: "demo_subscription", billing_customer_id: "demo_customer", access_active: true, access_reason: "Demo only — all working tools unlocked. No real subscription.", feature_flags: { bank_sync: true, business_profile: true, business_tools: true, employee_management: true }, is_lifetime: false, plan_with_website: true };
  const accounts = [
    { account_id: 1, account_name: "Sample checking", account_type: "asset", balance: 800, group_name: "bank", bank_linked: false },
    { account_id: 2, account_name: "Sample savings", account_type: "saving", balance: 250, group_name: "bank", bank_linked: false },
    { account_id: 3, account_name: "Sample credit card", account_type: "credit", balance: 80, group_name: "debt", bank_linked: false },
  ];
  const transactions = [
    { txn_id: 1, account_id: 1, date: date(2), type: "income", category: "YouTube", amount: 120, note: "Sample creator payout", origin: "manual" },
    { txn_id: 2, account_id: 1, date: date(5), type: "income", category: "Freelance", amount: 250, note: "Sample editing project", origin: "manual" },
    { txn_id: 3, account_id: 1, date: date(6), type: "expense", category: "Software subscriptions", amount: 25, note: "Sample software", origin: "manual" },
    { txn_id: 4, account_id: 1, date: date(7), type: "expense", category: "Equipment", amount: 45, note: "Sample microphone", origin: "manual" },
  ];
  const categories = ["YouTube", "Freelance", "Software subscriptions", "Equipment", "Sponsorships", "Marketing"].map((name, i) => ({ category_id: i + 1, category_name: name }));
  const businesses = [{ business_id: 1, business_name: "Sample Creator Studio", business_type: "service", industry: "Content creation", email: "studio@example.test", address: "Fictional sample address", page_slug: "sample-studio", website_slug: "sample-studio", about_text: "A fictional business for exploring KeeperBMA.", is_owner: true, permissions, page_enabled: true, website_enabled: true }];
  const employees = [{ employee_id: 1, business_id: 1, employee_name: "Sample assistant", email: "assistant@example.test", role_code: "staff", status: "active", permissions: { ...permissions } }];
  const connections = [], linked = [];
  let serial = 10, bankSynced = false;
  const text = (value, limit = 200) => String(value || "").trim().slice(0, limit);
  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > 10000000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw Error("Use a valid amount with at most two decimal places.");
    return round(n);
  }
  function account(id, manual = false) {
    const row = accounts.find(item => item.account_id === Number(id));
    if (!row) throw Error("Choose a sample account.");
    if (manual && row.bank_linked) throw Error("Linked sample balances are managed by simulated bank sync.");
    return row;
  }
  function post(row, reverse = false) {
    const target = account(row.account_id);
    const sign = (row.type === "income" ? 1 : -1) * (target.account_type === "credit" ? -1 : 1) * (reverse ? -1 : 1);
    target.balance = round(target.balance + row.amount * sign);
  }
  const fields = (body, names) => Object.fromEntries(names.filter(key => key in body).map(key => [key, typeof body[key] === "boolean" ? body[key] : text(body[key], key === "about_text" ? 2000 : 200)]));
  async function request(path, options = {}) {
    // Unknown actions fail closed. No real API fallback exists.
    if (!String(path).startsWith("/") || String(path).startsWith("//")) throw Error("Only local demo actions are available.");
    const p = new URL(path, "https://demo.invalid").pathname;
    const method = String(options.method || "GET").toUpperCase(), write = method !== "GET";
    const body = options.body ? JSON.parse(options.body) : {};
    let match;
    function run() {
      if (p === "/ready") return { ok: true, storage: "sql", demo: true };
      if (p === "/auth/session") return { ...profile, ...subscription };
      if (p === "/auth/logout") return { ok: true };
      if (p === "/profile/password") return { ok: true, message: "Demo password change simulated." };
      if (p === "/profile") {
        if (write) {
          Object.assign(profile, fields(body, ["name", "email", "phone", "email_notifications_enabled"]));
          if (body.profile_image_url === "" || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(body.profile_image_url || "")) profile.profile_image_url = String(body.profile_image_url).slice(0, 2000000);
        }
        return profile;
      }
      if (p === "/billing/subscription") {
        if (write) {
          if (!["basic", "regular", "business", "premium_plus"].includes(body.plan_code)) throw Error("Choose a sample plan.");
          subscription.plan_code = body.plan_code; subscription.subscription_status = "active";
          subscription.billing_cycle = storage.getItem("keeperbma_billing_cycle") || "monthly";
        }
        return subscription;
      }
      if (p === "/billing/config") return { stripe_enabled: false, embedded_checkout_enabled: false };
      if (p === "/billing/plans") return { plans: [] };
      if (p === "/billing/cancel") { subscription.subscription_status = "canceled"; return { ok: true, message: "Demo cancellation simulated. No real subscription, charge or refund exists." }; }
      if (p === "/accounts/transfer") {
        const from = account(body.from_account_id, true), to = account(body.to_account_id, true), amount = money(body.amount);
        if (from === to || amount <= 0) throw Error("Choose different accounts and a positive amount.");
        if (transactions.length > 198) throw Error("Restart the demo to add more sample records.");
        post({ account_id: from.account_id, amount, type: "expense" }); post({ account_id: to.account_id, amount, type: "income" });
        for (const target of [from, to]) transactions.push({ txn_id: ++serial, account_id: target.account_id, amount, type: "transfer", category: "Transfer", date: text(body.date) || date(now.getDate()), note: text(body.note) || "Sample transfer", origin: "manual" });
        return { ok: true };
      }
      if (p === "/accounts" && !write) return accounts;
      if (p === "/accounts" || (match = p.match(/^\/accounts\/(\d+)(?:\/delete)?$/))) {
        const existing = match ? account(match[1]) : null;
        if (method === "DELETE" || p.endsWith("/delete")) {
          if (existing.bank_linked || transactions.some(row => row.account_id === existing.account_id)) throw Error("Remove sample history or disconnect the sample bank before deleting this account.");
          accounts.splice(accounts.indexOf(existing), 1);
        } else {
          if (existing?.bank_linked) throw Error("Use simulated sync to update linked sample accounts.");
          if (!text(body.account_name) || !["asset", "saving", "credit"].includes(body.account_type)) throw Error("Enter a name and choose an account type.");
          const values = { account_name: text(body.account_name), account_type: body.account_type, balance: money(body.balance), group_name: text(body.group_name), bank_linked: false };
          if (existing) Object.assign(existing, values);
          else { if (accounts.length >= 50) throw Error("Restart the demo to add more accounts."); accounts.push({ account_id: ++serial, ...values }); }
        }
        return { ok: true };
      }
      if (p === "/categories") {
        if (write) {
          const name = text(body.category_name, 120);
          if (!name) throw Error("Enter a category name.");
          if (categories.length >= 100) throw Error("Restart the demo to add more categories.");
          if (!categories.some(row => row.category_name.toLowerCase() === name.toLowerCase())) categories.push({ category_id: ++serial, category_name: name });
        }
        return categories;
      }
      if (p === "/transactions" && !write) return transactions;
      if (p === "/transactions" || (match = p.match(/^\/transactions\/(\d+)(?:\/delete)?$/))) {
        const existing = match ? transactions.find(row => row.txn_id === Number(match[1])) : null;
        if (match && !existing) throw Error("Sample transaction not found.");
        if (existing && (existing.type === "transfer" || existing.origin === "bank")) throw Error("Reverse transfers or use simulated sync to change imported history.");
        if (method === "DELETE" || p.endsWith("/delete")) { post(existing, true); transactions.splice(transactions.indexOf(existing), 1); }
        else {
          const target = account(body.account_id, true), amount = money(body.amount), when = text(body.date) || date(now.getDate());
          if (!["income", "expense"].includes(body.tx_type) || amount <= 0 || !Number.isFinite(Date.parse(when))) throw Error("Choose a valid date, type and positive amount.");
          if (!existing && transactions.length >= 200) throw Error("Restart the demo to add more transactions.");
          const values = { account_id: target.account_id, date: when, type: body.tx_type, amount, category: text(body.category), note: text(body.note, 2000), origin: "manual" };
          if (existing) { post(existing, true); Object.assign(existing, values); post(existing); }
          else { const row = { txn_id: ++serial, ...values }; post(row); transactions.push(row); }
        }
        return { ok: true };
      }
      if (p === "/daily_balances") return [{ date: date(now.getDate()).slice(0, 10), balance: round(accounts.reduce((total, row) => total + (row.account_type === "credit" ? -row.balance : row.balance), 0)) }];
      if (p === "/bank/connections") return connections;
      if (p === "/bank/accounts") return linked;
      if (/^\/bank\/connections\/\d+$/.test(p) && method === "DELETE") {
        for (const row of linked) account(row.keeper_account_id).bank_linked = false;
        connections.length = 0; linked.length = 0; bankSynced = false; return { ok: true };
      }
      if (p === "/bank/plaid/link-token") return { link_token: "demo_only" };
      if (p === "/bank/plaid/exchange") {
        if (!connections.length) {
          const keeper = { account_id: ++serial, account_name: "Sample Bank checking", account_type: "asset", group_name: "bank", balance: 420, bank_linked: true };
          accounts.push(keeper); connections.push({ connection_id: 1, institution_name: "Sample Bank — simulated", provider: "demo", status: "active" });
          linked.push({ linked_account_id: 1, connection_id: 1, keeper_account_id: keeper.account_id, keeper_account_name: keeper.account_name, account_name: keeper.account_name, current_balance: 420, currency_code: "USD", institution_name: "Sample Bank — simulated", mask: "0000" });
        }
        return { ok: true };
      }
      if (p === "/bank/plaid/sync") {
        if (!connections.length) throw Error("Connect the fictional Sample Bank first.");
        if (!bankSynced) {
          const id = linked[0].keeper_account_id;
          transactions.push({ txn_id: ++serial, account_id: id, date: date(8), type: "income", amount: 32, category: "Freelance", note: "Simulated bank deposit", origin: "bank" }, { txn_id: ++serial, account_id: id, date: date(9), type: "expense", amount: 12, category: "Software subscriptions", note: "Simulated bank expense", origin: "bank" });
          bankSynced = true; return { imported: 2, transactions_created: 2 };
        }
        return { imported: 0, transactions_created: 0 };
      }
      if (p === "/businesses" && !write) return { items: businesses };
      if (p === "/businesses" || (match = p.match(/^\/businesses\/(\d+)$/))) {
        const values = fields(body, ["business_name", "business_type", "industry", "email", "phone", "address", "page_slug", "website_slug", "logo_url", "cover_url", "about_text", "page_enabled", "website_enabled"]);
        if (!values.business_name) throw Error("Enter a business name.");
        const existing = match && businesses.find(row => row.business_id === Number(match[1]));
        if (existing) Object.assign(existing, values);
        else { if (businesses.length >= 10) throw Error("Restart the demo to add more businesses."); businesses.push({ business_id: ++serial, ...values, is_owner: true, permissions }); }
        return { ok: true };
      }
      if ((match = p.match(/^\/businesses\/(\d+)\/employees(?:\/(\d+))?$/))) {
        const businessId = Number(match[1]), employeeId = Number(match[2]);
        if (!write) return { items: employees.filter(row => row.business_id === businessId) };
        const existing = employees.find(row => row.employee_id === employeeId && row.business_id === businessId);
        if (method === "DELETE") { if (existing) employees.splice(employees.indexOf(existing), 1); }
        else {
          const values = fields(body, ["employee_name", "email", "phone", "role_code", "status", ...Object.keys(permissions)]);
          values.permissions = Object.fromEntries(Object.keys(permissions).map(key => [key, Boolean(body[key])]));
          if (!values.employee_name) throw Error("Enter a sample employee name.");
          if (existing) Object.assign(existing, values);
          else { if (employees.length >= 50) throw Error("Restart the demo to add more employees."); employees.push({ employee_id: ++serial, business_id: businessId, ...values }); }
        }
        return { ok: true };
      }
      if (p === "/support/chat") return { reply: "Demo support response — no message was sent to a person or AI service. Try adding a transaction, transferring money, exploring Business, or opening Settings. Refresh to start over.", topic_title: "Simulated support", steps: ["Explore using the demo section menu.", "All data is fictional and resets on refresh."], suggestions: ["How do I add income?", "How do I view my report?"] };
      throw Error("This action is unavailable in the demo. No real request was sent.");
    }
    return clone(run());
  }
  window.KeeperDemo = embedded || { request, storage };
  function dialog(title, description, label, action) {
    const box = document.createElement("dialog"); box.className = "demo-dialog";
    const heading = document.createElement("h2"); heading.textContent = title;
    const copy = document.createElement("p"); copy.textContent = description;
    const buttons = document.createElement("div"); buttons.className = "row";
    if (action) {
      const confirm = document.createElement("button"); confirm.type = "button"; confirm.textContent = label;
      confirm.onclick = async () => { confirm.disabled = true; try { await action(); box.close(); } catch (error) { copy.textContent = error.message; confirm.disabled = false; } }; buttons.append(confirm);
    }
    const close = document.createElement("button"); close.type = "button"; close.className = "secondary"; close.textContent = "Close"; close.onclick = () => box.close();
    buttons.append(close); box.append(heading, copy, buttons); document.body.append(box);
    box.addEventListener("close", () => box.remove()); box.showModal();
  }
  function settings() {
    const box = document.createElement("dialog"); box.className = "demo-settings-dialog";
    const close = document.createElement("button"); close.className = "secondary"; close.textContent = "Back to demo workspace";
    const frame = document.createElement("iframe"); frame.title = "Demo settings and billing";
    frame.srcdoc = JSON.parse(document.getElementById("demoSettingsMarkup").textContent);
    close.onclick = () => box.close(); box.append(close, frame); document.body.append(box);
    window.KeeperDemo.closeSettings = () => box.close();
    box.addEventListener("close", () => {
      box.remove(); window.KeeperDemo.closeSettings = null;
      if (typeof window.applyTheme === "function") window.applyTheme(window.KeeperDemo.storage.getItem("keeperbma_theme") || "light");
      if (typeof window.applyLanguage === "function") window.applyLanguage(window.KeeperDemo.storage.getItem("keeperbma_lang") || "en");
      if (typeof window.refreshAll === "function") window.refreshAll();
    }); box.showModal();
  }
  window.Plaid = { create: options => ({ open: () => dialog("Simulated bank connection", "This is a fictional bank. Do not enter real bank details. No Plaid or bank request is made.", "Connect Sample Bank", () => options.onSuccess("demo_public_token")), destroy: () => {} }) };
  document.addEventListener("click", event => {
    const target = event.target.closest("button, a"); if (!target) return;
    const id = target.id, section = target.dataset.demoSection;
    const intercept = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (target.hasAttribute("data-demo-share")) {
      intercept();
      const url = new URL("./demo.html", location.href).href;
      const status = document.querySelector(".demo-notice");
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { status.textContent = "Demo link copied. Your sample changes are not included."; }).catch(() => { status.textContent = `Demo link: ${url}`; });
      else status.textContent = `Demo link: ${url}`;
      return;
    }
    if (target.hasAttribute("data-demo-reset") || id === "btnLogout") { intercept(); if (embedded) window.parent.location.reload(); else location.reload(); return; }
    if (["btnOpenSettings", "btnResolveBilling"].includes(id) || section === "settings") { intercept(); settings(); return; }
    if (id === "btnBackDashboard") { intercept(); if (embedded && window.parent.KeeperDemo.closeSettings) window.parent.KeeperDemo.closeSettings(); else location.href = "./demo.html"; return; }
    if (id === "btnOpenBillingPortal") { intercept(); dialog("Simulated billing portal", "No real payment method or subscription exists. Try plan selection and cancellation on this screen; they change only the sample account."); return; }
    if (id === "btnEmailSupport") { intercept(); document.querySelector(".demo-notice").textContent = "Demo email simulated. No email was sent or opened."; return; }
    if (section) {
      intercept(); if (section === "support") { document.getElementById("supportLauncher")?.click(); return; }
      document.getElementById(["businessWorkspace", "demoPos", "demoBusinessHub"].includes(section) ? "btnModeBusiness" : "btnModePersonal")?.click();
      document.getElementById(section)?.scrollIntoView({ behavior: "auto", block: "start" }); return;
    }
    const href = String(target.getAttribute("href") || "");
    if (target.tagName === "A" && !target.hasAttribute("data-demo-exit") && !target.hasAttribute("download") && !href.startsWith("#") && !href.startsWith("blob:")) {
      intercept(); dialog("Demo preview", "This link does not open a real account, business site or external service in the demo. Planned modules are not available yet. Use Leave demo to visit the public website.");
    }
  }, true);
  document.addEventListener("DOMContentLoaded", () => {
    const status = document.getElementById("passwordStatus"); if (status) status.textContent = "Use made-up passwords only. Password changes here are simulated.";
    for (const input of document.querySelectorAll('input[type="password"]')) input.autocomplete = "off";
  });
})();
