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
    signedIn: "Signed in: {name}",
    apiHealthy: "API healthy: {ts}",
    apiError: "API error: {reason}",
    addAccountFailed: "Add account failed: {reason}",
    addCategoryFailed: "Add category failed: {reason}",
    addTxFailed: "Add transaction failed: {reason}",
  },
  es: {
    language: "Idioma",
    welcome: "Bienvenido",
    login: "Iniciar sesion",
    register: "Registrarse",
    logout: "Cerrar sesion",
    name: "Nombre",
    password: "Contrasena",
    accountName: "Nombre de cuenta",
    group: "Grupo",
    balance: "Saldo",
    categoryName: "Nombre de categoria",
    amount: "Monto",
    category: "Categoria",
    note: "Nota",
    accounts: "Cuentas",
    categories: "Categorias",
    transactions: "Transacciones",
    addAccount: "Agregar cuenta",
    addCategory: "Agregar categoria",
    addTransaction: "Agregar transaccion",
    thId: "ID",
    thDate: "Fecha",
    thType: "Tipo",
    thAmount: "Monto",
    thAccount: "Cuenta",
    thCategory: "Categoria",
    thNote: "Nota",
    authRequired: "Nombre y contrasena son obligatorios.",
    registeredOk: "Registro completado. Cambia a Iniciar sesion.",
    authFailed: "{action} error: {reason}",
    signedIn: "Sesion iniciada: {name}",
    apiHealthy: "API activa: {ts}",
    apiError: "Error API: {reason}",
    addAccountFailed: "Error al agregar cuenta: {reason}",
    addCategoryFailed: "Error al agregar categoria: {reason}",
    addTxFailed: "Error al agregar transaccion: {reason}",
  },
  fr: {
    language: "Langue",
    welcome: "Bienvenue",
    login: "Connexion",
    register: "Inscription",
    logout: "Deconnexion",
    name: "Nom",
    password: "Mot de passe",
    accountName: "Nom du compte",
    group: "Groupe",
    balance: "Solde",
    categoryName: "Nom de categorie",
    amount: "Montant",
    category: "Categorie",
    note: "Note",
    accounts: "Comptes",
    categories: "Categories",
    transactions: "Transactions",
    addAccount: "Ajouter compte",
    addCategory: "Ajouter categorie",
    addTransaction: "Ajouter transaction",
    thId: "ID",
    thDate: "Date",
    thType: "Type",
    thAmount: "Montant",
    thAccount: "Compte",
    thCategory: "Categorie",
    thNote: "Note",
    authRequired: "Nom et mot de passe requis.",
    registeredOk: "Inscription reussie. Passez a Connexion.",
    authFailed: "{action} echec: {reason}",
    signedIn: "Connecte: {name}",
    apiHealthy: "API active: {ts}",
    apiError: "Erreur API: {reason}",
    addAccountFailed: "Echec ajout compte: {reason}",
    addCategoryFailed: "Echec ajout categorie: {reason}",
    addTxFailed: "Echec ajout transaction: {reason}",
  },
  my: {
    language: "ဘာသာစကား",
    welcome: "ႀကိဳဆိုပါတယ္",
    login: "လော့ဂ်အင်",
    register: "စာရင္းသြင္းမည္",
    logout: "ထြက္မည္",
    name: "အမည္",
    password: "စကားဝွက္",
    accountName: "အေကာင့္အမည္",
    group: "အုပ္စု",
    balance: "လက္က်န္",
    categoryName: "အမ်ိဳးအစားအမည္",
    amount: "ပမာဏ",
    category: "အမ်ိဳးအစား",
    note: "မွတ္ခ်က္",
    accounts: "အေကာင့္မ်ား",
    categories: "အမ်ိဳးအစားမ်ား",
    transactions: "ေငြလႊဲမွတ္တမ္းမ်ား",
    addAccount: "အေကာင့္ထည့္မည္",
    addCategory: "အမ်ိဳးအစားထည့္မည္",
    addTransaction: "ေငြလႊဲမွတ္တမ္းထည့္မည္",
    thId: "ID",
    thDate: "ရက္စြဲ",
    thType: "အမ်ိဳးအစား",
    thAmount: "ပမာဏ",
    thAccount: "အေကာင့္",
    thCategory: "က႑",
    thNote: "မွတ္ခ်က္",
    authRequired: "အမည္ႏွင့္ စကားဝွက္ လိုအပ္ပါသည္။",
    registeredOk: "စာရင္းသြင္းၿပီးပါၿပီ။ လော့ဂ်အင္လုပ္ပါ။",
    authFailed: "{action} မေအာင္ျမင္ပါ: {reason}",
    signedIn: "အသံုးျပဳသူ: {name}",
    apiHealthy: "API အဆင္ေျပသည္: {ts}",
    apiError: "API အမွား: {reason}",
    addAccountFailed: "အေကာင့္ထည့္မရပါ: {reason}",
    addCategoryFailed: "အမ်ိဳးအစားထည့္မရပါ: {reason}",
    addTxFailed: "ေငြလႊဲမွတ္တမ္းထည့္မရပါ: {reason}",
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
  const fallback = I18N.en[key] || key;
  let text = langPack[key] || fallback;
  Object.keys(vars).forEach((k) => {
    text = text.replace(`{${k}}`, String(vars[k]));
  });
  return text;
}

function setStatus(id, msg) {
  $(id).textContent = msg;
}

function applyLanguage() {
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
  if (state.userId) {
    $("userBadge").textContent = tr("signedIn", { name: state.userName });
  }
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
    setStatus("health", tr("apiHealthy", { ts: h.ts }));
  } catch (e) {
    setStatus("health", tr("apiError", { reason: e.message }));
  }
}

window.addEventListener("load", async () => {
  if (!I18N[state.lang]) {
    state.lang = "en";
  }
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
      await refreshAll();
      applyLanguage();
    } catch (e) {
      const action = state.authMode === "register" ? tr("register") : tr("login");
      setStatus("authStatus", tr("authFailed", { action, reason: e.message }));
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
      alert(tr("addAccountFailed", { reason: e.message }));
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
      alert(tr("addCategoryFailed", { reason: e.message }));
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
      alert(tr("addTxFailed", { reason: e.message }));
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
