const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "https://api.keeperbma.com",
  authToken: "",
  userId: 0,
  userName: "",
  currentLang: "en",
  theme: "light",
  profile: {},
  subscription: {},
  billingConfig: {},
  billingCycle: "monthly",
  billingPlans: [],
  stripe: null,
  embeddedCheckout: null,
  pendingProfileImage: null,
};

const I18N = {
  en: {
    language: "Language",
    signed_in: "Signed in",
    logout: "Logout",
    dashboard: "Dashboard",
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
    manage_billing: "Manage Billing",
    cancel_subscription: "Cancel Subscription",
    redirect_checkout: "Redirecting to Stripe checkout...",
    redirect_portal: "Opening Stripe billing portal...",
    stripe_not_configured: "Stripe billing is not configured yet.",
    stripe_plan_not_configured: "Stripe price is not configured for this plan yet.",
    billing_no_customer: "No Stripe customer found yet. Complete checkout first.",
    billing_success: "Payment completed. Subscription will sync shortly.",
    billing_cancel: "Checkout canceled.",
    embedded_payment_title: "Secure Payment",
    close_payment: "Close Payment",
    embedded_loading: "Loading secure payment...",
    embedded_unavailable: "Embedded checkout is unavailable. Falling back to hosted checkout.",
    billing_cycle: "Billing Cycle",
    cycle_monthly: "Monthly",
    cycle_annual: "Annual",
    premium_plus_choice_monthly: "Include website package ($70/month)? Click Cancel for $50/month.",
    premium_plus_choice_annual: "Include website package ($700/year)? Click Cancel for $500/year.",
    cancel_confirm: "Cancel now? Refund policy: full refund within 7 days; annual plans after 7 days get prorated refund for remaining time.",
    cancel_no_stripe: "Stripe subscription not found for this user.",
    annual_savings_prefix: "Annual savings vs monthly: ",
    annual_savings_empty: "No annual savings configured yet.",
    annual_switch_hint: "Choose Annual to save more each year.",
    next_charge: "Next Charge",
    access_state: "Access",
    access_reason: "Access Reason",
    website_bundle: "Website Bundle",
    yes: "Yes",
    no: "No",
    access_active: "Active",
    access_locked: "Locked",
  },
};

const DEFAULT_BILLING_PLANS = [
  { plan_code: "basic", price_monthly: 2, price_annual: 20 },
  { plan_code: "regular", price_monthly: 5, price_annual: 50 },
  { plan_code: "business", price_monthly: 25, price_annual: 250 },
  { plan_code: "premium_plus", price_monthly: 50, price_annual: 500, price_with_website_monthly: 70, price_with_website_annual: 700 },
];

function t(key) {
  const pack = I18N[state.currentLang] || I18N.en;
  return pack[key] || I18N.en[key] || key;
}

function applyTheme(theme) {
  state.theme = String(theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
  localStorage.setItem("keeperbma_theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  const btn = $("settingsThemeToggle");
  if (btn) {
    btn.setAttribute("aria-pressed", String(state.theme === "dark"));
    btn.setAttribute("data-theme", state.theme);
  }
  const label = $("settingsThemeLabel");
  if (label) label.textContent = `Theme: ${state.theme === "dark" ? "Dark" : "Light"}`;
}

function setText(id, key) {
  const el = $(id);
  if (el) el.textContent = t(key);
}

function setStatus(id, msg) {
  const el = $(id);
  if (el) el.textContent = msg || "";
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

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatUSD(v) {
  return `$${numberOrZero(v).toFixed(0)}`;
}

function getBillingPlans() {
  return Array.isArray(state.billingPlans) && state.billingPlans.length > 0
    ? state.billingPlans
    : DEFAULT_BILLING_PLANS;
}

function getPlanMeta(planCode) {
  const key = String(planCode || "").toLowerCase();
  return getBillingPlans().find((p) => String(p?.plan_code || "").toLowerCase() === key) || null;
}

function getAnnualSavings(planCode, withWebsite = false) {
  const plan = getPlanMeta(planCode);
  if (!plan) return 0;
  const monthly = withWebsite
    ? numberOrZero(plan.price_with_website_monthly)
    : numberOrZero(plan.price_monthly);
  const annual = withWebsite
    ? numberOrZero(plan.price_with_website_annual)
    : numberOrZero(plan.price_annual);
  return Math.max(0, (monthly * 12) - annual);
}

function planButtonText(planCode) {
  const label = planLabel(planCode);
  const cycle = state.billingCycle === "annual" ? "annual" : "monthly";
  const plan = getPlanMeta(planCode);
  if (!plan) return label;
  const monthly = numberOrZero(plan.price_monthly);
  const annual = numberOrZero(plan.price_annual);
  if (cycle === "annual") {
    const save = Math.max(0, (monthly * 12) - annual);
    if (save > 0) return `${label} - ${formatUSD(annual)} / year (Save ${formatUSD(save)})`;
    return `${label} - ${formatUSD(annual)} / year`;
  }
  return `${label} - ${formatUSD(monthly)} / month`;
}

function renderBillingPresentation() {
  const buttonMap = [
    ["planBtnBasic", "basic"],
    ["planBtnRegular", "regular"],
    ["planBtnBusiness", "business"],
    ["planBtnPremium", "premium_plus"],
  ];
  buttonMap.forEach(([id, planCode]) => {
    const el = $(id);
    if (el) el.textContent = planButtonText(planCode);
  });

  const hintEl = $("billingSavingsHint");
  if (!hintEl) return;
  if (state.billingCycle !== "annual") {
    hintEl.textContent = t("annual_switch_hint");
    return;
  }
  const items = [
    ["Basic", getAnnualSavings("basic")],
    ["Regular", getAnnualSavings("regular")],
    ["Business", getAnnualSavings("business")],
    ["Premium Plus", getAnnualSavings("premium_plus")],
    ["Premium Plus + Website", getAnnualSavings("premium_plus", true)],
  ].filter((x) => numberOrZero(x[1]) > 0);

  if (!items.length) {
    hintEl.textContent = t("annual_savings_empty");
    return;
  }
  hintEl.textContent = `${t("annual_savings_prefix")}${items
    .map(([name, save]) => `${name} ${formatUSD(save)}`)
    .join(", ")}`;
}

function applyLanguage(lang) {
  state.currentLang = I18N[lang] ? lang : "en";
  localStorage.setItem("keeperbma_lang", state.currentLang);
  if ($("appLangSelect")) $("appLangSelect").value = state.currentLang;
  document.documentElement.lang = state.currentLang;

  setText("langLabelApp", "language");
  setText("btnLogout", "logout");
  setText("btnBackDashboard", "dashboard");
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
  setText("billingCycleMetaLabel", "billing_cycle");
  setText("nextChargeLabel", "next_charge");
  setText("accessStateLabel", "access_state");
  setText("websiteBundleLabel", "website_bundle");
  setText("accessReasonLabel", "access_reason");
  setText("changePlanLabel", "change_plan");
  setText("planBtnBasic", "plan_basic");
  setText("planBtnRegular", "plan_regular");
  setText("planBtnBusiness", "plan_business");
  setText("planBtnPremium", "plan_premium_plus");
  setText("btnOpenBillingPortal", "manage_billing");
  setText("btnCancelSubscription", "cancel_subscription");
  setText("embeddedCheckoutTitle", "embedded_payment_title");
  setText("btnCloseEmbeddedCheckout", "close_payment");
  setText("billingCycleLabel", "billing_cycle");
  setText("billingCycleMonthlyOption", "cycle_monthly");
  setText("billingCycleAnnualOption", "cycle_annual");

  if ($("profileUsername")) $("profileUsername").placeholder = t("profile_username");
  if ($("profileEmail")) $("profileEmail").placeholder = "name@example.com";
  if ($("profilePhone")) $("profilePhone").placeholder = "+1 5551234567";
  if ($("currentPassword")) $("currentPassword").placeholder = t("current_password");
  if ($("newPassword")) $("newPassword").placeholder = `${t("new_password")} (10+ letters+numbers)`;
  if ($("confirmNewPassword")) $("confirmNewPassword").placeholder = t("confirm_new_password");

  renderSubscription();
  renderBillingPresentation();
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const hasBody = opts.body !== undefined && opts.body !== null;
  if (hasBody && !Object.keys(headers).some((k) => String(k).toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  if (state.authToken && !Object.keys(headers).some((k) => String(k).toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${state.authToken}`;
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

function planLabel(planCode, withWebsite = false) {
  const key = String(planCode || "").trim().toLowerCase();
  if (key === "premium_plus" && withWebsite) {
    return t("plan_diamond");
  }
  const labels = {
    basic: t("plan_basic"),
    regular: t("plan_regular"),
    business: t("plan_business"),
    premium_plus: t("plan_premium_plus"),
    lifetime: t("plan_lifetime"),
  };
  return labels[key] || key || t("plan_basic");
}

function formatShortDate(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 10) : "-";
}

function billingCycleLabel(cycle) {
  const key = String(cycle || "").trim().toLowerCase();
  if (key === "annual") return t("cycle_annual");
  if (key === "monthly") return t("cycle_monthly");
  return "-";
}

function getProfileImageUrl() {
  const raw = String((state.profile || {}).profile_image_url || "").trim();
  if (raw) return raw;
  return "../../assets/keeperbma-icon.png";
}

function renderTopBar() {
  if ($("userBadge")) $("userBadge").textContent = `${t("signed_in")}: ${state.userName}`;
  if ($("topLogo")) $("topLogo").src = getProfileImageUrl();
}

function renderProfile() {
  const p = state.profile || {};
  if ($("profileUsername")) $("profileUsername").value = String(p.name || state.userName || "");
  if ($("profileEmail")) $("profileEmail").value = String(p.email || "");
  if ($("profilePhone")) $("profilePhone").value = String(p.phone || "");
  if ($("profileEmailNotifications")) $("profileEmailNotifications").checked = Boolean(p.email_notifications_enabled ?? true);
  if ($("profileAvatarPreview")) $("profileAvatarPreview").src = getProfileImageUrl();
  renderTopBar();
}

function renderSubscription() {
  const sub = state.subscription || {};
  const planCode = String(sub.plan_code || "basic").toLowerCase();
  const status = String(sub.subscription_status || "active");
  const trialEnds = String(sub.trial_ends_at || "");
  const trialDays = Number(sub.trial_days_remaining || 0);
  const isLifetime = Boolean(sub.is_lifetime);
  const withWebsite = Boolean(sub.plan_with_website);
  const billingCycle = String(sub.billing_cycle || "").toLowerCase();
  const nextCharge = String(sub.next_charge_at || "");
  const accessActive = sub.access_active !== false;
  const accessReason = String(sub.access_reason || "").trim();
  const hasStripeSub = String(sub.billing_subscription_id || "").trim().length > 0;

  if ($("planCodeValue")) $("planCodeValue").textContent = planLabel(planCode, withWebsite);
  if ($("planStatusValue")) $("planStatusValue").textContent = status;
  if ($("trialEndsValue")) $("trialEndsValue").textContent = formatShortDate(trialEnds);
  if ($("trialDaysValue")) $("trialDaysValue").textContent = String(Math.max(0, trialDays));
  if ($("billingCycleValue")) $("billingCycleValue").textContent = billingCycleLabel(billingCycle);
  if ($("nextChargeValue")) $("nextChargeValue").textContent = formatShortDate(nextCharge);
  if ($("accessStateValue")) $("accessStateValue").textContent = accessActive ? t("access_active") : t("access_locked");
  if ($("websiteBundleValue")) $("websiteBundleValue").textContent = withWebsite ? t("yes") : t("no");
  if ($("accessReasonValue")) $("accessReasonValue").textContent = accessReason || "-";

  document.querySelectorAll(".plan-btn").forEach((btn) => {
    const btnPlan = String(btn.getAttribute("data-plan") || "").toLowerCase();
    btn.classList.toggle("active", btnPlan === planCode);
    btn.disabled = isLifetime;
  });
  if ($("btnCancelSubscription")) {
    $("btnCancelSubscription").disabled = isLifetime || !hasStripeSub;
  }
  renderBillingPresentation();
}

async function closeEmbeddedCheckout() {
  if (state.embeddedCheckout && typeof state.embeddedCheckout.destroy === "function") {
    try {
      state.embeddedCheckout.destroy();
    } catch (_) {}
  }
  state.embeddedCheckout = null;
  if ($("embeddedCheckoutContainer")) $("embeddedCheckoutContainer").innerHTML = "";
  if ($("embeddedCheckoutCard")) $("embeddedCheckoutCard").classList.add("hidden");
}

async function startEmbeddedCheckout(planCode, withWebsite = false, billingCycle = "monthly") {
  if (!Boolean(state.billingConfig?.embedded_checkout_enabled)) {
    throw new Error(t("embedded_unavailable"));
  }
  const publishableKey = String(state.billingConfig?.publishable_key || "").trim();
  if (!publishableKey || !window.Stripe) {
    throw new Error(t("embedded_unavailable"));
  }
  setStatus("planStatusMsg", t("embedded_loading"));
  await closeEmbeddedCheckout();
  if ($("embeddedCheckoutCard")) $("embeddedCheckoutCard").classList.remove("hidden");
  if ($("embeddedCheckoutContainer")) $("embeddedCheckoutContainer").innerHTML = "";
  state.stripe = state.stripe || window.Stripe(publishableKey);
  const stripe = state.stripe;
  const checkout = await stripe.initEmbeddedCheckout({
    fetchClientSecret: async () => {
      const out = await api("/billing/checkout/embedded", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.userId,
          plan_code: String(planCode || "").toLowerCase(),
          billing_cycle: String(billingCycle || "monthly").toLowerCase(),
          with_website: Boolean(withWebsite),
          return_url: `${window.location.origin}${window.location.pathname}?billing=success`,
        }),
      });
      return String(out?.client_secret || "");
    },
    onComplete: async () => {
      setStatus("planStatusMsg", t("billing_success"));
      await loadPageData();
      await closeEmbeddedCheckout();
    },
  });
  state.embeddedCheckout = checkout;
  checkout.mount("#embeddedCheckoutContainer");
  setStatus("planStatusMsg", "");
}

async function startHostedCheckout(planCode, withWebsite = false, billingCycle = "monthly") {
  setStatus("planStatusMsg", t("redirect_checkout"));
  const out = await api("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({
      user_id: state.userId,
      plan_code: String(planCode || "").toLowerCase(),
      billing_cycle: String(billingCycle || "monthly").toLowerCase(),
      with_website: Boolean(withWebsite),
      success_url: `${window.location.origin}${window.location.pathname}?billing=success`,
      cancel_url: `${window.location.origin}${window.location.pathname}?billing=cancel`,
    }),
  });
  const checkoutUrl = String(out?.url || "").trim();
  if (!checkoutUrl) {
    throw new Error(t("stripe_plan_not_configured"));
  }
  window.location.href = checkoutUrl;
}

async function loadPageData() {
  const results = await Promise.allSettled([
    api(`/profile?user_id=${state.userId}`),
    api(`/billing/subscription?user_id=${state.userId}`),
    api(`/billing/config?user_id=${state.userId}`),
    api("/billing/plans"),
  ]);
  const [profileRes, subscriptionRes, billingConfigRes, billingPlansRes] = results;
  state.profile = profileRes.status === "fulfilled" ? (profileRes.value || {}) : (state.profile || {});
  state.subscription = subscriptionRes.status === "fulfilled" ? (subscriptionRes.value || {}) : (state.subscription || {});
  state.billingConfig = billingConfigRes.status === "fulfilled" ? (billingConfigRes.value || {}) : (state.billingConfig || {});
  state.billingPlans = billingPlansRes.status === "fulfilled" && Array.isArray(billingPlansRes.value)
    ? billingPlansRes.value
    : state.billingPlans;
  if (state.profile && state.profile.name) state.userName = String(state.profile.name || state.userName || "");
  renderProfile();
  renderSubscription();
}

window.addEventListener("load", async () => {
  state.authToken = String(localStorage.getItem("keeperbma_token") || "");
  const savedLang = String(localStorage.getItem("keeperbma_lang") || "en");
  state.theme = String(localStorage.getItem("keeperbma_theme") || "light").trim().toLowerCase() === "dark" ? "dark" : "light";
  if ($("appLangSelect")) $("appLangSelect").onchange = (e) => applyLanguage(String(e.target.value || "en"));
  applyLanguage(savedLang);
  applyTheme(state.theme);
  if ($("settingsThemeToggle")) {
    $("settingsThemeToggle").onclick = () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    };
  }
  state.billingCycle = String(localStorage.getItem("keeperbma_billing_cycle") || "monthly").toLowerCase();
  if (!["monthly", "annual"].includes(state.billingCycle)) state.billingCycle = "monthly";
  if ($("billingCycleSelect")) {
    $("billingCycleSelect").value = state.billingCycle;
    $("billingCycleSelect").onchange = (e) => {
      const next = String(e.target.value || "monthly").toLowerCase();
      state.billingCycle = ["monthly", "annual"].includes(next) ? next : "monthly";
      localStorage.setItem("keeperbma_billing_cycle", state.billingCycle);
      setStatus("planStatusMsg", "");
      renderBillingPresentation();
    };
  }
  renderBillingPresentation();

  if ($("btnBackDashboard")) $("btnBackDashboard").onclick = async () => {
    await closeEmbeddedCheckout();
    window.location.href = "./index.html";
  };
  if ($("btnLogout")) {
    $("btnLogout").onclick = async () => {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch (_) {}
      await closeEmbeddedCheckout();
      localStorage.removeItem("keeperbma_token");
      window.location.href = "./auth.html?mode=signin";
    };
  }
  if ($("btnCloseEmbeddedCheckout")) {
    $("btnCloseEmbeddedCheckout").onclick = async () => {
      await closeEmbeddedCheckout();
      setStatus("planStatusMsg", "");
    };
  }

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

  if ($("btnOpenBillingPortal")) {
    $("btnOpenBillingPortal").onclick = async () => {
      try {
        if (!Boolean(state.billingConfig?.stripe_enabled)) {
          setStatus("planStatusMsg", t("stripe_not_configured"));
          return;
        }
        setStatus("planStatusMsg", t("redirect_portal"));
        const out = await api("/billing/portal", {
          method: "POST",
          body: JSON.stringify({
            user_id: state.userId,
            return_url: `${window.location.origin}${window.location.pathname}`,
          }),
        });
        const url = String(out?.url || "").trim();
        if (!url) {
          setStatus("planStatusMsg", t("billing_no_customer"));
          return;
        }
        window.location.href = url;
      } catch (e) {
        setStatus("planStatusMsg", errMessage(e));
      }
    };
  }
  if ($("btnCancelSubscription")) {
    $("btnCancelSubscription").onclick = async () => {
      try {
        const subId = String((state.subscription || {}).billing_subscription_id || "").trim();
        if (!subId) {
          setStatus("planStatusMsg", t("cancel_no_stripe"));
          return;
        }
        if (!window.confirm(t("cancel_confirm"))) return;
        setStatus("planStatusMsg", t("embedded_loading"));
        const out = await api("/billing/cancel", {
          method: "POST",
          body: JSON.stringify({ user_id: state.userId }),
        });
        await loadPageData();
        setStatus("planStatusMsg", String(out?.message || "Subscription canceled."));
      } catch (e) {
        setStatus("planStatusMsg", errMessage(e));
      }
    };
  }

  document.querySelectorAll(".plan-btn").forEach((btn) => {
    btn.onclick = async () => {
      const planCode = String(btn.getAttribute("data-plan") || "").toLowerCase();
      if (!state.userId || !planCode) return;
      try {
        const billingCycle = String(
          ($("billingCycleSelect") && $("billingCycleSelect").value) || state.billingCycle || "monthly"
        ).toLowerCase();
        state.billingCycle = ["monthly", "annual"].includes(billingCycle) ? billingCycle : "monthly";
        localStorage.setItem("keeperbma_billing_cycle", state.billingCycle);
        const useStripe = Boolean(state.billingConfig?.stripe_enabled);
        const useEmbedded = Boolean(state.billingConfig?.embedded_checkout_enabled);
        const configuredPriceKeys = new Set(
          (state.billingConfig?.configured_price_keys || []).map((x) => String(x).toLowerCase())
        );
        const standardKey = `${state.billingCycle}:${planCode}`;
        if (useStripe && configuredPriceKeys.has(standardKey)) {
          let withWebsite = false;
          const premiumWebsiteKey = `${state.billingCycle}:premium_plus_website`;
          if (planCode === "premium_plus" && configuredPriceKeys.has(premiumWebsiteKey)) {
            withWebsite = window.confirm(
              state.billingCycle === "annual" ? t("premium_plus_choice_annual") : t("premium_plus_choice_monthly")
            );
          }
          if (useEmbedded) {
            try {
              await startEmbeddedCheckout(planCode, withWebsite, state.billingCycle);
              return;
            } catch (e) {
              setStatus("planStatusMsg", t("embedded_unavailable"));
            }
          }
          await startHostedCheckout(planCode, withWebsite, state.billingCycle);
          return;
        }
        if (useStripe) {
          setStatus("planStatusMsg", t("stripe_plan_not_configured"));
          return;
        }
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
      billing_subscription_id: String(session.billing_subscription_id || ""),
      billing_cycle: String(session.billing_cycle || ""),
      plan_with_website: Boolean(session.plan_with_website || false),
      next_charge_at: String(session.next_charge_at || ""),
      access_active: session.access_active !== false,
      access_reason: String(session.access_reason || ""),
    };
    renderProfile();
    renderSubscription();
    await loadPageData();
    const qs = new URLSearchParams(window.location.search);
    const billingState = String(qs.get("billing") || "").toLowerCase();
    if (billingState === "success") setStatus("planStatusMsg", t("billing_success"));
    if (billingState === "cancel") setStatus("planStatusMsg", t("billing_cancel"));
    if (billingState && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch (_) {
    window.location.href = "./auth.html?mode=signin";
  }
});
