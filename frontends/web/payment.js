const $ = (id) => document.getElementById(id);

class ApiError extends Error {
  constructor(message, status = 500, payload = {}) {
    super(message || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = Number(status || 500);
    this.payload = payload || {};
  }
}

const state = {
  apiBase: "https://api.keeperbma.com",
  token: "",
  lang: "en",
  theme: "light",
  paymentUrl: "",
  activating: false,
};

const PAYMENT_I18N = {
  en: {
    theme: "Theme",
    light_mode: "Light",
    dark_mode: "Dark",
    home: "Home",
    title: "Payment Information",
    subtitle: "Add billing details to activate your account. You will not be charged until the free trial period ends.",
    plan: "Plan",
    cycle: "Billing Cycle",
    email: "Email",
    phone: "Phone",
    payment_status: "Payment Status",
    trial_status: "Trial Status",
    message: "Message",
    add_payment: "Add Payment Information",
    retry_payment: "Try Payment Again",
    to_login: "Go To Login",
    activating: "Finalizing payment information...",
    activated: "Payment information saved. Redirecting to sign in...",
    canceled: "Payment setup was canceled. Complete billing to activate your account.",
    cycle_monthly: "Monthly",
    cycle_annual: "Annual",
    status_pending: "Pending",
    status_active: "Active",
    plan_basic: "Basic",
    plan_regular: "Regular",
    plan_business: "Business",
    plan_premium_plus: "Premium Plus",
    plan_diamond: "Diamond",
  },
};

function paymentT(key) {
  const pack = PAYMENT_I18N[state.lang] || PAYMENT_I18N.en;
  return pack[key] || PAYMENT_I18N.en[key] || key;
}

function parseBoolFlag(value) {
  const key = String(value || "").trim().toLowerCase();
  return key === "1" || key === "true" || key === "yes" || key === "on";
}

function applyTheme(theme) {
  state.theme = String(theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
  localStorage.setItem("keeperbma_theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  const toggle = $("paymentThemeToggle");
  if (toggle) {
    const isDark = state.theme === "dark";
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("data-theme", state.theme);
  }
  if ($("paymentThemeLabel")) {
    $("paymentThemeLabel").textContent = `${paymentT("theme")}: ${state.theme === "dark" ? paymentT("dark_mode") : paymentT("light_mode")}`;
  }
}

function applyLanguage(lang) {
  state.lang = PAYMENT_I18N[lang] ? lang : "en";
  localStorage.setItem("keeperbma_lang", state.lang);
  document.documentElement.lang = state.lang;
  if ($("paymentLangSelect")) $("paymentLangSelect").value = state.lang;
  if ($("paymentTitle")) $("paymentTitle").textContent = paymentT("title");
  if ($("paymentSubtitle")) $("paymentSubtitle").textContent = paymentT("subtitle");
  const homeLinks = document.querySelectorAll("[data-payment-home]");
  homeLinks.forEach((link) => {
    link.textContent = paymentT("home");
  });
  if ($("labelPlan")) $("labelPlan").textContent = paymentT("plan");
  if ($("labelCycle")) $("labelCycle").textContent = paymentT("cycle");
  if ($("labelEmail")) $("labelEmail").textContent = paymentT("email");
  if ($("labelPhone")) $("labelPhone").textContent = paymentT("phone");
  if ($("labelPaymentStatus")) $("labelPaymentStatus").textContent = paymentT("payment_status");
  if ($("labelTrialStatus")) $("labelTrialStatus").textContent = paymentT("trial_status");
  if ($("labelMessage")) $("labelMessage").textContent = paymentT("message");
  if ($("btnPaymentContinue")) $("btnPaymentContinue").textContent = paymentT("add_payment");
  if ($("btnPaymentLogin")) $("btnPaymentLogin").textContent = paymentT("to_login");
  applyTheme(state.theme);
}

function setStatus(message, kind = "info") {
  const el = $("paymentStatus");
  if (!el) return;
  el.textContent = message || "";
  el.dataset.kind = kind;
}

function disablePaymentButton(disabled) {
  const btn = $("btnPaymentContinue");
  if (btn) btn.disabled = Boolean(disabled);
}

function planLabel(planCode, withWebsite) {
  const key = String(planCode || "").trim().toLowerCase();
  if (key === "premium_plus" && Boolean(withWebsite)) return paymentT("plan_diamond");
  const labels = {
    basic: paymentT("plan_basic"),
    regular: paymentT("plan_regular"),
    business: paymentT("plan_business"),
    premium_plus: paymentT("plan_premium_plus"),
  };
  return labels[key] || key || "-";
}

function cycleLabel(cycle) {
  const key = String(cycle || "").trim().toLowerCase();
  return key === "annual" ? paymentT("cycle_annual") : paymentT("cycle_monthly");
}

function statusLabel(prefix, value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "active") return paymentT("status_active");
  if (key === "pending") return paymentT("status_pending");
  return key || "-";
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !Object.keys(headers).some((k) => String(k).toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${state.apiBase}${path}`, {
    credentials: "include",
    headers,
    ...opts,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof payload?.detail === "string" ? payload.detail : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status, payload);
  }
  return payload;
}

function renderContext(data) {
  $("paymentPlanValue").textContent = planLabel(data.plan_code, data.plan_with_website);
  $("paymentCycleValue").textContent = cycleLabel(data.billing_cycle);
  $("paymentEmailValue").textContent = data.email || "-";
  $("paymentPhoneValue").textContent = data.phone || "-";
  $("paymentStatusValue").textContent = statusLabel("payment", data.payment_status);
  $("paymentTrialValue").textContent = statusLabel("trial", data.trial_status);
  $("paymentMessageValue").textContent = data.message || paymentT("subtitle");
  if (data.already_active) {
    disablePaymentButton(true);
    $("btnPaymentContinue").textContent = paymentT("to_login");
    $("btnPaymentContinue").onclick = () => {
      window.location.href = "./auth?mode=signin&payment=success";
    };
  }
}

async function loadContext() {
  const context = await api("/billing/pending/context", {
    method: "POST",
    body: JSON.stringify({ token: state.token }),
  });
  renderContext(context);
  return context;
}

async function activatePayment(sessionId) {
  if (state.activating) return;
  state.activating = true;
  disablePaymentButton(true);
  setStatus(paymentT("activating"), "info");
  const out = await api("/billing/pending/activate", {
    method: "POST",
    body: JSON.stringify({ token: state.token, session_id: sessionId }),
  });
  setStatus(paymentT("activated"), "success");
  window.setTimeout(() => {
    window.location.href = out.login_url || "./auth?mode=signin&payment=success";
  }, 800);
}

async function startCheckout() {
  disablePaymentButton(true);
  setStatus(paymentT("subtitle"), "info");
  const out = await api("/billing/pending/checkout", {
    method: "POST",
    body: JSON.stringify({ token: state.token }),
  });
  if (out.already_active) {
    window.location.href = "./auth?mode=signin&payment=success";
    return;
  }
  if (!out.url) throw new Error("Stripe checkout URL was not returned.");
  window.location.href = out.url;
}

window.addEventListener("load", async () => {
  const q = new URLSearchParams(window.location.search);
  state.token = String(q.get("token") || "").trim();
  const billingState = String(q.get("billing") || "").trim().toLowerCase();
  const sessionId = String(q.get("checkout_session_id") || "").trim();
  const savedLang = String(localStorage.getItem("keeperbma_lang") || "en");
  state.lang = PAYMENT_I18N[savedLang] ? savedLang : "en";
  state.theme = String(localStorage.getItem("keeperbma_theme") || "light").trim().toLowerCase() === "dark" ? "dark" : "light";

  applyLanguage(state.lang);
  applyTheme(state.theme);

  if ($("paymentLangSelect")) {
    $("paymentLangSelect").value = state.lang;
    $("paymentLangSelect").onchange = (e) => applyLanguage(String(e.target.value || "en"));
  }
  if ($("paymentThemeToggle")) {
    $("paymentThemeToggle").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
  }
  $("btnPaymentLogin").onclick = () => {
    window.location.href = "./auth?mode=signin";
  };

  if (!state.token) {
    setStatus("Payment link is invalid or expired.", "error");
    disablePaymentButton(true);
    return;
  }

  try {
    const context = await loadContext();
    const invalidPlaceholderSession =
      !sessionId ||
      sessionId === "{CHECKOUT_SESSION_ID}" ||
      sessionId.includes("{CHECKOUT_SESSION_ID}");
    if (context.already_active) {
      if (billingState === "success") {
        setStatus(paymentT("activated"), "success");
      }
      return;
    }
    if (billingState === "success" && sessionId) {
      if (invalidPlaceholderSession) {
        setStatus("Stripe return link is missing the checkout session id. Please try signing in. If your account is not active yet, reopen payment and submit billing once more.", "warning");
        return;
      }
      await activatePayment(sessionId);
      return;
    }
    if (billingState === "cancel") {
      setStatus(paymentT("canceled"), "warning");
      $("btnPaymentContinue").textContent = paymentT("retry_payment");
    }
    $("btnPaymentContinue").onclick = async () => {
      try {
        await startCheckout();
      } catch (error) {
        disablePaymentButton(false);
        setStatus(String(error.message || error), "error");
      }
    };
  } catch (error) {
    disablePaymentButton(true);
    setStatus(String(error.message || error), "error");
  }
});
