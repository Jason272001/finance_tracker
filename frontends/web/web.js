const $ = (id) => document.getElementById(id);

let state = {
  apiBase: "https://keeperbma-backend.onrender.com",
  userId: Number(localStorage.getItem("keeperbma_user_id") || 0),
  userName: localStorage.getItem("keeperbma_user_name") || "",
  accounts: [],
  authMode: "login",
};

function setStatus(id, msg) {
  $(id).textContent = msg;
}

async function api(path, opts = {}) {
  const url = `${state.apiBase}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function renderAccounts() {
  const ul = $("accounts");
  const sel = $("txAccount");
  ul.innerHTML = "";
  sel.innerHTML = "";
  state.accounts.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${a.account_name} (${a.account_type}) - ${Number(a.balance || 0).toFixed(2)}`;
    ul.appendChild(li);

    const opt = document.createElement("option");
    opt.value = a.account_id;
    opt.textContent = a.account_name;
    sel.appendChild(opt);
  });
}

function renderCategories(rows) {
  const ul = $("categories");
  ul.innerHTML = "";
  rows.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r.category_name;
    ul.appendChild(li);
  });
}

function renderTx(rows) {
  const tbody = $("txRows");
  tbody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.txn_id ?? ""}</td>
      <td>${r.date ?? ""}</td>
      <td>${r.type ?? ""}</td>
      <td>${Number(r.amount || 0).toFixed(2)}</td>
      <td>${r.account_id ?? ""}</td>
      <td>${r.category ?? ""}</td>
      <td>${r.note ?? ""}</td>
    `;
    tbody.appendChild(tr);
  });
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

async function refreshAll() {
  if (!state.userId) return;
  const [accounts, categories, tx] = await Promise.all([
    api(`/accounts?user_id=${state.userId}`),
    api(`/categories?user_id=${state.userId}`),
    api(`/transactions?user_id=${state.userId}`),
  ]);
  state.accounts = accounts;
  renderAccounts();
  renderCategories(categories);
  renderTx(tx);
  setScreen(true);
}

async function checkHealth() {
  try {
    const h = await api("/health");
    setStatus("health", `API healthy: ${h.ts}`);
  } catch (e) {
    setStatus("health", `API error: ${e.message}`);
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
        setStatus("authStatus", "Registered. Switch to Login and sign in.");
        setAuthMode("login");
        return;
      }
      const out = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.userId = Number(out.user_id);
      state.userName = out.name;
      localStorage.setItem("keeperbma_user_id", String(state.userId));
      localStorage.setItem("keeperbma_user_name", state.userName);
      await refreshAll();
    } catch (e) {
      const action = state.authMode === "register" ? "Register" : "Login";
      setStatus("authStatus", `${action} failed: ${e.message}`);
    }
  };

  $("btnLogout").onclick = () => {
    state.userId = 0;
    state.userName = "";
    state.accounts = [];
    localStorage.removeItem("keeperbma_user_id");
    localStorage.removeItem("keeperbma_user_name");
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
      await refreshAll();
    } catch (e) {
      alert(`Add account failed: ${e.message}`);
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
      await refreshAll();
    } catch (e) {
      alert(`Add category failed: ${e.message}`);
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
      await refreshAll();
    } catch (e) {
      alert(`Add transaction failed: ${e.message}`);
    }
  };

  await checkHealth();
  setAuthMode("login");
  setScreen(false);
  if (state.userId) {
    await refreshAll().catch(() => {
      state.userId = 0;
      state.userName = "";
      localStorage.removeItem("keeperbma_user_id");
      localStorage.removeItem("keeperbma_user_name");
      setScreen(false);
    });
  }
});
