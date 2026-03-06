const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "https://keeperbma-backend.onrender.com",
  mode: "signin",
};

function setStatus(msg) {
  $("authStatus").textContent = msg || "";
}

function setMode(mode) {
  state.mode = mode === "signup" ? "signup" : "signin";
  const isSignin = state.mode === "signin";
  $("tabSignin").classList.toggle("active", isSignin);
  $("tabSignup").classList.toggle("active", !isSignin);
  $("authSubmit").textContent = isSignin ? "Sign In" : "Sign Up";
  document.title = isSignin ? "KeeperBMA - Sign In" : "KeeperBMA - Sign Up";
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

  $("authSubmit").onclick = async () => {
    try {
      const payload = {
        name: $("authName").value.trim(),
        password: $("authPass").value,
      };
      if (!payload.name || !payload.password) {
        setStatus("Name and password are required.");
        return;
      }

      if (state.mode === "signup") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStatus("Sign up successful. Please sign in.");
        setMode("signin");
        return;
      }

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
