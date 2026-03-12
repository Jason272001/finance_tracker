const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "https://api.keeperbma.com",
  mode: "signin",
  lang: "en",
  theme: "light",
  signupPlan: "",
  signupBillingCycle: "monthly",
  signupWithWebsite: false,
  signupSkipBilling: false,
  billingReady: false,
  billingTrialDays: 60,
  signupBillingError: "",
  precheckoutSessionId: "",
  precheckoutEmail: "",
  stripe: null,
  embeddedCheckout: null,
};

const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const SIGNUP_WITH_WEBSITE_KEY = "keeperbma_signup_with_website";
const SIGNUP_COUPON_KEY = "keeperbma_signup_coupon";
const BILLING_CYCLE_KEY = "keeperbma_billing_cycle";
const SIGNUP_SKIP_BILLING_KEY = "keeperbma_signup_skip_billing";
const PRECHECKOUT_SESSION_KEY = "keeperbma_precheckout_session_id";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus"]);
const ALLOWED_BILLING_CYCLES = new Set(["monthly", "annual"]);
const DEFAULT_BILLING_CYCLE = "monthly";

const AUTH_I18N = {
  en: { signin: "Sign In", signup: "Sign Up", recover: "Recover", username: "Username", password: "Password", new_password: "New Password", confirm_password: "Confirm Password", forgot: "Forgot Password?", send_code: "Send Recovery Code", reset_password: "Reset Password", recovery_sent: "Recovery code sent. Check your email.", signup_ok: "Sign up successful. Redirecting...", signup_plan_selected: "Selected Plan", choose_plan_first: "Please choose a plan first from Home > Pricing.", plan_basic: "Basic", plan_regular: "Regular", plan_business: "Business", plan_premium_plus: "Premium Plus", plan_diamond: "Diamond", theme: "Theme", light_mode: "Light", dark_mode: "Dark", billing_title: "Billing Information", billing_hint: "Add a payment method now. You will not be charged until your 60-day free trial ends.", billing_load: "Load Secure Billing Form", billing_reset: "Reset Billing", billing_waiting: "Complete billing below before creating your account.", billing_loading: "Loading secure billing form...", billing_email_required: "Enter a valid email first to load billing.", billing_ready: "Billing method saved. You will be charged only after the 60-day free trial ends.", billing_lifetime: "Lifetime coupon verified. Billing is not required." },
  es: { signin: "Iniciar sesion", signup: "Registrarse", recover: "Recuperar", username: "Nombre de usuario", password: "Contrasena", new_password: "Nueva contrasena", confirm_password: "Confirmar contrasena", forgot: "Olvido su contrasena?", send_code: "Enviar codigo", reset_password: "Restablecer", recovery_sent: "Codigo enviado. Revise su correo.", signup_ok: "Registro exitoso. Redirigiendo..." },
  fr: { signin: "Se connecter", signup: "S'inscrire", recover: "Recuperer", username: "Nom d'utilisateur", password: "Mot de passe", new_password: "Nouveau mot de passe", confirm_password: "Confirmer le mot de passe", forgot: "Mot de passe oublie ?", send_code: "Envoyer le code", reset_password: "Reinitialiser", recovery_sent: "Code envoye. Verifiez votre email.", signup_ok: "Inscription reussie. Redirection..." },
  de: { signin: "Anmelden", signup: "Registrieren", recover: "Wiederherstellen", username: "Benutzername", password: "Passwort", new_password: "Neues Passwort", confirm_password: "Passwort bestaetigen", forgot: "Passwort vergessen?", send_code: "Code senden", reset_password: "Zuruecksetzen", recovery_sent: "Code gesendet. Bitte E-Mail pruefen.", signup_ok: "Registrierung erfolgreich. Weiterleitung..." },
};

function authT(key) {
  const pack = AUTH_I18N[state.lang] || AUTH_I18N.en;
  return pack[key] || AUTH_I18N.en[key] || key;
}

function normalizeSignupPlan(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  return ALLOWED_SIGNUP_PLANS.has(key) ? key : "";
}

function normalizeBillingCycle(cycle) {
  const key = String(cycle || "").trim().toLowerCase();
  return ALLOWED_BILLING_CYCLES.has(key) ? key : DEFAULT_BILLING_CYCLE;
}

function parseBoolFlag(value) {
  const key = String(value || "").trim().toLowerCase();
  return key === "1" || key === "true" || key === "yes" || key === "on";
}

function planLabel(planCode) {
  const key = normalizeSignupPlan(planCode);
  if (key === "premium_plus" && state.signupWithWebsite) {
    return authT("plan_diamond") || "Diamond";
  }
  const labels = {
    basic: authT("plan_basic"),
    regular: authT("plan_regular"),
    business: authT("plan_business"),
    premium_plus: authT("plan_premium_plus"),
  };
  return labels[key] || key;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function applyTheme(theme) {
  state.theme = String(theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
  localStorage.setItem("keeperbma_theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  const toggle = $("authThemeToggle");
  if (toggle) {
    const isDark = state.theme === "dark";
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("data-theme", state.theme);
  }
  if ($("authThemeLabel")) {
    $("authThemeLabel").textContent = `${authT("theme")}: ${state.theme === "dark" ? authT("dark_mode") : authT("light_mode")}`;
  }
}

function setSignupBillingStatus(msg) {
  const el = $("signupBillingStatus");
  if (el) el.textContent = msg || "";
}

function destroySignupEmbeddedCheckout() {
  try {
    if (state.embeddedCheckout && typeof state.embeddedCheckout.destroy === "function") {
      state.embeddedCheckout.destroy();
    }
  } catch (_) {}
  state.embeddedCheckout = null;
  const wrap = $("signupEmbeddedCheckoutWrap");
  if (wrap) wrap.classList.add("hidden");
}

function clearSignupBillingState({ clearSkip = true, clearEmail = false, clearStatus = false } = {}) {
  destroySignupEmbeddedCheckout();
  state.billingReady = false;
  state.signupBillingError = "";
  state.precheckoutSessionId = "";
  if (clearEmail) state.precheckoutEmail = "";
  localStorage.removeItem(PRECHECKOUT_SESSION_KEY);
  if (clearSkip) {
    state.signupSkipBilling = false;
    localStorage.removeItem(SIGNUP_SKIP_BILLING_KEY);
  }
  if ($("authEmail") && !state.billingReady) {
    $("authEmail").readOnly = false;
  }
  if (clearStatus) setSignupBillingStatus("");
}

function maybeAutoLoadSignupBilling() {
  if (state.mode !== "signup") return;
  if (!state.signupPlan) return;
  if (state.signupSkipBilling || state.billingReady) return;
  if (state.precheckoutSessionId || state.embeddedCheckout) return;
  const email = String($("authEmail")?.value || "").trim();
  if (!isValidEmail(email)) return;
  loadSignupBillingForm();
}

function renderSignupPlanBanner() {
  const banner = $("signupPlanBanner");
  if (!banner) return;
  const isSignup = state.mode === "signup";
  if (!isSignup || !state.signupPlan) {
    banner.classList.add("hidden");
    banner.textContent = "";
    return;
  }
  banner.classList.remove("hidden");
  banner.textContent = `${authT("signup_plan_selected")}: ${planLabel(state.signupPlan)}`;
}

function applyAuthLanguage(lang) {
  state.lang = AUTH_I18N[lang] ? lang : "en";
  localStorage.setItem("keeperbma_lang", state.lang);
  document.documentElement.lang = state.lang;
  if ($("authLangSelect")) $("authLangSelect").value = state.lang;
  if ($("tabSignin")) $("tabSignin").textContent = authT("signin");
  if ($("tabSignup")) $("tabSignup").textContent = authT("signup");
  if ($("tabRecover")) $("tabRecover").textContent = authT("recover");
  if ($("labelName")) $("labelName").textContent = authT("username");
  if ($("labelPassword")) $("labelPassword").textContent = state.mode === "recover" ? authT("new_password") : authT("password");
  if ($("labelConfirmPassword")) $("labelConfirmPassword").textContent = authT("confirm_password");
  if ($("btnForgot")) $("btnForgot").textContent = authT("forgot");
  if ($("btnSendCode")) $("btnSendCode").textContent = authT("send_code");
  if ($("billingPanelTitle")) $("billingPanelTitle").textContent = authT("billing_title");
  if ($("billingPanelHint")) {
    const baseHint = authT("billing_hint");
    $("billingPanelHint").textContent = baseHint.replace("60-day", `${state.billingTrialDays}-day`);
  }
  if ($("btnLoadSignupBilling")) $("btnLoadSignupBilling").textContent = authT("billing_load");
  if ($("btnResetSignupBilling")) $("btnResetSignupBilling").textContent = authT("billing_reset");
  renderSignupPlanBanner();
  applyTheme(state.theme);
}

function setStatus(msg) {
  $("authStatus").textContent = msg || "";
}

function renderSignupGate() {
  const gate = $("billingGateMsg");
  const isSignup = state.mode === "signup";
  const ready = Boolean(state.signupSkipBilling || state.billingReady);
  const lockSignup = isSignup && !ready;
  const emailInput = $("authEmail");

  if ($("authSubmit")) $("authSubmit").disabled = lockSignup;

  if (emailInput) {
    const billingEmail = String(state.precheckoutEmail || "").trim();
    if (isSignup && !state.signupSkipBilling && state.billingReady && billingEmail) {
      emailInput.value = billingEmail;
      emailInput.readOnly = true;
    } else {
      emailInput.readOnly = false;
    }
  }

  if (!gate) return;
  if (!isSignup) {
    gate.classList.add("hidden");
    gate.textContent = "";
    return;
  }
  gate.classList.remove("hidden");
  if (state.signupSkipBilling) {
    state.signupBillingError = "";
    gate.textContent = authT("billing_lifetime");
    return;
  }
  if (state.billingReady) {
    state.signupBillingError = "";
    gate.textContent = authT("billing_ready");
    return;
  }
  gate.textContent = authT("billing_waiting");
}

function renderSignupBillingPanel() {
  const panel = $("signupBillingCard");
  const loadBtn = $("btnLoadSignupBilling");
  const resetBtn = $("btnResetSignupBilling");
  const wrap = $("signupEmbeddedCheckoutWrap");
  if (!panel) return;
  const isSignup = state.mode === "signup";
  const hasPlan = Boolean(state.signupPlan);
  panel.classList.toggle("hidden", !(isSignup && hasPlan));
  if (!(isSignup && hasPlan)) return;

  if (loadBtn) loadBtn.classList.toggle("hidden", Boolean(state.billingReady || state.signupSkipBilling));
  if (resetBtn) resetBtn.classList.toggle("hidden", !(state.billingReady || state.precheckoutSessionId || state.signupSkipBilling));
  if (wrap) wrap.classList.toggle("hidden", !state.embeddedCheckout);

  if (state.signupSkipBilling) {
    setSignupBillingStatus(authT("billing_lifetime"));
  } else if (state.billingReady) {
    setSignupBillingStatus(authT("billing_ready"));
  } else if (state.signupBillingError) {
    setSignupBillingStatus(state.signupBillingError);
  } else if (!isValidEmail($("authEmail")?.value || "")) {
    setSignupBillingStatus(authT("billing_email_required"));
  } else if (!state.embeddedCheckout) {
    setSignupBillingStatus(authT("billing_waiting"));
  }
}

async function loadSignupBillingForm() {
  const signupPlan = normalizeSignupPlan(state.signupPlan);
  if (!signupPlan) {
    setStatus(authT("choose_plan_first"));
    return;
  }
  const email = String($("authEmail")?.value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    setSignupBillingStatus(authT("billing_email_required"));
    renderSignupBillingPanel();
    return;
  }

  clearSignupBillingState({ clearSkip: true, clearEmail: false, clearStatus: true });
  state.signupBillingError = "";
  setSignupBillingStatus(authT("billing_loading"));

  const couponRaw = String(localStorage.getItem(SIGNUP_COUPON_KEY) || "").trim().slice(0, 64);
  const cycle = normalizeBillingCycle(state.signupBillingCycle);
  const withWebsite = Boolean(state.signupWithWebsite);
  const returnUrl = buildAppUrl(
    `./auth.html?mode=signup&plan=${encodeURIComponent(signupPlan)}&cycle=${encodeURIComponent(cycle)}&website=${withWebsite ? "1" : "0"}`
  );

  try {
    const out = await api("/billing/precheckout/embedded", {
      method: "POST",
      body: JSON.stringify({
        plan_code: signupPlan,
        billing_cycle: cycle,
        with_website: withWebsite,
        coupon_code: couponRaw,
        email,
        return_url: returnUrl,
      }),
    });

    state.billingTrialDays = Number(out?.trial_days || state.billingTrialDays || 60);
    if (Boolean(out?.skip_checkout)) {
      state.signupSkipBilling = true;
      state.billingReady = true;
      state.signupBillingError = "";
      state.precheckoutEmail = email;
      localStorage.setItem(SIGNUP_SKIP_BILLING_KEY, "1");
      renderSignupGate();
      renderSignupBillingPanel();
      return;
    }

    const publishableKey = String(out?.publishable_key || "").trim();
    const clientSecret = String(out?.client_secret || "").trim();
    const sessionId = String(out?.session_id || "").trim();
    if (!publishableKey || !clientSecret || !sessionId) {
      throw new Error("Stripe embedded checkout is missing required configuration.");
    }

    state.signupSkipBilling = false;
    state.billingReady = false;
    state.signupBillingError = "";
    state.precheckoutEmail = email;
    state.precheckoutSessionId = sessionId;
    localStorage.removeItem(SIGNUP_SKIP_BILLING_KEY);
    localStorage.setItem(PRECHECKOUT_SESSION_KEY, sessionId);

    if (typeof window.Stripe !== "function") {
      throw new Error("Stripe.js failed to load.");
    }
    state.stripe = window.Stripe(publishableKey);

    const checkout = await state.stripe.initEmbeddedCheckout({
      fetchClientSecret: async () => clientSecret,
      onComplete: async () => {
        try {
          const checkoutInfo = await verifyPrecheckoutSession(state.precheckoutSessionId, signupPlan);
          state.billingReady = true;
          state.signupBillingError = "";
          state.precheckoutEmail = String(checkoutInfo?.customer_email || email).trim();
          destroySignupEmbeddedCheckout();
          renderSignupGate();
          renderSignupBillingPanel();
        } catch (e) {
          state.signupBillingError = errMessage(e);
          setSignupBillingStatus(state.signupBillingError);
        }
      },
    });

    state.embeddedCheckout = checkout;
    const wrap = $("signupEmbeddedCheckoutWrap");
    if (wrap) wrap.classList.remove("hidden");
    checkout.mount("#signupEmbeddedCheckoutContainer");
    renderSignupGate();
    renderSignupBillingPanel();
  } catch (e) {
    clearSignupBillingState({ clearSkip: false, clearEmail: false, clearStatus: false });
    state.signupBillingError = errMessage(e);
    setSignupBillingStatus(state.signupBillingError);
    renderSignupGate();
    renderSignupBillingPanel();
  }
}

function setMode(mode) {
  if (mode === "signup" && !state.signupPlan) {
    state.mode = "signin";
    setStatus(authT("choose_plan_first"));
  } else if (mode === "signup" || mode === "recover") state.mode = mode;
  else state.mode = "signin";
  const isSignin = state.mode === "signin";
  const isSignup = state.mode === "signup";
  const isRecover = state.mode === "recover";
  $("tabSignin").classList.toggle("active", isSignin);
  $("tabSignup").classList.toggle("active", isSignup);
  $("tabRecover").classList.toggle("active", isRecover);
  $("signupFields").classList.toggle("hidden", !isSignup);
  $("recoverFields").classList.toggle("hidden", !isRecover);
  $("confirmWrap").classList.toggle("hidden", !(isSignup || isRecover));
  $("btnForgot").classList.toggle("hidden", !isSignin);
  $("labelName").classList.toggle("hidden", isRecover);
  $("authName").classList.toggle("hidden", isRecover);
  $("labelPassword").textContent = isRecover ? authT("new_password") : authT("password");
  $("authPass").placeholder = isRecover ? authT("new_password") : authT("password");
  $("authSubmit").textContent = isSignin ? authT("signin") : (isSignup ? authT("signup") : authT("reset_password"));
  document.title = isSignin ? "KeeperBMA - Sign In" : (isSignup ? "KeeperBMA - Sign Up" : "KeeperBMA - Recover Password");
  applyAuthLanguage(state.lang);
  renderSignupGate();
  renderSignupBillingPanel();
  if (!(mode === "signup" && !state.signupPlan)) setStatus("");
  renderSignupPlanBanner();
}

function errMessage(e) {
  const normalize = (msg) => {
    const text = String(msg || "").trim();
    if (!text) return "Unknown error";
    if (/at least 10 characters/i.test(text)) return "Password must be at least 10 characters.";
    if (/no such price/i.test(text)) return "Billing is unavailable because Stripe price configuration is invalid. Update the STRIPE_PRICE_* values in Render.";
    return text;
  };
  if (!e) return "Unknown error";
  if (typeof e === "string") return normalize(e);
  if (e instanceof Error) return normalize(e.message || String(e));
  if (typeof e.message === "string") return normalize(e.message);
  if (e && typeof e.detail === "string") return normalize(e.detail);
  if (Array.isArray(e?.detail)) {
    return normalize(e.detail
      .map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
      .join("; "));
  }
  try {
    return normalize(JSON.stringify(e));
  } catch (_) {
    return normalize(String(e));
  }
}

function buildAppUrl(pathWithQuery) {
  return new URL(pathWithQuery, window.location.href).toString();
}

async function verifyPrecheckoutSession(sessionId, planCode) {
  const sid = String(sessionId || "").trim();
  const plan = normalizeSignupPlan(planCode);
  if (!sid || !plan) {
    throw new Error("Complete billing setup on the plan page first.");
  }
  return api(
    `/billing/precheckout/session?session_id=${encodeURIComponent(sid)}&plan_code=${encodeURIComponent(plan)}`
  );
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !Object.keys(headers).some((k) => String(k).toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const token = String(localStorage.getItem("keeperbma_token") || "");
  if (token && !Object.keys(headers).some((k) => String(k).toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${state.apiBase}${path}`, {
    credentials: "include",
    headers,
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (typeof body?.detail === "string") throw new Error(body.detail);
    if (Array.isArray(body?.detail)) {
      const msg = body.detail
        .map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
        .join("; ");
      throw new Error(msg || `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

window.addEventListener("load", async () => {
  const q = new URLSearchParams(window.location.search);
  const explicitMode = String(q.get("mode") || "").trim().toLowerCase();
  const queryPlan = normalizeSignupPlan(q.get("plan"));
  const rawQueryCycle = String(q.get("cycle") || "").trim().toLowerCase();
  const queryCycle = rawQueryCycle ? normalizeBillingCycle(rawQueryCycle) : "";
  const queryWebsiteRaw = String(q.get("website") || "").trim();
  const queryWebsiteProvided = queryWebsiteRaw !== "";
  const queryWebsite = parseBoolFlag(queryWebsiteRaw);
  const queryCoupon = String(q.get("coupon") || "").trim();
  const querySkipBilling = parseBoolFlag(q.get("skip_billing"));
  const querySessionId = String(q.get("checkout_session_id") || "").trim();
  if (queryPlan) localStorage.setItem(SIGNUP_PLAN_KEY, queryPlan);
  if (queryCycle) localStorage.setItem(BILLING_CYCLE_KEY, queryCycle);
  if (queryWebsiteProvided) localStorage.setItem(SIGNUP_WITH_WEBSITE_KEY, queryWebsite ? "1" : "0");
  if (queryCoupon) localStorage.setItem(SIGNUP_COUPON_KEY, queryCoupon);
  if (querySkipBilling) localStorage.setItem(SIGNUP_SKIP_BILLING_KEY, "1");
  if (querySessionId) localStorage.setItem(PRECHECKOUT_SESSION_KEY, querySessionId);
  state.signupPlan = queryPlan || normalizeSignupPlan(localStorage.getItem(SIGNUP_PLAN_KEY));
  state.signupBillingCycle = queryCycle || normalizeBillingCycle(localStorage.getItem(BILLING_CYCLE_KEY));
  state.signupWithWebsite = queryWebsiteProvided
    ? queryWebsite
    : parseBoolFlag(localStorage.getItem(SIGNUP_WITH_WEBSITE_KEY));
  state.signupSkipBilling = querySkipBilling || parseBoolFlag(localStorage.getItem(SIGNUP_SKIP_BILLING_KEY));
  state.precheckoutSessionId = querySessionId || String(localStorage.getItem(PRECHECKOUT_SESSION_KEY) || "").trim();
  if (state.signupPlan !== "premium_plus") state.signupWithWebsite = false;
  const savedLang = String(localStorage.getItem("keeperbma_lang") || "en");
  state.lang = AUTH_I18N[savedLang] ? savedLang : "en";
  state.theme = String(localStorage.getItem("keeperbma_theme") || "light").trim().toLowerCase() === "dark" ? "dark" : "light";
  setMode(q.get("mode") || "signin");
  if (state.mode === "signup" && state.signupPlan && !state.signupSkipBilling && state.precheckoutSessionId) {
    try {
      const checkout = await verifyPrecheckoutSession(state.precheckoutSessionId, state.signupPlan);
      state.billingReady = true;
      state.precheckoutEmail = String(checkout?.customer_email || "").trim();
    } catch (e) {
      state.billingReady = false;
      state.precheckoutEmail = "";
      localStorage.removeItem(PRECHECKOUT_SESSION_KEY);
      state.precheckoutSessionId = "";
      if (String(q.get("billing") || "").trim().toLowerCase() === "success" || querySessionId) {
        setStatus(errMessage(e));
      }
    }
  } else if (state.signupSkipBilling) {
    state.billingReady = true;
  } else {
    state.billingReady = false;
  }
  if ($("authLangSelect")) {
    $("authLangSelect").value = state.lang;
    $("authLangSelect").onchange = (e) => applyAuthLanguage(String(e.target.value || "en"));
  }
  if ($("authThemeToggle")) {
    $("authThemeToggle").onclick = () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    };
  }
  if ($("btnLoadSignupBilling")) {
    $("btnLoadSignupBilling").onclick = () => {
      loadSignupBillingForm();
    };
  }
  if ($("btnResetSignupBilling")) {
    $("btnResetSignupBilling").onclick = () => {
      clearSignupBillingState({ clearSkip: true, clearEmail: true, clearStatus: true });
      renderSignupGate();
      renderSignupBillingPanel();
    };
  }
  if ($("authEmail")) {
    $("authEmail").addEventListener("input", () => {
      const currentEmail = String($("authEmail").value || "").trim().toLowerCase();
      const billingEmail = String(state.precheckoutEmail || "").trim().toLowerCase();
      if ((state.billingReady || state.precheckoutSessionId || state.embeddedCheckout) && billingEmail && currentEmail !== billingEmail) {
        clearSignupBillingState({ clearSkip: false, clearEmail: false, clearStatus: true });
      }
      renderSignupGate();
      renderSignupBillingPanel();
    });
    $("authEmail").addEventListener("blur", () => {
      maybeAutoLoadSignupBilling();
    });
  }
  applyAuthLanguage(state.lang);
  applyTheme(state.theme);
  renderSignupGate();
  renderSignupBillingPanel();

  $("tabSignin").onclick = () => setMode("signin");
  $("tabSignup").onclick = () => {
    if (!state.signupPlan) {
      setStatus(authT("choose_plan_first"));
      return;
    }
    setMode("signup");
  };
  $("tabRecover").onclick = () => setMode("recover");
  $("btnForgot").onclick = () => setMode("recover");
  $("btnSendCode").onclick = async () => {
    try {
      const email = $("recoverEmail").value.trim();
      if (!email) {
        setStatus("Email is required.");
        return;
      }
      await api("/auth/recover/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStatus(authT("recovery_sent"));
    } catch (e) {
      setStatus(errMessage(e));
    }
  };

  $("authSubmit").onclick = async () => {
    try {
      const name = $("authName").value.trim();
      const password = $("authPass").value;
      const password2 = $("authPassConfirm").value;
      if (state.mode !== "recover" && !name) {
        setStatus("Username is required.");
        return;
      }
      if (!password) {
        setStatus(state.mode === "recover" ? "New password is required." : "Password is required.");
        return;
      }

      if (state.mode === "signup") {
        const signupPlan = normalizeSignupPlan(state.signupPlan);
        if (!signupPlan) {
          setStatus(authT("choose_plan_first"));
          return;
        }
        if (!state.signupSkipBilling && !state.billingReady) {
          setStatus(authT("billing_waiting"));
          return;
        }
        const countryCode = $("authCountryCode").value.trim();
        const localPhone = $("authPhoneLocal").value.trim();
        const normalizedLocalPhone = localPhone.replace(/[^\d]/g, "");
        const couponRaw = String(localStorage.getItem(SIGNUP_COUPON_KEY) || "").trim().slice(0, 64);
        const payload = {
          name,
          email: $("authEmail").value.trim(),
          phone: `${countryCode} ${normalizedLocalPhone}`.trim(),
          coupon_code: couponRaw,
          plan_code: signupPlan,
          password,
          checkout_session_id: state.signupSkipBilling ? "" : state.precheckoutSessionId,
        };
        if (password !== password2) {
          setStatus("Confirm password does not match.");
          return;
        }
        if (!payload.email || !countryCode || !normalizedLocalPhone || !payload.password) {
          setStatus("Username, email, phone, and password are required.");
          return;
        }
        if (normalizedLocalPhone.length < 6) {
          setStatus("Phone number is too short.");
          return;
        }
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const out = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ name: payload.name, password }),
        });
        const token = String(out.token || "");
        if (token) localStorage.setItem("keeperbma_token", token);
        localStorage.setItem(BILLING_CYCLE_KEY, normalizeBillingCycle(state.signupBillingCycle));
        localStorage.removeItem(SIGNUP_PLAN_KEY);
        localStorage.removeItem(SIGNUP_WITH_WEBSITE_KEY);
        localStorage.removeItem(SIGNUP_COUPON_KEY);
        localStorage.removeItem(SIGNUP_SKIP_BILLING_KEY);
        localStorage.removeItem(PRECHECKOUT_SESSION_KEY);
        const isLifetime = Boolean(out.is_lifetime || out.lifetime_access);
        if (isLifetime) setStatus(authT("signup_ok"));
        window.location.href = "./index.html?app=1";
        return;
      }

      if (state.mode === "recover") {
        if (password !== password2) {
          setStatus("Confirm password does not match.");
          return;
        }
        const payload = {
          email: $("recoverEmail").value.trim(),
          code: $("recoverCode").value.trim(),
          new_password: password,
        };
        if (!payload.email || !payload.code || !payload.new_password) {
          setStatus("Email, recovery code, and new password are required.");
          return;
        }
        await api("/auth/recover/confirm", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStatus("Password reset successful. Please sign in.");
        setMode("signin");
        $("authPass").value = "";
        $("authPassConfirm").value = "";
        return;
      }

      const payload = {
        name,
        password,
      };
      const out = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const token = String(out.token || "");
      if (token) localStorage.setItem("keeperbma_token", token);
      window.location.href = "./index.html?app=1";
    } catch (e) {
      setStatus(errMessage(e));
    }
  };

  // If user explicitly opens sign-in/sign-up/recover, do not auto-redirect.
  // This allows switching accounts without forcing logout first.
  if (!explicitMode) {
    try {
      await api("/auth/session");
      window.location.href = "./index.html?app=1";
    } catch (_) {}
  }
});
