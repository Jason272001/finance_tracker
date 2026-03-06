const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "https://api.keeperbma.com",
  mode: "signin",
};

function setStatus(msg) {
  $("authStatus").textContent = msg || "";
}

function setMode(mode) {
  if (mode === "signup" || mode === "recover") state.mode = mode;
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
  $("labelPassword").textContent = isRecover ? "New Password" : "Password";
  $("authPass").placeholder = isRecover ? "New Password" : "Password";
  $("authSubmit").textContent = isSignin ? "Sign In" : (isSignup ? "Sign Up" : "Reset Password");
  document.title = isSignin ? "KeeperBMA - Sign In" : (isSignup ? "KeeperBMA - Sign Up" : "KeeperBMA - Recover Password");
  setStatus("");
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
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

window.addEventListener("load", async () => {
  const q = new URLSearchParams(window.location.search);
  setMode(q.get("mode") || "signin");

  $("tabSignin").onclick = () => setMode("signin");
  $("tabSignup").onclick = () => setMode("signup");
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
      setStatus("Recovery code sent. Check your email.");
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
        const countryCode = $("authCountryCode").value.trim();
        const localPhone = $("authPhoneLocal").value.trim();
        const normalizedLocalPhone = localPhone.replace(/[^\d]/g, "");
        const payload = {
          name,
          email: $("authEmail").value.trim(),
          phone: `${countryCode} ${normalizedLocalPhone}`.trim(),
          coupon_code: $("authCoupon").value.trim(),
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
        setStatus("Sign up successful. Please sign in.");
        setMode("signin");
        $("authName").value = payload.name;
        $("authPass").value = "";
        $("authPassConfirm").value = "";
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

  // If already signed in, skip this page.
  try {
    await api("/auth/session");
    window.location.href = "./index.html?app=1";
  } catch (_) {}
});
