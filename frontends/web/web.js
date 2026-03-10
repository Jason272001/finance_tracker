const $ = (id) => document.getElementById(id);

let state = {
  apiBase: "https://api.keeperbma.com",
  authToken: "",
  userId: 0,
  userName: "",
  accounts: [],
  categories: [],
  tx: [],
  daily: [],
  filteredTx: [],
  authMode: "login",
  editingAccountId: 0,
  editingTxId: 0,
  currentLang: "en",
  profile: {},
  pendingProfileImage: null,
  subscription: {},
  charts: { income: null, expense: null, debt: null },
};
const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus", "diamond"]);

const I18N = {
  en: {
    nav_home: "Home",
    nav_features: "Features",
    nav_pricing: "Pricing",
    nav_about: "About",
    landing_title: "All-in-One Finance Platform for Personal and Business Growth",
    landing_subtitle: "KeeperBMA helps you track money, manage subscriptions, run business operations, and scale across web, mobile, and desktop with one secure backend.",
    get_started: "Get Started",
    already_account: "I Already Have an Account",
    features_overview: "Features Overview",
    feat_manual_title: "Manual Tracking",
    feat_manual_desc: "Add income, expenses, accounts, and notes manually with full control.",
    feat_auto_title: "Auto Sync",
    feat_auto_desc: "Connect bank accounts for automatic transaction sync and smart categorization.",
    feat_pos_title: "POS & Inventory",
    feat_pos_desc: "Business users get POS, inventory, sales records, and product analytics.",
    feat_ai_title: "AI Insights",
    feat_ai_desc: "Get forecasting, spending patterns, and category-level performance insights.",
    pricing_plans: "Pricing Plans",
    pricing_hint: "Choose a plan to continue to Sign Up.",
    choose_basic: "Choose Basic",
    choose_regular: "Choose Regular",
    choose_business: "Choose Business",
    choose_premium_plus: "Choose Premium Plus",
    choose_diamond: "Choose Diamond",
    select_plan_before_register: "Please choose a plan first from Pricing.",
    about_title: "About KeeperBMA",
    about_desc: "KeeperBMA is designed for individuals, families, and business owners who need one scalable platform to manage finances securely across all devices.",
    language: "Language",
    welcome: "Welcome",
    login: "Sign In",
    register: "Sign Up",
    settings: "Settings",
    name: "Name",
    password: "Password",
    signed_in: "Signed in",
    logout: "Logout",
    available_balance: "Current Available Balance",
    total_debt: "Total Debt",
    total_income: "Total Income",
    total_expense: "Total Expense",
    summary_export: "Summary Export",
    apply_range: "Apply Range",
    reset: "Reset",
    download_pdf: "Download PDF",
    summary_charts: "Summary Charts",
    income_by_category: "Income by Category",
    expense_by_category: "Expense by Category",
    debt_by_account: "Debt by Account",
    daily_summary: "Daily Balance Summary",
    date: "Date",
    income: "Income",
    expense: "Expense",
    net: "Net",
    snapshot: "Snapshot",
    accounts: "Accounts",
    account_name: "Account Name",
    group: "Group",
    balance: "Balance",
    actions: "Actions",
    id: "ID",
    type: "Type",
    categories: "Categories",
    category_name: "Category Name",
    add_category: "Add Category",
    transactions: "Transactions",
    amount: "Amount",
    account: "Account",
    category: "Category",
    note: "Note",
    add_account: "Add Account",
    update_account: "Update Account",
    add_tx: "Add Transaction",
    update_tx: "Update Transaction",
    cancel_edit: "Cancel Edit",
    edit: "Edit",
    delete: "Delete",
    subscription_title: "Subscription",
    current_plan: "Current Plan",
    plan_status: "Status",
    trial_ends: "Trial Ends",
    trial_days_left: "Trial Days Left",
    change_plan: "Change Plan",
    plan_basic: "Basic",
    plan_regular: "Regular",
    plan_business: "Business",
    plan_premium_plus: "Premium Plus",
    plan_diamond: "Diamond",
    plan_lifetime: "Lifetime",
    plan_updated: "Plan updated successfully.",
    profile_title: "Profile & Settings",
    profile_username: "Username",
    profile_email: "Email",
    profile_phone: "Phone",
    profile_email_notifications: "Email Notifications Enabled",
    save_profile: "Save Profile",
    remove_photo: "Remove Photo",
    current_password: "Current Password",
    new_password: "New Password",
    confirm_new_password: "Confirm New Password",
    update_password: "Update Password",
    profile_saved: "Profile updated successfully.",
    password_updated: "Password updated successfully.",
  },
  my: {
    language: "ဘာသာစကား",
    welcome: "ကြိုဆိုပါတယ်",
    login: "လော့အင်",
    register: "စာရင်းသွင်းမည်",
    name: "အမည်",
    password: "စကားဝှက်",
    signed_in: "ဝင်ရောက်ထားသူ",
    logout: "ထွက်မည်",
    available_balance: "လက်ရှိအသုံးပြုနိုင်သော လက်ကျန်ငွေ",
    total_debt: "စုစုပေါင်းအကြွေး",
    total_income: "စုစုပေါင်းဝင်ငွေ",
    total_expense: "စုစုပေါင်းအသုံးစရိတ်",
    summary_export: "အနှစ်ချုပ်ထုတ်ယူရန်",
    apply_range: "နေ့ရက်အသုံးချ",
    reset: "ပြန်သတ်မှတ်",
    download_pdf: "PDF ဒေါင်းလုဒ်",
    summary_charts: "အနှစ်ချုပ်ဇယားများ",
    income_by_category: "အမျိုးအစားလိုက် ဝင်ငွေ",
    expense_by_category: "အမျိုးအစားလိုက် အသုံးစရိတ်",
    debt_by_account: "အကောင့်လိုက် အကြွေး",
    daily_summary: "နေ့စဉ်လက်ကျန်အနှစ်ချုပ်",
    date: "ရက်စွဲ",
    income: "ဝင်ငွေ",
    expense: "အသုံးစရိတ်",
    net: "ကျန်ငွေ",
    snapshot: "ရက်စွဲအလိုက်",
    accounts: "အကောင့်များ",
    account_name: "အကောင့်အမည်",
    group: "အုပ်စု",
    balance: "လက်ကျန်",
    actions: "လုပ်ဆောင်ချက်များ",
    categories: "အမျိုးအစားများ",
    category_name: "အမျိုးအစားအမည်",
    add_category: "အမျိုးအစားထည့်",
    transactions: "လွှဲပြောင်းမှုများ",
    amount: "ပမာဏ",
    account: "အကောင့်",
    category: "အမျိုးအစား",
    note: "မှတ်စု",
    add_account: "အကောင့်ထည့်",
    update_account: "အကောင့်ပြင်ဆင်",
    add_tx: "လွှဲပြောင်းမှုထည့်",
    update_tx: "လွှဲပြောင်းမှုပြင်ဆင်",
    cancel_edit: "ပြင်ဆင်မှုမလုပ်တော့",
    edit: "ပြင်ဆင်",
    delete: "ဖျက်မည်",
  },
  ar: {
    language: "اللغة",
    welcome: "مرحبًا",
    login: "تسجيل الدخول",
    register: "إنشاء حساب",
    name: "الاسم",
    password: "كلمة المرور",
    signed_in: "تم تسجيل الدخول",
    logout: "تسجيل الخروج",
    available_balance: "الرصيد المتاح الحالي",
    total_debt: "إجمالي الدين",
    total_income: "إجمالي الدخل",
    total_expense: "إجمالي المصروف",
    summary_export: "تصدير الملخص",
    apply_range: "تطبيق الفترة",
    reset: "إعادة تعيين",
    download_pdf: "تنزيل PDF",
    summary_charts: "رسوم الملخص",
    income_by_category: "الدخل حسب الفئة",
    expense_by_category: "المصروف حسب الفئة",
    debt_by_account: "الدين حسب الحساب",
    daily_summary: "ملخص الرصيد اليومي",
    date: "التاريخ",
    income: "الدخل",
    expense: "المصروف",
    net: "الصافي",
    snapshot: "اللقطة",
    accounts: "الحسابات",
    account_name: "اسم الحساب",
    group: "المجموعة",
    balance: "الرصيد",
    actions: "الإجراءات",
    categories: "الفئات",
    category_name: "اسم الفئة",
    add_category: "إضافة فئة",
    transactions: "المعاملات",
    amount: "المبلغ",
    account: "الحساب",
    category: "الفئة",
    note: "ملاحظة",
    add_account: "إضافة حساب",
    update_account: "تحديث الحساب",
    add_tx: "إضافة معاملة",
    update_tx: "تحديث المعاملة",
    cancel_edit: "إلغاء التعديل",
    edit: "تعديل",
    delete: "حذف",
  },
  ja: {
    language: "言語",
    welcome: "ようこそ",
    login: "ログイン",
    register: "登録",
    name: "名前",
    password: "パスワード",
    signed_in: "ログイン中",
    logout: "ログアウト",
    available_balance: "現在の利用可能残高",
    total_debt: "総負債",
    total_income: "総収入",
    total_expense: "総支出",
    summary_export: "サマリー出力",
    apply_range: "期間適用",
    reset: "リセット",
    download_pdf: "PDFダウンロード",
    summary_charts: "サマリーチャート",
    income_by_category: "カテゴリ別収入",
    expense_by_category: "カテゴリ別支出",
    debt_by_account: "口座別負債",
    daily_summary: "日次残高サマリー",
    date: "日付",
    income: "収入",
    expense: "支出",
    net: "差引",
    snapshot: "スナップショット",
    accounts: "口座",
    account_name: "口座名",
    group: "グループ",
    balance: "残高",
    actions: "操作",
    categories: "カテゴリ",
    category_name: "カテゴリ名",
    add_category: "カテゴリ追加",
    transactions: "取引",
    amount: "金額",
    account: "口座",
    category: "カテゴリ",
    note: "メモ",
    add_account: "口座追加",
    update_account: "口座更新",
    add_tx: "取引追加",
    update_tx: "取引更新",
    cancel_edit: "編集取消",
    edit: "編集",
    delete: "削除",
  },
  zh: {
    language: "语言",
    welcome: "欢迎",
    login: "登录",
    register: "注册",
    name: "姓名",
    password: "密码",
    signed_in: "已登录",
    logout: "退出登录",
    available_balance: "当前可用余额",
    total_debt: "总负债",
    total_income: "总收入",
    total_expense: "总支出",
    summary_export: "导出汇总",
    apply_range: "应用区间",
    reset: "重置",
    download_pdf: "下载 PDF",
    summary_charts: "汇总图表",
    income_by_category: "按分类收入",
    expense_by_category: "按分类支出",
    debt_by_account: "按账户负债",
    daily_summary: "每日余额汇总",
    date: "日期",
    income: "收入",
    expense: "支出",
    net: "净额",
    snapshot: "快照",
    accounts: "账户",
    account_name: "账户名称",
    group: "分组",
    balance: "余额",
    actions: "操作",
    categories: "分类",
    category_name: "分类名称",
    add_category: "添加分类",
    transactions: "交易",
    amount: "金额",
    account: "账户",
    category: "分类",
    note: "备注",
    add_account: "添加账户",
    update_account: "更新账户",
    add_tx: "添加交易",
    update_tx: "更新交易",
    cancel_edit: "取消编辑",
    edit: "编辑",
    delete: "删除",
  },
  es: {
    language: "Idioma",
    welcome: "Bienvenido",
    login: "Iniciar sesion",
    register: "Registrarse",
    name: "Nombre de usuario",
    password: "Contrasena",
    signed_in: "Sesion iniciada",
    logout: "Cerrar sesion",
  },
  fr: {
    language: "Langue",
    welcome: "Bienvenue",
    login: "Se connecter",
    register: "S inscrire",
    name: "Nom utilisateur",
    password: "Mot de passe",
    signed_in: "Connecte",
    logout: "Se deconnecter",
  },
  de: {
    language: "Sprache",
    welcome: "Willkommen",
    login: "Anmelden",
    register: "Registrieren",
    name: "Benutzername",
    password: "Passwort",
    signed_in: "Angemeldet",
    logout: "Abmelden",
  },
};

function t(key) {
  const pack = I18N[state.currentLang] || I18N.en;
  return pack[key] || I18N.en[key] || key;
}

function normalizeSignupPlan(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  return ALLOWED_SIGNUP_PLANS.has(key) ? key : "";
}

function setPendingSignupPlan(planCode) {
  const key = normalizeSignupPlan(planCode);
  if (key) localStorage.setItem(SIGNUP_PLAN_KEY, key);
  return key;
}

function getPendingSignupPlan() {
  return normalizeSignupPlan(localStorage.getItem(SIGNUP_PLAN_KEY));
}

function setPricingHint(msg, isError = false) {
  const el = $("pricingHint");
  if (!el) return;
  el.textContent = msg || t("pricing_hint");
  el.classList.toggle("error", Boolean(isError));
}

function fmtMoney(v) {
  const n = Number(v || 0);
  return `$${n.toFixed(2)}`;
}

function setStatus(id, msg) {
  const el = $(id);
  if (el) el.textContent = msg;
}

function notify(msg) {
  setStatus("health", msg);
}

function setText(id, key) {
  const el = $(id);
  if (el) el.textContent = t(key);
}

function applyLanguage(lang) {
  state.currentLang = I18N[lang] ? lang : "en";
  localStorage.setItem("keeperbma_lang", state.currentLang);
  document.documentElement.lang = state.currentLang;

  if ($("langSelect")) $("langSelect").value = state.currentLang;
  if ($("appLangSelect")) $("appLangSelect").value = state.currentLang;

  setText("langLabelApp", "language");
  setText("navHome", "nav_home");
  setText("navFeatures", "nav_features");
  setText("navPricing", "nav_pricing");
  setText("navAbout", "nav_about");
  setText("btnNavLogin", "login");
  setText("btnNavRegister", "register");
  setText("btnOpenSettings", "settings");
  setText("landingTitle", "landing_title");
  setText("landingSubtitle", "landing_subtitle");
  setText("btnHeroRegister", "get_started");
  setText("btnHeroLogin", "already_account");
  setText("featuresTitle", "features_overview");
  setText("featManualTitle", "feat_manual_title");
  setText("featManualDesc", "feat_manual_desc");
  setText("featAutoTitle", "feat_auto_title");
  setText("featAutoDesc", "feat_auto_desc");
  setText("featPosTitle", "feat_pos_title");
  setText("featPosDesc", "feat_pos_desc");
  setText("featAiTitle", "feat_ai_title");
  setText("featAiDesc", "feat_ai_desc");
  setText("pricingTitle", "pricing_plans");
  setText("btnPickBasic", "choose_basic");
  setText("btnPickRegular", "choose_regular");
  setText("btnPickBusiness", "choose_business");
  setText("btnPickPremium", "choose_premium_plus");
  setText("btnPickDiamond", "choose_diamond");
  setText("aboutTitle", "about_title");
  setText("aboutDesc", "about_desc");
  setText("btnLogout", "logout");
  setText("kpiLabelAvailable", "available_balance");
  setText("kpiLabelDebt", "total_debt");
  setText("kpiLabelIncome", "total_income");
  setText("kpiLabelExpense", "total_expense");
  setText("profileTitle", "profile_title");
  setText("profileUsernameLabel", "profile_username");
  setText("profileEmailLabel", "profile_email");
  setText("profilePhoneLabel", "profile_phone");
  setText("emailNotifLabel", "profile_email_notifications");
  setText("btnSaveProfile", "save_profile");
  setText("btnRemoveProfileImage", "remove_photo");
  setText("currentPasswordLabel", "current_password");
  setText("newPasswordLabel", "new_password");
  setText("confirmNewPasswordLabel", "confirm_new_password");
  setText("btnChangePassword", "update_password");
  setText("subscriptionTitle", "subscription_title");
  setText("currentPlanLabel", "current_plan");
  setText("planStatusLabel", "plan_status");
  setText("trialEndsLabel", "trial_ends");
  setText("trialDaysLabel", "trial_days_left");
  setText("changePlanLabel", "change_plan");
  setText("planBtnBasic", "plan_basic");
  setText("planBtnRegular", "plan_regular");
  setText("planBtnBusiness", "plan_business");
  setText("planBtnPremium", "plan_premium_plus");
  setText("summaryExportTitle", "summary_export");
  setText("btnApplySummary", "apply_range");
  setText("btnResetSummary", "reset");
  setText("btnDownloadPdf", "download_pdf");
  setText("summaryChartsTitle", "summary_charts");
  setText("incomeChartTitle", "income_by_category");
  setText("expenseChartTitle", "expense_by_category");
  setText("debtChartTitle", "debt_by_account");
  setText("dailySummaryTitle", "daily_summary");
  setText("dailyColDate", "date");
  setText("dailyColIncome", "income");
  setText("dailyColExpense", "expense");
  setText("dailyColNet", "net");
  setText("dailyColSnapshot", "snapshot");
  setText("accountsTitle", "accounts");
  setText("accountsColName", "name");
  setText("accountsColType", "type");
  setText("accountsColBalance", "balance");
  setText("accountsColActions", "actions");
  setText("categoriesTitle", "categories");
  setText("btnAddCategory", "add_category");
  setText("transactionsTitle", "transactions");
  setText("txColId", "id");
  setText("txColDate", "date");
  setText("txColType", "type");
  setText("txColAmount", "amount");
  setText("txColAccount", "account");
  setText("txColCategory", "category");
  setText("txColNote", "note");
  setText("txColActions", "actions");

  if ($("accName")) $("accName").placeholder = t("account_name");
  if ($("accGroup")) $("accGroup").placeholder = t("group");
  if ($("accBal")) $("accBal").placeholder = t("balance");
  if ($("catName")) $("catName").placeholder = t("category_name");
  if ($("txAmount")) $("txAmount").placeholder = t("amount");
  if ($("txCategory")) $("txCategory").placeholder = t("category");
  if ($("txNote")) $("txNote").placeholder = t("note");
  setPricingHint("", false);
  if ($("profileUsername")) $("profileUsername").placeholder = t("profile_username");
  if ($("profileEmail")) $("profileEmail").placeholder = "name@example.com";
  if ($("profilePhone")) $("profilePhone").placeholder = "+1 5551234567";
  if ($("currentPassword")) $("currentPassword").placeholder = t("current_password");
  if ($("newPassword")) $("newPassword").placeholder = `${t("new_password")} (10+ letters+numbers)`;
  if ($("confirmNewPassword")) $("confirmNewPassword").placeholder = t("confirm_new_password");

  const isAppVisible = !$("appScreen").classList.contains("hidden");
  setAuthMode(state.authMode);
  if (isAppVisible || state.userId > 0) {
    setScreen(true);
  } else {
    showLanding();
  }
  resetAccountForm();
  resetTxForm();
  renderProfile();
  renderAccountsTable();
  renderTransactions();
  renderSubscription();
}

function errMessage(e) {
  const normalize = (msg) => {
    const text = String(msg || "").trim();
    if (!text) return "Unknown error";
    if (/at least 10 characters/i.test(text) || /10\+/i.test(text)) {
      return "Password must be at least 10 characters and include letters and numbers.";
    }
    return text;
  };
  if (!e) return "Unknown error";
  if (typeof e === "string") return normalize(e);
  if (e instanceof Error) return normalize(e.message || String(e));
  if (typeof e.message === "string") return normalize(e.message);
  try {
    return normalize(JSON.stringify(e));
  } catch (_) {
    return normalize(String(e));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  const isLogin = state.authMode === "login";
  if ($("tabLogin")) $("tabLogin").classList.toggle("active", isLogin);
  if ($("tabRegister")) $("tabRegister").classList.toggle("active", !isLogin);
  if ($("tabLogin")) $("tabLogin").textContent = t("login");
  if ($("tabRegister")) $("tabRegister").textContent = t("register");
  if ($("authAction")) $("authAction").textContent = isLogin ? t("login") : t("register");
  setStatus("authStatus", "");
}

function setScreen(isLoggedIn) {
  const landing = $("landingScreen");
  const app = $("appScreen");
  landing.classList.toggle("hidden", isLoggedIn);
  app.classList.toggle("hidden", !isLoggedIn);
  // Force visibility in JS to avoid stale CSS/cache showing both screens.
  landing.style.display = isLoggedIn ? "none" : "flex";
  app.style.display = isLoggedIn ? "block" : "none";
  $("userBadge").textContent = isLoggedIn ? `${t("signed_in")}: ${state.userName}` : "";
  if (isLoggedIn) renderProfile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLanding() {
  const landing = $("landingScreen");
  const app = $("appScreen");
  landing.classList.remove("hidden");
  app.classList.add("hidden");
  landing.style.display = "flex";
  app.style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openPlansPage(planCode = "") {
  const selected = setPendingSignupPlan(planCode);
  const q = selected ? `?plan=${encodeURIComponent(selected)}` : "";
  window.location.href = `./plans.html${q}`;
}

function showAuth(mode = "login", opts = {}) {
  const isRegister = mode === "register";
  if (isRegister) {
    openPlansPage(opts.planCode || "");
    return;
  }
  window.location.href = "./auth.html?mode=signin";
}

async function api(path, opts = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const headers = { ...(opts.headers || {}) };
      const hasBody = opts.body !== undefined && opts.body !== null;
      if (hasBody && !Object.keys(headers).some((k) => String(k).toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
      if (
        state.authToken &&
        !Object.keys(headers).some((k) => String(k).toLowerCase() === "authorization")
      ) {
        headers.Authorization = `Bearer ${state.authToken}`;
      }
      const res = await fetch(`${state.apiBase}${path}`, {
        credentials: "include",
        headers,
        ...opts,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          state.authToken = "";
          localStorage.removeItem("keeperbma_token");
          state.userId = 0;
          state.userName = "";
          showLanding();
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

function planLabel(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  const labels = {
    basic: t("plan_basic"),
    regular: t("plan_regular"),
    business: t("plan_business"),
    premium_plus: t("plan_premium_plus"),
    diamond: t("plan_diamond"),
    lifetime: t("plan_lifetime"),
  };
  return labels[key] || key || t("plan_basic");
}

function renderSubscription() {
  const sub = state.subscription || {};
  const planCode = String(sub.plan_code || "basic").toLowerCase();
  const status = String(sub.subscription_status || "active");
  const trialEnds = String(sub.trial_ends_at || "");
  const trialDays = Number(sub.trial_days_remaining || 0);
  const isLifetime = Boolean(sub.is_lifetime);

  if ($("planCodeValue")) $("planCodeValue").textContent = planLabel(planCode);
  if ($("planStatusValue")) $("planStatusValue").textContent = status;
  if ($("trialEndsValue")) $("trialEndsValue").textContent = trialEnds ? trialEnds.slice(0, 10) : "-";
  if ($("trialDaysValue")) $("trialDaysValue").textContent = String(Math.max(0, trialDays));
  if ($("planStatusMsg")) $("planStatusMsg").textContent = "";

  document.querySelectorAll(".plan-btn").forEach((btn) => {
    const btnPlan = String(btn.getAttribute("data-plan") || "").toLowerCase();
    btn.classList.toggle("active", btnPlan === planCode);
    btn.disabled = isLifetime;
  });
}

function getProfileImageUrl() {
  const raw = String((state.profile || {}).profile_image_url || "").trim();
  if (raw) return raw;
  return "../../assets/keeperbma-icon.png";
}

function renderProfile() {
  const p = state.profile || {};
  if ($("profileUsername")) $("profileUsername").value = String(p.name || state.userName || "");
  if ($("profileEmail")) $("profileEmail").value = String(p.email || "");
  if ($("profilePhone")) $("profilePhone").value = String(p.phone || "");
  if ($("profileEmailNotifications")) $("profileEmailNotifications").checked = Boolean(p.email_notifications_enabled ?? true);
  const img = getProfileImageUrl();
  if ($("profileAvatarPreview")) $("profileAvatarPreview").src = img;
  if ($("topLogo")) $("topLogo").src = img;
}

function renderAccountsTable() {
  const tbody = $("accountsRows");
  const sel = $("txAccount");
  tbody.innerHTML = "";
  sel.innerHTML = "";
  const labels = [t("account_name"), t("type"), t("balance"), t("actions")];
  const rows = [...state.accounts].sort((a, b) => String(a.account_name).localeCompare(String(b.account_name)));
  rows.forEach((a) => {
    const tr = document.createElement("tr");
    const vals = [a.account_name || "", a.account_type || "", fmtMoney(a.balance)];
    vals.forEach((v, idx) => {
      const td = document.createElement("td");
      td.textContent = String(v);
      td.setAttribute("data-label", labels[idx]);
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    actionTd.className = "table-actions";
    actionTd.setAttribute("data-label", labels[3]);
    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = t("edit");
    editBtn.onclick = () => beginEditAccount(a);
    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = t("delete");
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
  const labels = [t("id"), t("date"), t("type"), t("amount"), t("account"), t("category"), t("note"), t("actions")];
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
    vals.forEach((v, idx) => {
      const td = document.createElement("td");
      td.textContent = String(v);
      td.setAttribute("data-label", labels[idx]);
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    actionTd.className = "table-actions";
    actionTd.setAttribute("data-label", labels[7]);
    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = t("edit");
    editBtn.onclick = () => beginEditTransaction(r);
    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = t("delete");
    delBtn.onclick = () => deleteTransaction(r);
    actionTd.appendChild(editBtn);
    actionTd.appendChild(document.createTextNode(" "));
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

function beginEditAccount(acc) {
  state.editingAccountId = Number(acc.account_id || 0);
  $("accName").value = String(acc.account_name || "");
  $("accType").value = String(acc.account_type || "checking");
  $("accGroup").value = String(acc.group || "bank");
  $("accBal").value = String(Number(acc.balance || 0));
  $("btnAddAccount").textContent = t("update_account");
  $("btnCancelAccount").classList.remove("hidden");
  $("btnCancelAccount").textContent = t("cancel_edit");
}

function resetAccountForm() {
  state.editingAccountId = 0;
  $("accName").value = "";
  $("accType").value = "checking";
  $("accGroup").value = "bank";
  $("accBal").value = "0";
  $("btnAddAccount").textContent = t("add_account");
  $("btnCancelAccount").textContent = t("cancel_edit");
  $("btnCancelAccount").classList.add("hidden");
}

async function deleteAccount(acc) {
  try {
    try {
      await api(`/accounts/${acc.account_id}?user_id=${state.userId}`, {
        method: "DELETE",
      });
    } catch (e) {
      await api(`/accounts/${acc.account_id}/delete?user_id=${state.userId}`, {
        method: "POST",
      });
    }
    try {
      await refreshAll();
    } catch (e) {
      setStatus("health", `Deleted account, but refresh failed: ${errMessage(e)}`);
    }
  } catch (e) {
    notify(`Delete account failed: ${errMessage(e)}`);
  }
}

function beginEditTransaction(tx) {
  state.editingTxId = Number(tx.txn_id || 0);
  $("txType").value = String(tx.type || "expense");
  $("txAmount").value = String(Number(tx.amount || 0));
  $("txAccount").value = String(tx.account_id || "");
  $("txCategory").value = String(tx.category || "");
  $("txNote").value = String(tx.note || "");
  $("btnAddTx").textContent = t("update_tx");
  $("btnCancelTx").classList.remove("hidden");
  $("btnCancelTx").textContent = t("cancel_edit");
}

function resetTxForm() {
  state.editingTxId = 0;
  $("txType").value = "income";
  $("txAmount").value = "";
  $("txCategory").value = "";
  $("txNote").value = "";
  $("btnAddTx").textContent = t("add_tx");
  $("btnCancelTx").textContent = t("cancel_edit");
  $("btnCancelTx").classList.add("hidden");
}

async function deleteTransaction(tx) {
  try {
    try {
      await api(`/transactions/${tx.txn_id}?user_id=${state.userId}`, {
        method: "DELETE",
      });
    } catch (e) {
      await api(`/transactions/${tx.txn_id}/delete?user_id=${state.userId}`, {
        method: "POST",
      });
    }
    try {
      await refreshAll();
    } catch (e) {
      setStatus("health", `Deleted transaction, but refresh failed: ${errMessage(e)}`);
    }
  } catch (e) {
    notify(`Delete transaction failed: ${errMessage(e)}`);
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
  const ctx = $(id);
  if (!ctx) return;
  const entries = [...labelMap.entries()]
    .map(([k, v]) => [k, Number(v || 0)])
    .filter(([, v]) => v > 0);
  const labels = entries.map(([k]) => k);
  const data = entries.map(([, v]) => v);

  const card = ctx.closest(".chart-card");
  let empty = card ? card.querySelector(".chart-empty") : null;
  if (!empty && card) {
    empty = document.createElement("p");
    empty.className = "chart-empty";
    card.appendChild(empty);
  }

  if (state.charts[chartKey]) {
    state.charts[chartKey].destroy();
    state.charts[chartKey] = null;
  }

  if (labels.length === 0) {
    if (empty) {
      empty.textContent = "No data yet";
      empty.style.display = "block";
    }
    ctx.style.display = "none";
    return;
  }

  if (empty) empty.style.display = "none";
  ctx.style.display = "block";
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
  const availableBalance = state.accounts
    .filter((a) => !["credit", "credit_card"].includes(String(a.account_type || "").toLowerCase()))
    .reduce((s, a) => s + Number(a.balance || 0), 0);
  const debt = state.accounts
    .filter((a) => ["credit", "credit_card"].includes(String(a.account_type || "").toLowerCase()))
    .reduce((s, a) => s + Math.abs(Number(a.balance || 0)), 0);

  $("kpiNetWorth").textContent = fmtMoney(availableBalance);
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
  const labels = [t("date"), t("income"), t("expense"), t("net"), t("snapshot")];
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
    vals.forEach((v, idx) => {
      const td = document.createElement("td");
      td.textContent = String(v);
      td.setAttribute("data-label", labels[idx]);
      tr.appendChild(td);
    });
    rows.appendChild(tr);
  });
}

async function downloadSummaryPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    notify("PDF library failed to load.");
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
  const availableBalance = state.accounts
    .filter((a) => !["credit", "credit_card"].includes(String(a.account_type || "").toLowerCase()))
    .reduce((s, a) => s + Number(a.balance || 0), 0);
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
  doc.text(`Available Balance: ${fmtMoney(availableBalance)}`, 36, 110);
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
    api(`/profile?user_id=${state.userId}`),
    api(`/accounts?user_id=${state.userId}`),
    api(`/categories?user_id=${state.userId}`),
    api(`/transactions?user_id=${state.userId}`),
    api(`/daily_balances?user_id=${state.userId}`),
  ]);

  const [profileRes, accountsRes, categoriesRes, txRes, dailyRes] = results;
  state.profile = profileRes.status === "fulfilled" ? (profileRes.value || {}) : (state.profile || {});
  if (state.profile && state.profile.name) {
    state.userName = String(state.profile.name || state.userName || "");
  }
  state.accounts = accountsRes.status === "fulfilled" ? (accountsRes.value || []) : [];
  state.categories = categoriesRes.status === "fulfilled" ? (categoriesRes.value || []) : [];
  state.tx = txRes.status === "fulfilled" ? (txRes.value || []) : [];
  state.daily = dailyRes.status === "fulfilled" ? (dailyRes.value || []) : [];
  applyTxRange();

  renderProfile();
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
  const savedLang = localStorage.getItem("keeperbma_lang") || "en";
  if ($("langSelect")) {
    $("langSelect").onchange = (e) => applyLanguage(e.target.value);
  }
  if ($("appLangSelect")) {
    $("appLangSelect").onchange = (e) => applyLanguage(e.target.value);
  }
  applyLanguage(savedLang);

  if ($("btnNavLogin")) $("btnNavLogin").onclick = () => showAuth("login");
  if ($("btnNavRegister")) $("btnNavRegister").onclick = () => showAuth("register");
  if ($("btnHeroLogin")) $("btnHeroLogin").onclick = () => showAuth("login");
  if ($("btnHeroRegister")) $("btnHeroRegister").onclick = () => showAuth("register");
  document.querySelectorAll("[data-signup-plan]").forEach((btn) => {
    btn.onclick = () => {
      const planCode = String(btn.getAttribute("data-signup-plan") || "").trim().toLowerCase();
      showAuth("register", { planCode });
    };
  });
  if ($("btnOpenSettings")) $("btnOpenSettings").onclick = () => { window.location.href = "./settings.html"; };
  if ($("profileImageInput")) {
    $("profileImageInput").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!String(file.type || "").startsWith("image/")) {
        setStatus("profileStatus", "Please select an image file.");
        e.target.value = "";
        return;
      }
      if (Number(file.size || 0) > 1_500_000) {
        setStatus("profileStatus", "Image is too large. Use image under 1.5 MB.");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        state.pendingProfileImage = String(reader.result || "");
        if ($("profileAvatarPreview")) $("profileAvatarPreview").src = state.pendingProfileImage;
      };
      reader.readAsDataURL(file);
    };
  }
  if ($("btnRemoveProfileImage")) {
    $("btnRemoveProfileImage").onclick = () => {
      state.pendingProfileImage = "";
      if ($("profileAvatarPreview")) $("profileAvatarPreview").src = "../../assets/keeperbma-icon.png";
      setStatus("profileStatus", "");
    };
  }
  if ($("btnSaveProfile")) {
    $("btnSaveProfile").onclick = async () => {
      try {
        const payload = {
          user_id: state.userId,
          name: $("profileUsername").value.trim(),
          email: $("profileEmail").value.trim(),
          phone: $("profilePhone").value.trim(),
          email_notifications_enabled: Boolean($("profileEmailNotifications").checked),
          profile_image_url: state.pendingProfileImage !== null
            ? String(state.pendingProfileImage)
            : String((state.profile || {}).profile_image_url || ""),
        };
        if (!payload.name || !payload.email || !payload.phone) {
          setStatus("profileStatus", "Username, email, and phone are required.");
          return;
        }
        const out = await api("/profile", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        state.profile = out || {};
        state.userName = String(state.profile.name || state.userName || "");
        state.pendingProfileImage = null;
        renderProfile();
        setScreen(true);
        setStatus("profileStatus", t("profile_saved"));
      } catch (e) {
        setStatus("profileStatus", errMessage(e));
      }
    };
  }
  if ($("btnChangePassword")) {
    $("btnChangePassword").onclick = async () => {
      try {
        const currentPassword = $("currentPassword").value || "";
        const newPassword = $("newPassword").value || "";
        const confirmNewPassword = $("confirmNewPassword").value || "";
        if (!currentPassword || !newPassword || !confirmNewPassword) {
          setStatus("passwordStatus", "Please fill all password fields.");
          return;
        }
        if (newPassword !== confirmNewPassword) {
          setStatus("passwordStatus", "Confirm password does not match.");
          return;
        }
        await api("/profile/password", {
          method: "PUT",
          body: JSON.stringify({
            user_id: state.userId,
            current_password: currentPassword,
            new_password: newPassword,
          }),
        });
        $("currentPassword").value = "";
        $("newPassword").value = "";
        $("confirmNewPassword").value = "";
        setStatus("passwordStatus", t("password_updated"));
      } catch (e) {
        setStatus("passwordStatus", errMessage(e));
      }
    };
  }
  document.querySelectorAll(".plan-btn").forEach((btn) => {
    btn.onclick = async () => {
      const planCode = String(btn.getAttribute("data-plan") || "").toLowerCase();
      if (!state.userId || !planCode) return;
      try {
        const out = await api("/billing/subscription", {
          method: "PUT",
          body: JSON.stringify({ user_id: state.userId, plan_code: planCode }),
        });
        state.subscription = out || {};
        renderSubscription();
        setStatus("planStatusMsg", t("plan_updated"));
      } catch (e) {
        setStatus("planStatusMsg", errMessage(e));
      }
    };
  });

  $("btnLogout").onclick = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (_) {}
    state.authToken = "";
    localStorage.removeItem("keeperbma_token");
    state.userId = 0;
    state.userName = "";
    state.accounts = [];
    state.categories = [];
    state.tx = [];
    state.daily = [];
    state.profile = {};
    state.pendingProfileImage = null;
    state.subscription = {};
    showLanding();
    setStatus("authStatus", "");
  };

  $("btnAddAccount").onclick = async () => {
    try {
      const payload = {
        user_id: state.userId,
        account_name: $("accName").value.trim(),
        account_type: $("accType").value,
        group_name: $("accGroup").value.trim() || "bank",
        balance: Number($("accBal").value || 0),
      };
      if (state.editingAccountId > 0) {
        await api(`/accounts/${state.editingAccountId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/accounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      resetAccountForm();
      await refreshAll();
    } catch (e) {
      notify(`Save account failed: ${errMessage(e)}`);
    }
  };
  $("btnCancelAccount").onclick = resetAccountForm;

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
      notify(`Add category failed: ${errMessage(e)}`);
    }
  };

  $("btnAddTx").onclick = async () => {
    try {
      const payload = {
        user_id: state.userId,
        tx_type: $("txType").value,
        amount: Number($("txAmount").value || 0),
        account_id: Number($("txAccount").value),
        category: $("txCategory").value.trim(),
        note: $("txNote").value.trim(),
      };
      if (state.editingTxId > 0) {
        await api(`/transactions/${state.editingTxId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      resetTxForm();
      await refreshAll();
    } catch (e) {
      notify(`Save transaction failed: ${errMessage(e)}`);
    }
  };
  $("btnCancelTx").onclick = resetTxForm;

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

  $("landingScreen").classList.add("hidden");
  $("appScreen").classList.add("hidden");
  $("landingScreen").style.display = "none";
  $("appScreen").style.display = "none";
  state.authToken = String(localStorage.getItem("keeperbma_token") || "");

  // Always restore active session on refresh/reopen.
  try {
    const session = await api("/auth/session");
    state.userId = Number(session.user_id);
    state.userName = String(session.name || `user-${session.user_id}`);
    state.profile = {
      name: String(session.name || ""),
      email: String(session.email || ""),
      phone: String(session.phone || ""),
      email_notifications_enabled: Boolean(
        session.email_notifications_enabled === undefined ? true : session.email_notifications_enabled
      ),
      profile_image_url: String(session.profile_image_url || ""),
    };
    state.subscription = {
      plan_code: String(session.plan_code || ""),
      subscription_status: String(session.subscription_status || ""),
      trial_ends_at: String(session.trial_ends_at || ""),
      trial_days_remaining: Number(session.trial_days_remaining || 0),
      is_lifetime: Boolean(session.is_lifetime || false),
    };
    setScreen(true);
    await refreshAll();
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch (_) {
    showLanding();
  }
});





