const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "https://api.keeperbma.com",
  mode: "signin",
  lang: "en",
  signupPlan: "",
};

const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const SIGNUP_COUPON_KEY = "keeperbma_signup_coupon";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus"]);
const DEFAULT_BILLING_CYCLE = "monthly";

const AUTH_I18N = {
  en: { signin: "Sign In", signup: "Sign Up", recover: "Recover", username: "Username", password: "Password", new_password: "New Password", confirm_password: "Confirm Password", forgot: "Forgot Password?", send_code: "Send Recovery Code", reset_password: "Reset Password", recovery_sent: "Recovery code sent. Check your email.", signup_ok: "Sign up successful. Redirecting...", signup_plan_selected: "Selected Plan", choose_plan_first: "Please choose a plan first from Home > Pricing.", plan_basic: "Basic", plan_regular: "Regular", plan_business: "Business", plan_premium_plus: "Premium Plus" },
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

function planLabel(planCode) {
  const key = normalizeSignupPlan(planCode);
  const labels = {
    basic: authT("plan_basic"),
    regular: authT("plan_regular"),
    business: authT("plan_business"),
    premium_plus: authT("plan_premium_plus"),
  };
  return labels[key] || key;
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
  if ($("authLangSelect")) $("authLangSelect").value = state.lang;
  if ($("tabSignin")) $("tabSignin").textContent = authT("signin");
  if ($("tabSignup")) $("tabSignup").textContent = authT("signup");
  if ($("tabRecover")) $("tabRecover").textContent = authT("recover");
  if ($("labelName")) $("labelName").textContent = authT("username");
  if ($("labelPassword")) $("labelPassword").textContent = state.mode === "recover" ? authT("new_password") : authT("password");
  if ($("labelConfirmPassword")) $("labelConfirmPassword").textContent = authT("confirm_password");
  if ($("btnForgot")) $("btnForgot").textContent = authT("forgot");
  if ($("btnSendCode")) $("btnSendCode").textContent = authT("send_code");
  renderSignupPlanBanner();
}

function setStatus(msg) {
  $("authStatus").textContent = msg || "";
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
  if (!(mode === "signup" && !state.signupPlan)) setStatus("");
  renderSignupPlanBanner();
}

function errMessage(e) {
  const normalize = (msg) => {
    const text = String(msg || "").trim();
    if (!text) return "Unknown error";
    if (/at least 10 characters/i.test(text)) return "Password must be at least 10 characters.";
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

async function startPostSignupBilling(userId, planCode) {
  const uid = Number(userId || 0);
  const plan = normalizeSignupPlan(planCode);
  if (!uid || !plan) return false;

  const out = await api("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({
      user_id: uid,
      plan_code: plan,
      billing_cycle: DEFAULT_BILLING_CYCLE,
      success_url: buildAppUrl("./settings.html?billing=success"),
      cancel_url: buildAppUrl("./settings.html?billing=cancel"),
    }),
  });

  const checkoutUrl = String(out?.url || "").trim();
  if (!checkoutUrl) {
    throw new Error("Billing checkout URL was not returned.");
  }
  window.location.href = checkoutUrl;
  return true;
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
  const queryCoupon = String(q.get("coupon") || "").trim();
  if (queryPlan) localStorage.setItem(SIGNUP_PLAN_KEY, queryPlan);
  if (queryCoupon) localStorage.setItem(SIGNUP_COUPON_KEY, queryCoupon);
  state.signupPlan = queryPlan || normalizeSignupPlan(localStorage.getItem(SIGNUP_PLAN_KEY));
  const savedCoupon = String(localStorage.getItem(SIGNUP_COUPON_KEY) || "");
  const savedLang = String(localStorage.getItem("keeperbma_lang") || "en");
  state.lang = AUTH_I18N[savedLang] ? savedLang : "en";
  setMode(q.get("mode") || "signin");
  if ($("authLangSelect")) {
    $("authLangSelect").value = state.lang;
    $("authLangSelect").onchange = (e) => applyAuthLanguage(String(e.target.value || "en"));
  }
  applyAuthLanguage(state.lang);
  if ($("authCoupon")) {
    $("authCoupon").value = queryCoupon || savedCoupon;
  }

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
        const countryCode = $("authCountryCode").value.trim();
        const localPhone = $("authPhoneLocal").value.trim();
        const normalizedLocalPhone = localPhone.replace(/[^\d]/g, "");
        const couponRaw = String($("authCoupon").value || "").trim();
        if (couponRaw.length > 64) {
          setStatus("Coupon code must be 64 characters or less.");
          return;
        }
        const payload = {
          name,
          email: $("authEmail").value.trim(),
          phone: `${countryCode} ${normalizedLocalPhone}`.trim(),
          coupon_code: couponRaw,
          plan_code: signupPlan,
          password,
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
        localStorage.removeItem(SIGNUP_PLAN_KEY);
        localStorage.removeItem(SIGNUP_COUPON_KEY);
        const isLifetime = Boolean(out.is_lifetime || out.lifetime_access);
        if (isLifetime) {
          setStatus(authT("signup_ok"));
          window.location.href = "./index.html?app=1";
          return;
        }

        setStatus("Account created. Redirecting to billing...");
        try {
          await startPostSignupBilling(out.user_id, signupPlan);
          return;
        } catch (billingErr) {
          console.error("Billing redirect failed:", billingErr);
          setStatus(
            "Account created. Could not open checkout automatically. Redirecting to billing settings..."
          );
        }
        window.location.href = "./settings.html?billing=required";
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
