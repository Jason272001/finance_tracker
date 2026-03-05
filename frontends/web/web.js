const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    language: "Language",
    welcome: "Welcome",
    login: "Login",
    register: "Register",
    logout: "Logout",
    name: "Name",
    password: "Password",
    accountName: "Account Name",
    group: "Group",
    balance: "Balance",
    categoryName: "Category Name",
    amount: "Amount",
    category: "Category",
    note: "Note",
    accounts: "Accounts",
    categories: "Categories",
    transactions: "Transactions",
    addAccount: "Add Account",
    addCategory: "Add Category",
    addTransaction: "Add Transaction",
    thId: "ID",
    thDate: "Date",
    thType: "Type",
    thAmount: "Amount",
    thAccount: "Account",
    thCategory: "Category",
    thNote: "Note",
    authRequired: "Name and password are required.",
    registeredOk: "Registered. Switch to Login and sign in.",
    authFailed: "{action} failed: {reason}",
    invalidCredentialsHint:
      "Invalid credentials. If this is your old local account, migrate data to Render DB or register this account on cloud first.",
    signedIn: "Signed in: {name}",
    apiHealthy: "API healthy: {ts}",
    apiError: "API error: {reason}",
    addAccountFailed: "Add account failed: {reason}",
    addCategoryFailed: "Add category failed: {reason}",
    addTxFailed: "Add transaction failed: {reason}",
    networkError:
      "Network error. The backend may be waking up on Render free tier. Please wait 20-40 seconds and try again.",
  },
  es: {
    language: "Idioma",
    welcome: "Bienvenido",
    login: "Iniciar sesion",
    register: "Registrarse",
    logout: "Cerrar sesion",
  },
  fr: {
    language: "Langue",
    welcome: "Bienvenue",
    login: "Connexion",
    register: "Inscription",
    logout: "Deconnexion",
  },
  my: {
    language: "\u1018\u102c\u101e\u102c\u1005\u1000\u102c\u1038",
    welcome: "\u1000\u103c\u102d\u102f\u1006\u102d\u102f\u1015\u102b\u1010\u101a\u103a",
    login: "\u101c\u1031\u102c\u1037\u1002\u103a\u1021\u1004\u103a",
    register: "\u1005\u102c\u101b\u1004\u103a\u1038\u101e\u103d\u1004\u103a\u1038",
    logout: "\u1011\u103d\u1000\u103a\u1019\u100a\u103a",
    name: "\u1021\u1019\u100a\u103a",
    password: "\u1005\u1000\u102c\u1038\u101d\u103e\u1000\u103a",
    networkError:
      "\u1000\u103d\u1014\u103a\u101b\u1000\u103a \u1021\u1019\u103e\u102c\u1038\u1015\u1031\u102b\u103a\u1015\u1031\u102b\u1000\u103a\u1015\u102b\u101e\u100a\u103a\u104b Render free \u1010\u103d\u1004\u103a backend \u1014\u102d\u102f\u1038\u1011\u1014\u1031\u1019\u103e\u102f\u1000\u103c\u1031\u102c\u1004\u103a\u1037 \u1016\u103c\u1005\u103a\u1014\u102d\u102f\u1004\u103a\u1015\u102b\u101e\u100a\u103a\u104b \u1005\u1000\u1039\u1000\u1014\u1037\u103a 20-40 \u1005\u1031\u102c\u1004\u1037\u103a\u1015\u103c\u102e\u1038 \u1011\u1015\u103a\u1019\u1036 \u1005\u1019\u103a\u1038\u1000\u103c\u100a\u1037\u103a\u1015\u102b\u104b",
    invalidCredentialsHint:
      "\u1021\u1019\u100a\u103a \u1014\u103e\u1004\u1037\u103a \u1005\u1000\u102c\u1038\u101d\u103e\u1000\u103a \u1019\u1000\u103c\u102f\u1004\u103a\u1038\u1010\u102d\u102f\u1000\u103a\u100a\u102e\u1015\u102b\u104b \u1021\u1031\u1000\u102c\u1004\u1037\u103a\u1021\u1000\u1031\u102c\u1004\u1037\u103a\u1000 old local data \u1016\u103c\u1005\u103a\u101c\u103e\u103b\u1004\u103a Render DB \u101e\u102d\u102f\u1037 migrate \u101c\u102f\u1015\u103a\u1015\u102b\u104b",
    authFailed: "{action} \u1019\u1021\u1031\u102c\u1004\u103a\u1019\u103c\u1004\u103a\u1015\u102b: {reason}",
  },
  ar: {
    language: "\u0627\u0644\u0644\u063a\u0629",
    welcome: "\u0645\u0631\u062d\u0628\u0627",
    login: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
    register: "\u062a\u0633\u062c\u064a\u0644",
    logout: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
    name: "\u0627\u0644\u0627\u0633\u0645",
    password: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
  },
  ja: {
    language: "\u8a00\u8a9e",
    welcome: "\u3088\u3046\u3053\u305d",
    login: "\u30ed\u30b0\u30a4\u30f3",
    register: "\u767b\u9332",
    logout: "\u30ed\u30b0\u30a2\u30a6\u30c8",
    name: "\u540d\u524d",
    password: "\u30d1\u30b9\u30ef\u30fc\u30c9",
  },
  zh: {
    language: "\u8bed\u8a00",
    welcome: "\u6b22\u8fce",
    login: "\u767b\u5f55",
    register: "\u6ce8\u518c",
    logout: "\u9000\u51fa\u767b\u5f55",
    name: "\u7528\u6237\u540d",
    password: "\u5bc6\u7801",
  },
};

let state = {
  apiBase: "https://keeperbma-backend.onrender.com",
  userId: Number(localStorage.getItem("keeperbma_user_id") || 0),
  userName: localStorage.getItem("keeperbma_user_name") || "",
  accounts: [],
  authMode: "login",
  lang: localStorage.getItem("keeperbma_lang") || "en",
};

function tr(key, vars = {}) {
  const langPack = I18N[state.lang] || I18N.en;
  let text = langPack[key] || I18N.en[key] || key;
  Object.keys(vars).forEach((k) => {
    text = text.replace(`{${k}}`, String(vars[k]));
  });
  return text;
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

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";

  $("langLabel").textContent = tr("language");
  $("welcomeTitle").textContent = tr("welcome");
  $("tabLogin").textContent = tr("login");
  $("tabRegister").textContent = tr("register");
  $("labelName").textContent = tr("name");
  $("labelPassword").textContent = tr("password");
  $("btnLogout").textContent = tr("logout");
  $("accountsTitle").textContent = tr("accounts");
  $("categoriesTitle").textContent = tr("categories");
  $("transactionsTitle").textContent = tr("transactions");
  $("btnAddAccount").textContent = tr("addAccount");
  $("btnAddCategory").textContent = tr("addCategory");
  $("btnAddTx").textContent = tr("addTransaction");
  $("thId").textContent = tr("thId");
  $("thDate").textContent = tr("thDate");
  $("thType").textContent = tr("thType");
  $("thAmount").textContent = tr("thAmount");
  $("thAccount").textContent = tr("thAccount");
  $("thCategory").textContent = tr("thCategory");
  $("thNote").textContent = tr("thNote");

  $("loginName").placeholder = tr("name");
  $("loginPass").placeholder = tr("password");
  $("accName").placeholder = tr("accountName");
  $("accGroup").placeholder = tr("group");
  $("accBal").placeholder = tr("balance");
  $("catName").placeholder = tr("categoryName");
  $("txAmount").placeholder = tr("amount");
  $("txCategory").placeholder = tr("category");
  $("txNote").placeholder = tr("note");
  $("authAction").textContent = state.authMode === "login" ? tr("login") : tr("register");
}

async function api(path, opts = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${state.apiBase}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt < 2) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        const body = await res.json().catch(() => ({}));
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
      if (msg.includes("Failed to fetch")) {
        throw new Error(tr("networkError"));
      }
      throw e;
    }
  }
  throw lastErr || new Error(tr("networkError"));
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
    const trNode = document.createElement("tr");
    trNode.innerHTML = `
      <td>${r.txn_id ?? ""}</td>
      <td>${r.date ?? ""}</td>
      <td>${r.type ?? ""}</td>
      <td>${Number(r.amount || 0).toFixed(2)}</td>
      <td>${r.account_id ?? ""}</td>
      <td>${r.category ?? ""}</td>
      <td>${r.note ?? ""}</td>
    `;
    tbody.appendChild(trNode);
  });
}

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  const isLogin = state.authMode === "login";
  $("tabLogin").classList.toggle("active", isLogin);
  $("tabRegister").classList.toggle("active", !isLogin);
  $("authAction").textContent = isLogin ? tr("login") : tr("register");
  setStatus("authStatus", "");
}

function setScreen(isLoggedIn) {
  $("authScreen").classList.toggle("hidden", isLoggedIn);
  $("appScreen").classList.toggle("hidden", !isLoggedIn);
  $("userBadge").textContent = isLoggedIn ? tr("signedIn", { name: state.userName }) : "";
}

async function refreshAll() {
  if (!state.userId) return;
  const [accountsRes, categoriesRes, txRes] = await Promise.allSettled([
    api(`/accounts?user_id=${state.userId}`),
    api(`/categories?user_id=${state.userId}`),
    api(`/transactions?user_id=${state.userId}`),
  ]);

  if (accountsRes.status === "fulfilled") {
    state.accounts = accountsRes.value || [];
    renderAccounts();
  } else {
    state.accounts = [];
    renderAccounts();
  }

  if (categoriesRes.status === "fulfilled") {
    renderCategories(categoriesRes.value || []);
  } else {
    renderCategories([]);
  }

  if (txRes.status === "fulfilled") {
    renderTx(txRes.value || []);
  } else {
    renderTx([]);
  }

  const failures = [accountsRes, categoriesRes, txRes].filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    const first = failures[0];
    const reason = errMessage(first.reason);
    setStatus("health", `Some data failed to load: ${reason}`);
  } else {
    await checkHealth();
  }

  setScreen(true);
}

async function checkHealth() {
  try {
    const h = await api("/health");
    setStatus("health", tr("apiHealthy", { ts: h.ts }));
  } catch (e) {
    setStatus("health", tr("apiError", { reason: errMessage(e) }));
  }
}

window.addEventListener("load", async () => {
  if (!I18N[state.lang]) state.lang = "en";
  $("langSelect").value = state.lang;
  applyLanguage();

  $("langSelect").onchange = () => {
    state.lang = $("langSelect").value;
    localStorage.setItem("keeperbma_lang", state.lang);
    applyLanguage();
    checkHealth();
  };

  $("tabLogin").onclick = () => setAuthMode("login");
  $("tabRegister").onclick = () => setAuthMode("register");
  $("authAction").onclick = async () => {
    try {
      const payload = {
        name: $("loginName").value.trim(),
        password: $("loginPass").value,
      };
      if (!payload.name || !payload.password) {
        setStatus("authStatus", tr("authRequired"));
        return;
      }
      if (state.authMode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStatus("authStatus", tr("registeredOk"));
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
      setScreen(true);
      setStatus("authStatus", "");
      await refreshAll();
    } catch (e) {
      const reason = errMessage(e);
      if (reason.includes("Invalid credentials")) {
        setStatus("authStatus", tr("invalidCredentialsHint"));
      } else {
        const action = state.authMode === "register" ? tr("register") : tr("login");
        setStatus("authStatus", tr("authFailed", { action, reason }));
      }
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
      alert(tr("addAccountFailed", { reason: errMessage(e) }));
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
      alert(tr("addCategoryFailed", { reason: errMessage(e) }));
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
      alert(tr("addTxFailed", { reason: errMessage(e) }));
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
