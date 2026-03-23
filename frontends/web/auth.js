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
  websiteBase: "https://keeperbma.com",
  mode: "signin",
  lang: "en",
  theme: "light",
  signupPlan: "",
  signupBillingCycle: "monthly",
  signupWithWebsite: false,
  pendingPaymentUrl: "",
  mobilePlatform: "",
  isCompanionApp: false,
};

const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const SIGNUP_WITH_WEBSITE_KEY = "keeperbma_signup_with_website";
const SIGNUP_COUPON_KEY = "keeperbma_signup_coupon";
const BILLING_CYCLE_KEY = "keeperbma_billing_cycle";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus"]);
const ALLOWED_BILLING_CYCLES = new Set(["monthly", "annual"]);
const DEFAULT_BILLING_CYCLE = "monthly";

const AUTH_I18N = {
  en: {
    signin: "Sign In",
    signup: "Sign Up",
    recover: "Recover",
    username: "Username",
    password: "Password",
    new_password: "New Password",
    confirm_password: "Confirm Password",
    email: "Email",
    phone: "Phone",
    home: "Home",
    choose_plan_first: "Please choose a plan first from Home > Pricing.",
    signup_plan_selected: "Selected Plan",
    signup_info: "Your account will be created first. Payment information is added on the next page. You will not be charged until the free trial period ends.",
    forgot: "Forgot Password?",
    send_code: "Send Recovery Code",
    reset_password: "Reset Password",
    recovery_sent: "Recovery code sent. Check your email.",
    signup_pending: "Account created. Redirecting to payment...",
    signup_lifetime_ok: "Account created successfully. Please sign in to continue.",
    payment_required: "Payment information is required to activate your account. You will not be charged until the trial period ends.",
    add_payment: "Add Payment Information",
    close: "Close",
    account_created_payment_required: "Account created successfully. Continue to payment to activate your account.",
    payment_saved: "Payment information saved. Please sign in.",
    payment_canceled: "Payment setup was canceled. Complete payment information to activate your account.",
    theme: "Theme",
    light_mode: "Light",
    dark_mode: "Dark",
    mobile_notice_title: "Don't Have an Account Yet?",
    mobile_notice_message: "If you don't have an account yet, sign up on the KeeperBMA website. Existing users can sign in below.",
    mobile_billing_on_website: "Account signup and billing are managed on the KeeperBMA website.",
    open_website: "Sign Up Here",
    plan_basic: "Basic",
    plan_regular: "Regular",
    plan_business: "Business",
    plan_premium_plus: "Premium Plus",
    plan_diamond: "Diamond",
  },
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
  if (key === "premium_plus" && state.signupWithWebsite) return authT("plan_diamond");
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

function websiteUrl(path = "/") {
  const cleanPath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${state.websiteBase}${cleanPath}`;
}

function openWebsite(url) {
  const target = String(url || websiteUrl("/")).trim();
  if (!target) return;
  const popup = window.open(target, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.href = target;
  }
}

function isMobileCompanionPlatform(value) {
  const key = String(value || "").trim().toLowerCase();
  return key === "android" || key === "ios";
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
  if ($("labelEmail")) $("labelEmail").textContent = authT("email");
  if ($("labelPhone")) $("labelPhone").textContent = authT("phone");
  if ($("btnForgot")) $("btnForgot").textContent = authT("forgot");
  if ($("btnSendCode")) $("btnSendCode").textContent = authT("send_code");
  if ($("pendingPaymentTitle")) $("pendingPaymentTitle").textContent = authT("payment_required");
  if ($("pendingPaymentAction")) $("pendingPaymentAction").textContent = authT("add_payment");
  if ($("pendingPaymentClose")) $("pendingPaymentClose").textContent = authT("close");
  if ($("signupInfoHint")) $("signupInfoHint").textContent = authT("signup_info");
  if ($("mobileAuthNoticeTitle")) $("mobileAuthNoticeTitle").textContent = authT("mobile_notice_title");
  if ($("mobileAuthNoticeMessage")) $("mobileAuthNoticeMessage").textContent = authT("mobile_notice_message");
  if ($("mobileWebsiteBtn")) $("mobileWebsiteBtn").textContent = authT("open_website");
  const homeLinks = document.querySelectorAll("[data-auth-home]");
  homeLinks.forEach((link) => {
    link.textContent = authT("home");
    if (state.isCompanionApp) {
      link.setAttribute("href", websiteUrl("/"));
    }
  });
  renderSignupPlanBanner();
  applyTheme(state.theme);
  renderMobileAuthNotice();
}

function setStatus(msg) {
  const el = $("authStatus");
  if (el) el.textContent = msg || "";
}

function disableSubmit(disabled) {
  const btn = $("authSubmit");
  if (btn) btn.disabled = Boolean(disabled);
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

function renderMobileAuthNotice() {
  const notice = $("mobileAuthNotice");
  if (!notice) return;
  notice.classList.toggle("hidden", !state.isCompanionApp);
}

function hidePendingPaymentModal() {
  const modal = $("pendingPaymentModal");
  if (modal) modal.classList.add("hidden");
  state.pendingPaymentUrl = "";
}

function showPendingPaymentModal(message, paymentUrl) {
  state.pendingPaymentUrl = String(paymentUrl || "").trim();
  if ($("pendingPaymentMessage")) {
    $("pendingPaymentMessage").textContent = message || authT("payment_required");
  }
  const modal = $("pendingPaymentModal");
  if (modal) modal.classList.remove("hidden");
}

function setMode(mode) {
  if (state.isCompanionApp && mode === "signup") {
    state.mode = "signin";
    setStatus(authT("mobile_billing_on_website"));
  } else 
  if (mode === "signup" && !state.signupPlan) {
    state.mode = "signin";
    setStatus(authT("choose_plan_first"));
  } else if (mode === "signup" || mode === "recover") {
    state.mode = mode;
  } else {
    state.mode = "signin";
  }
  const isSignin = state.mode === "signin";
  const isSignup = state.mode === "signup";
  const isRecover = state.mode === "recover";
  $("tabSignin").classList.toggle("active", isSignin);
  $("tabSignup").classList.toggle("active", isSignup);
  $("tabRecover").classList.toggle("active", isRecover);
  $("tabSignup").classList.toggle("hidden", state.isCompanionApp);
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
  renderSignupPlanBanner();
  if (mode !== "signup" || state.signupPlan) setStatus("");
}

function errMessage(error) {
  if (!error) return "Unknown error";
  const raw = String(error.message || error.detail || error || "").trim();
  if (!raw) return "Unknown error";
  if (/at least 10 characters/i.test(raw)) return "Password must be at least 10 characters.";
  return raw;
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
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    let detail = "";
    if (typeof payload?.detail === "string") detail = payload.detail;
    else if (Array.isArray(payload?.detail)) {
      detail = payload.detail
        .map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
        .join("; ");
    }
    throw new ApiError(detail || `HTTP ${res.status}`, res.status, payload);
  }
  return payload;
}

window.addEventListener("load", async () => {
  const q = new URLSearchParams(window.location.search);
  const explicitMode = String(q.get("mode") || "").trim().toLowerCase();
  const billingState = String(q.get("billing") || "").trim().toLowerCase();
  const queryPlan = normalizeSignupPlan(q.get("plan"));
  const rawQueryCycle = String(q.get("cycle") || "").trim().toLowerCase();
  const queryCycle = rawQueryCycle ? normalizeBillingCycle(rawQueryCycle) : "";
  const queryWebsiteRaw = String(q.get("website") || "").trim();
  const queryWebsiteProvided = queryWebsiteRaw !== "";
  const queryWebsite = parseBoolFlag(queryWebsiteRaw);
  const queryCoupon = String(q.get("coupon") || "").trim();
  const paymentState = String(q.get("payment") || "").trim().toLowerCase();
  const mobilePlatform = String(q.get("mobile") || "").trim().toLowerCase();

  if (queryPlan) localStorage.setItem(SIGNUP_PLAN_KEY, queryPlan);
  if (queryCycle) localStorage.setItem(BILLING_CYCLE_KEY, queryCycle);
  if (queryWebsiteProvided) localStorage.setItem(SIGNUP_WITH_WEBSITE_KEY, queryWebsite ? "1" : "0");
  if (queryCoupon) localStorage.setItem(SIGNUP_COUPON_KEY, queryCoupon);

  state.signupPlan = queryPlan || normalizeSignupPlan(localStorage.getItem(SIGNUP_PLAN_KEY));
  state.signupBillingCycle = queryCycle || normalizeBillingCycle(localStorage.getItem(BILLING_CYCLE_KEY));
  state.signupWithWebsite = queryWebsiteProvided
    ? queryWebsite
    : parseBoolFlag(localStorage.getItem(SIGNUP_WITH_WEBSITE_KEY));
  state.mobilePlatform = isMobileCompanionPlatform(mobilePlatform) ? mobilePlatform : "";
  state.isCompanionApp = Boolean(state.mobilePlatform);
  if (state.signupPlan !== "premium_plus") state.signupWithWebsite = false;

  const savedLang = String(localStorage.getItem("keeperbma_lang") || "en");
  state.lang = AUTH_I18N[savedLang] ? savedLang : "en";
  state.theme = String(localStorage.getItem("keeperbma_theme") || "light").trim().toLowerCase() === "dark" ? "dark" : "light";

  const initialMode = state.isCompanionApp
    ? (explicitMode === "recover" ? "recover" : "signin")
    : (explicitMode || "signin");
  setMode(initialMode);
  applyAuthLanguage(state.lang);
  applyTheme(state.theme);

  if ($("authLangSelect")) {
    $("authLangSelect").value = state.lang;
    $("authLangSelect").onchange = (e) => applyAuthLanguage(String(e.target.value || "en"));
  }
  if ($("authThemeToggle")) {
    $("authThemeToggle").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
  }

  $("tabSignin").onclick = () => setMode("signin");
  $("tabSignup").onclick = () => {
    if (state.isCompanionApp) {
      setStatus(authT("mobile_billing_on_website"));
      openWebsite(websiteUrl("/plans"));
      return;
    }
    if (!state.signupPlan) {
      setStatus(authT("choose_plan_first"));
      return;
    }
    setMode("signup");
  };
  $("tabRecover").onclick = () => setMode("recover");
  $("btnForgot").onclick = () => setMode("recover");
  $("pendingPaymentClose").onclick = hidePendingPaymentModal;
  $("pendingPaymentBackdrop").onclick = hidePendingPaymentModal;
  $("pendingPaymentAction").onclick = () => {
    if (state.pendingPaymentUrl) {
      if (state.isCompanionApp) {
        openWebsite(state.pendingPaymentUrl);
      } else {
        window.location.href = state.pendingPaymentUrl;
      }
    }
  };
  if ($("mobileWebsiteBtn")) {
    $("mobileWebsiteBtn").onclick = () => openWebsite(websiteUrl("/plans"));
  }

  if (paymentState === "success") {
    setStatus(authT("payment_saved"));
    setMode("signin");
  } else if (paymentState === "cancel") {
    setStatus(authT("payment_canceled"));
    setMode("signin");
  }

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
      disableSubmit(true);
      const name = $("authName").value.trim();
      const password = $("authPass").value;
      const password2 = $("authPassConfirm").value;

      if (state.mode === "signup") {
        if (!state.signupPlan) {
          setStatus(authT("choose_plan_first"));
          return;
        }
        const email = $("authEmail").value.trim().toLowerCase();
        const countryCode = $("authCountryCode").value.trim();
        const localPhone = $("authPhoneLocal").value.trim().replace(/[^\d]/g, "");
        const couponCode = String(localStorage.getItem(SIGNUP_COUPON_KEY) || "").trim().slice(0, 64);
        if (!name || !email || !countryCode || !localPhone || !password) {
          setStatus("Username, email, phone, and password are required.");
          return;
        }
        if (!isValidEmail(email)) {
          setStatus("Email is invalid.");
          return;
        }
        if (localPhone.length < 6) {
          setStatus("Phone number is too short.");
          return;
        }
        if (password !== password2) {
          setStatus("Confirm password does not match.");
          return;
        }
        const out = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            phone: `${countryCode} ${localPhone}`.trim(),
            password,
            coupon_code: couponCode,
            plan_code: state.signupPlan,
            billing_cycle: state.signupBillingCycle,
            with_website: Boolean(state.signupWithWebsite),
          }),
        });

        if (out.payment_required && out.payment_url) {
          setStatus(authT("signup_pending"));
          window.setTimeout(() => {
            window.location.href = out.payment_url;
          }, 500);
          return;
        }

        setMode("signin");
        $("authName").value = name;
        $("authPass").value = "";
        $("authPassConfirm").value = "";
        setStatus(authT("signup_lifetime_ok"));
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

      if (!name || !password) {
        setStatus("Username and password are required.");
        return;
      }

      const out = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ name, password }),
      });
      const token = String(out.token || "");
      if (token) localStorage.setItem("keeperbma_token", token);
      window.location.href = "./index.html?app=1";
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.payload?.payment_required && e.payload?.payment_url) {
        showPendingPaymentModal(
          String(e.payload.detail || authT("payment_required")),
          String(e.payload.payment_url || "")
        );
      } else {
        setStatus(errMessage(e));
      }
    } finally {
      disableSubmit(false);
    }
  };

  if (!explicitMode && paymentState !== "success" && paymentState !== "cancel") {
    try {
      await api("/auth/session");
      window.location.href = "./index.html?app=1";
    } catch (_) {}
  }
});
