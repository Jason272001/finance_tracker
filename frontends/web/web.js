const $ = (id) => document.getElementById(id);

let state = {
  apiBase: "https://keeperbma-backend.onrender.com",
  userId: 0,
  userName: "",
  accounts: [],
  categories: [],
  tx: [],
  daily: [],
  filteredTx: [],
  authMode: "login",
  charts: { income: null, expense: null, debt: null },
};

function fmtMoney(v) {
  const n = Number(v || 0);
  return `$${n.toFixed(2)}`;
}

function setStatus(id, msg) {
  $(id).textContent = msg;
}

function errMessage(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || String(e);
  if (typeof e.message === "string") return e.message;
  try {
    return JSON.stringify(e);
  } catch (_) {
    return String(e);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  const isLogin = state.authMode === "login";
  $("tabLogin").classList.toggle("active", isLogin);
  $("tabRegister").classList.toggle("active", !isLogin);
  $("authAction").textContent = isLogin ? "Login" : "Register";
  setStatus("authStatus", "");
}

function setScreen(isLoggedIn) {
  $("authScreen").classList.toggle("hidden", isLoggedIn);
  $("appScreen").classList.toggle("hidden", !isLoggedIn);
  $("userBadge").textContent = isLoggedIn ? `Signed in: ${state.userName}` : "";
}

async function api(path, opts = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${state.apiBase}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          state.userId = 0;
          state.userName = "";
          setScreen(false);
          setAuthMode("login");
          throw new Error("Session expired. Please login again.");
        }
        if (res.status >= 500 && attempt < 2) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (e) {
      lastErr = e;
      const msg = errMessage(e);
      if (msg.includes("Failed to fetch") && attempt < 2) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Network error");
}

function renderAccountsTable() {
  const tbody = $("accountsRows");
  const sel = $("txAccount");
  tbody.innerHTML = "";
  sel.innerHTML = "";
  const rows = [...state.accounts].sort((a, b) => String(a.account_name).localeCompare(String(b.account_name)));
  rows.forEach((a) => {
    const tr = document.createElement("tr");
    const vals = [a.account_name || "", a.account_type || "", fmtMoney(a.balance)];
    vals.forEach((v) => {
      const td = document.createElement("td");
      td.textContent = String(v);
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => editAccount(a);
    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.onclick = () => deleteAccount(a);
    actionTd.appendChild(editBtn);
    actionTd.appendChild(document.createTextNode(" "));
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = a.account_id;
    opt.textContent = a.account_name;
    sel.appendChild(opt);
  });
}

function renderCategories() {
  const box = $("categories");
  box.innerHTML = "";
  state.categories.forEach((c) => {
    const chip = document.createElement("span");
    chip.textContent = String(c.category_name || "");
    box.appendChild(chip);
  });
}

function renderTransactions() {
  const tbody = $("txRows");
  tbody.innerHTML = "";
  const accountNameById = new Map(state.accounts.map((a) => [Number(a.account_id), a.account_name]));
  state.tx.forEach((r) => {
    const tr = document.createElement("tr");
    const vals = [
      r.txn_id ?? "",
      r.date ?? "",
      r.type ?? "",
      fmtMoney(r.amount),
      accountNameById.get(Number(r.account_id)) || r.account_id || "",
      r.category ?? "",
      r.note ?? "",
    ];
    vals.forEach((v) => {
      const td = document.createElement("td");
      td.textContent = String(v);
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => editTransaction(r, accountNameById);
    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.onclick = () => deleteTransaction(r);
    actionTd.appendChild(editBtn);
    actionTd.appendChild(document.createTextNode(" "));
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

async function editAccount(acc) {
  const account_name = prompt("Account name:", String(acc.account_name || ""));
  if (account_name === null) return;
  const account_type = prompt("Account type (checking, credit_card, saving, cash, asset):", String(acc.account_type || ""));
  if (account_type === null) return;
  const group_name = prompt("Group name:", String(acc.group || "bank"));
  if (group_name === null) return;
  const balInput = prompt("Balance:", String(acc.balance ?? 0));
  if (balInput === null) return;
  const balance = Number(balInput);
  if (Number.isNaN(balance)) {
    alert("Balance must be a number.");
    return;
  }
  try {
    await api(`/accounts/${acc.account_id}`, {
      method: "PUT",
      body: JSON.stringify({
        user_id: state.userId,
        account_name: account_name.trim(),
        account_type: account_type.trim(),
        group_name: group_name.trim() || "bank",
        balance,
      }),
    });
    await refreshAll();
  } catch (e) {
    alert(`Update account failed: ${errMessage(e)}`);
  }
}

async function deleteAccount(acc) {
  const ok = confirm(`Delete account "${acc.account_name}"?`);
  if (!ok) return;
  try {
    try {
      await api(`/accounts/${acc.account_id}?user_id=${state.userId}`, {
        method: "DELETE",
      });
    } catch (e) {
      if (!String(errMessage(e)).includes("Failed to fetch")) throw e;
      await api(`/accounts/${acc.account_id}/delete?user_id=${state.userId}`, {
        method: "POST",
      });
    }
    await refreshAll();
  } catch (e) {
    alert(`Delete account failed: ${errMessage(e)}`);
  }
}

async function editTransaction(tx, accountNameById) {
  const tx_type = prompt("Type (income or expense):", String(tx.type || "expense"));
  if (tx_type === null) return;
  const amountInput = prompt("Amount:", String(tx.amount ?? 0));
  if (amountInput === null) return;
  const amount = Number(amountInput);
  if (Number.isNaN(amount) || amount < 0) {
    alert("Amount must be 0 or greater.");
    return;
  }
  const currentAccountName = accountNameById.get(Number(tx.account_id)) || String(tx.account_id || "");
  const accountInput = prompt("Account ID:", String(tx.account_id || ""));
  if (accountInput === null) return;
  const account_id = Number(accountInput);
  if (Number.isNaN(account_id) || account_id <= 0) {
    alert(`Account ID must be a positive number. Current account: ${currentAccountName}`);
    return;
  }
  const category = prompt("Category:", String(tx.category || ""));
  if (category === null) return;
  const note = prompt("Note:", String(tx.note || ""));
  if (note === null) return;
  try {
    await api(`/transactions/${tx.txn_id}`, {
      method: "PUT",
      body: JSON.stringify({
        user_id: state.userId,
        tx_type: tx_type.trim().toLowerCase(),
        amount,
        account_id,
        category: category.trim(),
        note: note.trim(),
      }),
    });
    await refreshAll();
  } catch (e) {
    alert(`Update transaction failed: ${errMessage(e)}`);
  }
}

async function deleteTransaction(tx) {
  const ok = confirm(`Delete transaction #${tx.txn_id}?`);
  if (!ok) return;
  try {
    try {
      await api(`/transactions/${tx.txn_id}?user_id=${state.userId}`, {
        method: "DELETE",
      });
    } catch (e) {
      if (!String(errMessage(e)).includes("Failed to fetch")) throw e;
      await api(`/transactions/${tx.txn_id}/delete?user_id=${state.userId}`, {
        method: "POST",
      });
    }
    await refreshAll();
  } catch (e) {
    alert(`Delete transaction failed: ${errMessage(e)}`);
  }
}

function sumByKey(rows, keyFn, valueFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    const v = Number(valueFn(r) || 0);
    m.set(k, (m.get(k) || 0) + v);
  });
  return m;
}

function chartColors(n) {
  const palette = ["#1f7ae0", "#2fbf71", "#ffb02f", "#e05374", "#6f63ff", "#20b7c7", "#9b59b6", "#f39c12"];
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(palette[i % palette.length]);
  return out;
}

function inDateRange(dateText, startDate, endDate) {
  const d = String(dateText || "").slice(0, 10);
  if (!d) return false;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

function applyTxRange() {
  const start = $("sumStart").value || "";
  const end = $("sumEnd").value || "";
  state.filteredTx = state.tx.filter((t) => inDateRange(t.date, start, end));
}

function upsertPieChart(id, chartKey, labelMap) {
  const labels = [...labelMap.keys()];
  const data = labels.map((k) => Number(labelMap.get(k) || 0));
  const ctx = $(id);
  if (!ctx) return;
  if (state.charts[chartKey]) state.charts[chartKey].destroy();
  state.charts[chartKey] = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: chartColors(labels.length),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function renderKpisAndCharts() {
  const txForSummary = state.filteredTx.length > 0 || $("sumStart").value || $("sumEnd").value
    ? state.filteredTx
    : state.tx;
  const totalIncome = txForSummary
    .filter((t) => String(t.type).toLowerCase() === "income")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalExpense = txForSummary
    .filter((t) => String(t.type).toLowerCase() === "expense")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const netWorth = state.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const debt = state.accounts
    .filter((a) => ["credit", "credit_card"].includes(String(a.account_type || "").toLowerCase()))
    .reduce((s, a) => s + Math.abs(Number(a.balance || 0)), 0);

  $("kpiNetWorth").textContent = fmtMoney(netWorth);
  $("kpiDebt").textContent = fmtMoney(debt);
  $("kpiIncome").textContent = fmtMoney(totalIncome);
  $("kpiExpense").textContent = fmtMoney(totalExpense);

  const incomeByCat = sumByKey(
    txForSummary.filter((t) => String(t.type).toLowerCase() === "income"),
    (r) => String(r.category || "Other"),
    (r) => r.amount,
  );
  const expenseByCat = sumByKey(
    txForSummary.filter((t) => String(t.type).toLowerCase() === "expense"),
    (r) => String(r.category || "Other"),
    (r) => r.amount,
  );
  const debtByAccount = sumByKey(
    state.accounts.filter((a) => ["credit", "credit_card"].includes(String(a.account_type || "").toLowerCase())),
    (r) => String(r.account_name || "Credit"),
    (r) => Math.abs(Number(r.balance || 0)),
  );

  upsertPieChart("incomeChart", "income", incomeByCat);
  upsertPieChart("expenseChart", "expense", expenseByCat);
  upsertPieChart("debtChart", "debt", debtByAccount);
}

function renderDailySummary() {
  const rows = $("dailyRows");
  rows.innerHTML = "";
  const txByDay = new Map();
  const txForSummary = state.filteredTx.length > 0 || $("sumStart").value || $("sumEnd").value
    ? state.filteredTx
    : state.tx;
  txForSummary.forEach((t) => {
    const dateKey = String(t.date || "").slice(0, 10);
    if (!dateKey) return;
    const rec = txByDay.get(dateKey) || { income: 0, expense: 0 };
    if (String(t.type).toLowerCase() === "income") rec.income += Number(t.amount || 0);
    if (String(t.type).toLowerCase() === "expense") rec.expense += Number(t.amount || 0);
    txByDay.set(dateKey, rec);
  });

  const snapshotByDay = sumByKey(
    state.daily,
    (d) => String(d.date || "").slice(0, 10),
    (d) => Number(d.balance || 0),
  );

  const allDates = new Set([...txByDay.keys(), ...snapshotByDay.keys()]);
  const sorted = [...allDates].sort((a, b) => (a < b ? 1 : -1));
  sorted.forEach((dateKey) => {
    const rec = txByDay.get(dateKey) || { income: 0, expense: 0 };
    const snap = Number(snapshotByDay.get(dateKey) || 0);
    const tr = document.createElement("tr");
    const vals = [
      dateKey,
      fmtMoney(rec.income),
      fmtMoney(rec.expense),
      fmtMoney(rec.income - rec.expense),
      fmtMoney(snap),
    ];
    vals.forEach((v) => {
      const td = document.createElement("td");
      td.textContent = String(v);
      tr.appendChild(td);
    });
    rows.appendChild(tr);
  });
}

async function downloadSummaryPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library failed to load.");
    return;
  }
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF("p", "pt", "a4");
  const txForSummary = state.filteredTx.length > 0 || $("sumStart").value || $("sumEnd").value
    ? state.filteredTx
    : state.tx;
  const totalIncome = txForSummary
    .filter((t) => String(t.type).toLowerCase() === "income")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalExpense = txForSummary
    .filter((t) => String(t.type).toLowerCase() === "expense")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const netWorth = state.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const debt = state.accounts
    .filter((a) => ["credit", "credit_card"].includes(String(a.account_type || "").toLowerCase()))
    .reduce((s, a) => s + Math.abs(Number(a.balance || 0)), 0);

  const start = $("sumStart").value || "All";
  const end = $("sumEnd").value || "All";
  doc.setFontSize(22);
  doc.text("KeeperBMA Summary Report", 36, 44);
  doc.setFontSize(11);
  doc.text(`Range: ${start} to ${end}`, 36, 64);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 36, 80);

  doc.setFontSize(12);
  doc.text(`Net Worth: ${fmtMoney(netWorth)}`, 36, 110);
  doc.text(`Debt: ${fmtMoney(debt)}`, 220, 110);
  doc.text(`Income: ${fmtMoney(totalIncome)}`, 36, 130);
  doc.text(`Expense: ${fmtMoney(totalExpense)}`, 220, 130);

  const incomeImg = state.charts.income ? state.charts.income.toBase64Image() : null;
  const expenseImg = state.charts.expense ? state.charts.expense.toBase64Image() : null;
  const debtImg = state.charts.debt ? state.charts.debt.toBase64Image() : null;
  if (incomeImg) doc.addImage(incomeImg, "PNG", 36, 160, 165, 165);
  if (expenseImg) doc.addImage(expenseImg, "PNG", 220, 160, 165, 165);
  if (debtImg) doc.addImage(debtImg, "PNG", 404, 160, 165, 165);

  let y = 350;
  doc.setFontSize(13);
  doc.text("Transactions", 36, y);
  y += 16;
  doc.setFontSize(10);
  doc.text("Date", 36, y);
  doc.text("Type", 145, y);
  doc.text("Amount", 220, y);
  doc.text("Category", 300, y);
  doc.text("Note", 420, y);
  y += 10;
  doc.line(36, y, 560, y);
  y += 14;

  txForSummary.slice(0, 25).forEach((t) => {
    if (y > 790) {
      doc.addPage();
      y = 50;
    }
    doc.text(String(t.date || "").slice(0, 10), 36, y);
    doc.text(String(t.type || ""), 145, y);
    doc.text(fmtMoney(t.amount), 220, y);
    doc.text(String(t.category || "").slice(0, 16), 300, y);
    doc.text(String(t.note || "").slice(0, 22), 420, y);
    y += 14;
  });

  doc.save("keeperbma-summary.pdf");
}

async function refreshAll() {
  const results = await Promise.allSettled([
    api(`/accounts?user_id=${state.userId}`),
    api(`/categories?user_id=${state.userId}`),
    api(`/transactions?user_id=${state.userId}`),
    api(`/daily_balances?user_id=${state.userId}`),
  ]);

  const [accountsRes, categoriesRes, txRes, dailyRes] = results;
  state.accounts = accountsRes.status === "fulfilled" ? (accountsRes.value || []) : [];
  state.categories = categoriesRes.status === "fulfilled" ? (categoriesRes.value || []) : [];
  state.tx = txRes.status === "fulfilled" ? (txRes.value || []) : [];
  state.daily = dailyRes.status === "fulfilled" ? (dailyRes.value || []) : [];
  applyTxRange();

  renderAccountsTable();
  renderCategories();
  renderTransactions();
  renderKpisAndCharts();
  renderDailySummary();

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    setStatus("health", `Some data failed to load: ${errMessage(failures[0].reason)}`);
  } else {
    setStatus("health", "Loaded successfully");
  }
}

window.addEventListener("load", async () => {
  $("tabLogin").onclick = () => setAuthMode("login");
  $("tabRegister").onclick = () => setAuthMode("register");

  $("authAction").onclick = async () => {
    try {
      const payload = {
        name: $("loginName").value.trim(),
        password: $("loginPass").value,
      };
      if (!payload.name || !payload.password) {
        setStatus("authStatus", "Name and password are required.");
        return;
      }
      if (state.authMode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStatus("authStatus", "Registered. You can login now.");
        setAuthMode("login");
        return;
      }

      const out = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.userId = Number(out.user_id);
      state.userName = String(out.name || `user-${out.user_id}`);
      setScreen(true);
      setStatus("authStatus", "");
      await refreshAll();
    } catch (e) {
      setStatus("authStatus", `Login failed: ${errMessage(e)}`);
    }
  };

  $("btnLogout").onclick = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (_) {}
    state.userId = 0;
    state.userName = "";
    state.accounts = [];
    state.categories = [];
    state.tx = [];
    state.daily = [];
    setScreen(false);
    setAuthMode("login");
    setStatus("authStatus", "");
  };

  $("btnAddAccount").onclick = async () => {
    try {
      await api("/accounts", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.userId,
          account_name: $("accName").value.trim(),
          account_type: $("accType").value,
          group_name: $("accGroup").value.trim() || "bank",
          balance: Number($("accBal").value || 0),
        }),
      });
      $("accName").value = "";
      $("accBal").value = "0";
      await refreshAll();
    } catch (e) {
      alert(`Add account failed: ${errMessage(e)}`);
    }
  };

  $("btnAddCategory").onclick = async () => {
    try {
      await api("/categories", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.userId,
          category_name: $("catName").value.trim(),
        }),
      });
      $("catName").value = "";
      await refreshAll();
    } catch (e) {
      alert(`Add category failed: ${errMessage(e)}`);
    }
  };

  $("btnAddTx").onclick = async () => {
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.userId,
          tx_type: $("txType").value,
          amount: Number($("txAmount").value || 0),
          account_id: Number($("txAccount").value),
          category: $("txCategory").value.trim(),
          note: $("txNote").value.trim(),
        }),
      });
      $("txAmount").value = "";
      $("txCategory").value = "";
      $("txNote").value = "";
      await refreshAll();
    } catch (e) {
      alert(`Add transaction failed: ${errMessage(e)}`);
    }
  };

  $("btnApplySummary").onclick = () => {
    applyTxRange();
    renderKpisAndCharts();
    renderDailySummary();
  };
  $("btnResetSummary").onclick = () => {
    $("sumStart").value = "";
    $("sumEnd").value = "";
    applyTxRange();
    renderKpisAndCharts();
    renderDailySummary();
  };
  $("btnDownloadPdf").onclick = downloadSummaryPdf;

  setAuthMode("login");
  setScreen(false);

  // Restore cookie session if still valid.
  try {
    const session = await api("/auth/session");
    state.userId = Number(session.user_id);
    state.userName = String(session.name || `user-${session.user_id}`);
    setScreen(true);
    await refreshAll();
  } catch (_) {
    setScreen(false);
  }
});
