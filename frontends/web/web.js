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
  ar: {
    language: "اللغة",
    welcome: "مرحبا",
    login: "تسجيل الدخول",
    register: "تسجيل",
    logout: "تسجيل الخروج",
    name: "الاسم",
    password: "كلمة المرور",
    accountName: "اسم الحساب",
    group: "المجموعة",
    balance: "الرصيد",
    categoryName: "اسم الفئة",
    amount: "المبلغ",
    category: "الفئة",
    note: "ملاحظة",
    accounts: "الحسابات",
    categories: "الفئات",
    transactions: "المعاملات",
    addAccount: "إضافة حساب",
    addCategory: "إضافة فئة",
    addTransaction: "إضافة معاملة",
    thId: "المعرف",
    thDate: "التاريخ",
    thType: "النوع",
    thAmount: "المبلغ",
    thAccount: "الحساب",
    thCategory: "الفئة",
    thNote: "ملاحظة",
    authRequired: "الاسم وكلمة المرور مطلوبان.",
    registeredOk: "تم التسجيل. قم بتسجيل الدخول.",
    authFailed: "فشل {action}: {reason}",
    signedIn: "تم تسجيل الدخول: {name}",
    apiHealthy: "الواجهة تعمل: {ts}",
    apiError: "خطأ في الواجهة: {reason}",
    addAccountFailed: "فشل إضافة الحساب: {reason}",
    addCategoryFailed: "فشل إضافة الفئة: {reason}",
    addTxFailed: "فشل إضافة المعاملة: {reason}",
  },
  ja: {
    language: "言語",
    welcome: "ようこそ",
    login: "ログイン",
    register: "登録",
    logout: "ログアウト",
    name: "名前",
    password: "パスワード",
    accountName: "口座名",
    group: "グループ",
    balance: "残高",
    categoryName: "カテゴリ名",
    amount: "金額",
    category: "カテゴリ",
    note: "メモ",
    accounts: "口座",
    categories: "カテゴリ",
    transactions: "取引",
    addAccount: "口座を追加",
    addCategory: "カテゴリを追加",
    addTransaction: "取引を追加",
    thId: "ID",
    thDate: "日付",
    thType: "種類",
    thAmount: "金額",
    thAccount: "口座",
    thCategory: "カテゴリ",
    thNote: "メモ",
    authRequired: "名前とパスワードは必須です。",
    registeredOk: "登録完了。ログインしてください。",
    authFailed: "{action} 失敗: {reason}",
    signedIn: "ログイン中: {name}",
    apiHealthy: "API正常: {ts}",
    apiError: "APIエラー: {reason}",
    addAccountFailed: "口座追加エラー: {reason}",
    addCategoryFailed: "カテゴリ追加エラー: {reason}",
    addTxFailed: "取引追加エラー: {reason}",
  },
  zh: {
    language: "语言",
    welcome: "欢迎",
    login: "登录",
    register: "注册",
    logout: "退出登录",
    name: "用户名",
    password: "密码",
    accountName: "账户名称",
    group: "分组",
    balance: "余额",
    categoryName: "分类名称",
    amount: "金额",
    category: "分类",
    note: "备注",
    accounts: "账户",
    categories: "分类",
    transactions: "交易",
    addAccount: "添加账户",
    addCategory: "添加分类",
    addTransaction: "添加交易",
    thId: "编号",
    thDate: "日期",
    thType: "类型",
    thAmount: "金额",
    thAccount: "账户",
    thCategory: "分类",
    thNote: "备注",
    authRequired: "用户名和密码不能为空。",
    registeredOk: "注册成功，请登录。",
    authFailed: "{action} 失败: {reason}",
    signedIn: "已登录: {name}",
    apiHealthy: "API正常: {ts}",
    apiError: "API错误: {reason}",
    addAccountFailed: "添加账户失败: {reason}",
    addCategoryFailed: "添加分类失败: {reason}",
    addTxFailed: "添加交易失败: {reason}",
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
