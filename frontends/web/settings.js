const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "https://api.keeperbma.com",
  authToken: "",
  userId: 0,
  userName: "",
  currentLang: "en",
  profile: {},
  subscription: {},
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
    plan_lifetime: "Lifetime",
    plan_updated: "Plan updated successfully.",
  },
};

function t(key) {
  const pack = I18N[state.currentLang] || I18N.en;
  return pack[key] || I18N.en[key] || key;
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
  setText("changePlanLabel", "change_plan");
  setText("planBtnBasic", "plan_basic");
  setText("planBtnRegular", "plan_regular");
  setText("planBtnBusiness", "plan_business");
  setText("planBtnPremium", "plan_premium_plus");

  if ($("profileUsername")) $("profileUsername").placeholder = t("profile_username");
  if ($("profileEmail")) $("profileEmail").placeholder = "name@example.com";
  if ($("profilePhone")) $("profilePhone").placeholder = "+1 5551234567";
  if ($("currentPassword")) $("currentPassword").placeholder = t("current_password");
  if ($("newPassword")) $("newPassword").placeholder = `${t("new_password")} (10+ letters+numbers)`;
  if ($("confirmNewPassword")) $("confirmNewPassword").placeholder = t("confirm_new_password");

  renderSubscription();
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

function planLabel(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  const labels = {
    basic: t("plan_basic"),
    regular: t("plan_regular"),
    business: t("plan_business"),
    premium_plus: t("plan_premium_plus"),
    lifetime: t("plan_lifetime"),
  };
  return labels[key] || key || t("plan_basic");
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

  if ($("planCodeValue")) $("planCodeValue").textContent = planLabel(planCode);
  if ($("planStatusValue")) $("planStatusValue").textContent = status;
  if ($("trialEndsValue")) $("trialEndsValue").textContent = trialEnds ? trialEnds.slice(0, 10) : "-";
  if ($("trialDaysValue")) $("trialDaysValue").textContent = String(Math.max(0, trialDays));

  document.querySelectorAll(".plan-btn").forEach((btn) => {
    const btnPlan = String(btn.getAttribute("data-plan") || "").toLowerCase();
    btn.classList.toggle("active", btnPlan === planCode);
    btn.disabled = isLifetime;
  });
}

async function loadPageData() {
  const results = await Promise.allSettled([
    api(`/profile?user_id=${state.userId}`),
    api(`/billing/subscription?user_id=${state.userId}`),
  ]);
  const [profileRes, subscriptionRes] = results;
  state.profile = profileRes.status === "fulfilled" ? (profileRes.value || {}) : (state.profile || {});
  state.subscription = subscriptionRes.status === "fulfilled" ? (subscriptionRes.value || {}) : (state.subscription || {});
  if (state.profile && state.profile.name) state.userName = String(state.profile.name || state.userName || "");
  renderProfile();
  renderSubscription();
}

window.addEventListener("load", async () => {
  state.authToken = String(localStorage.getItem("keeperbma_token") || "");
  const savedLang = String(localStorage.getItem("keeperbma_lang") || "en");
  if ($("appLangSelect")) $("appLangSelect").onchange = (e) => applyLanguage(String(e.target.value || "en"));
  applyLanguage(savedLang);

  if ($("btnBackDashboard")) $("btnBackDashboard").onclick = () => { window.location.href = "./index.html"; };
  if ($("btnLogout")) {
    $("btnLogout").onclick = async () => {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch (_) {}
      localStorage.removeItem("keeperbma_token");
      window.location.href = "./auth.html?mode=signin";
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
    renderProfile();
    renderSubscription();
    await loadPageData();
  } catch (_) {
    window.location.href = "./auth.html?mode=signin";
  }
});

