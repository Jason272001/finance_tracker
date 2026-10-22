/* Shared by the signed-in website, its Android web companion, and the demo. */
(function (root) {
  "use strict";
  const categories = ["YouTube", "TikTok", "Sponsorships", "Freelance", "Digital products", "Software subscriptions", "Equipment", "Marketing"];
  function monthlyReport(transactions, month) {
    const rows = transactions.filter((row) => String(row.date || "").slice(0, 7) === month &&
      ["income", "expense"].includes(String(row.type || row.tx_type || "").toLowerCase()) &&
      Number.isFinite(Number(row.amount)) && Number(row.amount) > 0);
    const sources = new Map();
    let income = 0, expenses = 0;
    rows.forEach((row) => {
      const amount = Math.round(Number(row.amount) * 100);
      if (String(row.type || row.tx_type).toLowerCase() === "income") {
        income += amount;
        const source = String(row.category || "Uncategorized");
        sources.set(source, (sources.get(source) || 0) + amount);
      } else expenses += amount;
    });
    return { rows, income: income / 100, expenses: expenses / 100, net: (income - expenses) / 100,
      sources: [...sources].sort((a, b) => b[1] - a[1]).map(([name, cents]) => [name, cents / 100]) };
  }
  function csvCell(value) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const text = String(value == null ? "" : value);
    return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
  }
  function reportCsv(report) {
    return [["Date", "Type", "Category / source", "Amount", "Note"],
      ...report.rows.map((row) => [row.date, row.type || row.tx_type, row.category, row.amount, row.note]),
      [], ["Income", report.income], ["Expenses", report.expenses], ["Net income", report.net]]
      .map((row) => row.map(csvCell).join(",")).join("\r\n");
  }
  function mount(options) {
    const host = options.host;
    if (!host || host.querySelector(".creator-tools")) return;
    const section = document.createElement("section");
    section.className = "card creator-tools";
    section.id = "creatorReport";
    section.innerHTML = `<div class="section-head"><div><h2>Monthly income & expenses</h2>
      <p class="muted">See what you earned and what you kept. Uses all recorded income and expenses; transfers are excluded.</p></div>
      <label>Report month <input class="creator-month" type="month" aria-label="Report month"></label></div>
      <p class="creator-data-warning muted" role="status"></p>
      <div class="kpi-grid" aria-live="polite"><article class="kpi-card income"><h3>Income</h3><p class="creator-income"></p></article>
      <article class="kpi-card expense"><h3>Expenses</h3><p class="creator-expenses"></p></article>
      <article class="kpi-card"><h3>Net income</h3><p class="creator-net"></p></article></div>
      <p class="muted">This is a cash tracking summary, not a tax or accounting statement. Use the same currency as your dashboard.</p>
      <h3>Income by source</h3><ul class="creator-sources"></ul>
      <button class="creator-export secondary" type="button">Download monthly CSV</button>
      <div class="creator-setup"><h3>Get started</h3><ol class="creator-checklist"></ol>
      <h3>Creator category shortcuts</h3><p class="muted">Add only the categories you need, then select one when recording a transaction.</p>
      <div class="creator-categories row"></div><p class="creator-status muted" role="status"></p></div>`;
    host.prepend(section);
    const find = (selector) => section.querySelector(selector);
    const now = new Date();
    find(".creator-month").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let current;
    const money = options.money || ((value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value));
    function update() {
      const loaded = !options.isLoaded || options.isLoaded();
      current = monthlyReport(options.transactions(), find(".creator-month").value);
      find(".creator-data-warning").textContent = loaded ? "" : "Transactions are unavailable. Refresh to load your report; these are not zero balances.";
      find(".creator-income").textContent = loaded ? money(current.income) : "Unavailable";
      find(".creator-expenses").textContent = loaded ? money(current.expenses) : "Unavailable";
      find(".creator-net").textContent = loaded ? money(current.net) : "Unavailable";
      const sources = find(".creator-sources");
      sources.replaceChildren();
      (loaded && current.sources.length ? current.sources : [[loaded ? "No income recorded for this month" : "Load transactions to see income by source", null]]).forEach(([name, amount]) => {
        const li = document.createElement("li");
        li.textContent = amount === null ? name : `${name}: ${money(amount)}`;
        sources.append(li);
      });
      find(".creator-export").disabled = !loaded || !current.rows.length;
      const checklist = find(".creator-checklist");
      checklist.replaceChildren();
      [[options.hasAccounts(), "Create an account"],
        [options.transactions().some((row) => ["income", "expense"].includes(String(row.type || row.tx_type).toLowerCase())), "Record your first income or expense"],
        [current.rows.length > 0, "Review this month's report"]].forEach(([done, label]) => {
        const li = document.createElement("li");
        li.textContent = `${done ? "✓" : "○"} ${label}`;
        checklist.append(li);
      });
      find(".creator-categories").querySelectorAll("button").forEach((button) => {
        const exists = options.categoryNames().some((name) => name.toLowerCase() === button.dataset.category.toLowerCase());
        button.disabled = exists;
        button.textContent = `${exists ? "✓ " : "+ "}${button.dataset.category}`;
      });
    }
    categories.forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.category = name;
      button.onclick = async () => {
        button.disabled = true;
        try {
          await options.addCategory(name);
          find(".creator-status").textContent = `${name} is ready to use.`;
        } catch (error) {
          find(".creator-status").textContent = `Could not add category: ${error.message || "Please try again."}`;
        } finally { update(); }
      };
      find(".creator-categories").append(button);
    });
    find(".creator-month").onchange = update;
    find(".creator-month").oninput = update;
    find(".creator-export").onclick = async () => {
      const csv = "\uFEFF" + reportCsv(current);
      const filename = `keeperbma-${find(".creator-month").value}.csv`;
      const capacitor = root.Capacitor;
      const status = find(".creator-status");
      if (capacitor && capacitor.getPlatform && capacitor.getPlatform() === "android") {
        const plugin = capacitor.Plugins && capacitor.Plugins.ReportExport;
        if (!plugin || !plugin.saveCsv) {
          status.textContent = "To export a CSV, open keeperbma.com in your browser or install the app update with report export support.";
          return;
        }
        find(".creator-export").disabled = true;
        try {
          const result = await plugin.saveCsv({ csv, filename });
          status.textContent = result && result.cancelled ? "Export cancelled." : "Report saved to your selected location.";
        } catch (error) {
          status.textContent = `Could not save report: ${error.message || "Please try again."}`;
        } finally { update(); }
        return;
      }
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    update();
    return { update };
  }
  const api = { monthlyReport, reportCsv, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CreatorTools = api;
})(typeof window !== "undefined" ? window : globalThis);
