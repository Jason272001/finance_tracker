const $ = (id) => document.getElementById(id);
const state = {
  apiBase: resolveAdminApiBase(),
  theme: "light",
};
const ADMIN_TOKEN_KEY = "keeperbma_admin_token";

function resolveAdminApiBase() {
  const { protocol, origin, hostname } = window.location;
  const host = String(hostname || "").toLowerCase();
  if (host === "keeperbma.com" || host === "www.keeperbma.com") {
    localStorage.removeItem("keeperbma_api_base");
    return origin;
  }
  if (host === "api.keeperbma.com") {
    return origin;
  }
  const override = String(window.__KEEPERBMA_API_BASE__ || localStorage.getItem("keeperbma_api_base") || "").trim();
  if (override) return override.replace(/\/+$/, "");
  if (protocol === "http:" || protocol === "https:") {
    return origin;
  }
  return "https://api.keeperbma.com";
}

class ApiError extends Error {
  constructor(message, status = 500, payload = {}) {
    super(message || `HTTP ${status}`);
    this.status = Number(status || 500);
    this.payload = payload || {};
  }
}

function applyTheme(theme) {
  state.theme = String(theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
  localStorage.setItem("keeperbma_theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  const toggle = $("adminThemeToggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(state.theme === "dark"));
    toggle.setAttribute("data-theme", state.theme);
  }
  const label = $("adminThemeLabel");
  if (label) label.textContent = `Theme: ${state.theme === "dark" ? "Dark" : "Light"}`;
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function setAdminToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    return;
  }
  localStorage.setItem(ADMIN_TOKEN_KEY, normalized);
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !Object.keys(headers).some((k) => String(k).toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const adminToken = getAdminToken();
  if (adminToken && !Object.keys(headers).some((k) => String(k).toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  const res = await fetch(`${state.apiBase}${path}`, {
    credentials: "include",
    headers,
    ...opts,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(payload?.detail || `HTTP ${res.status}`, res.status, payload);
  return payload;
}

function setStatus(message, isError = false) {
  const el = $("adminLoginStatus");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error-text", Boolean(isError));
  el.classList.toggle("success-text", !isError && Boolean(message));
}

function bindPasswordToggle(inputId, buttonId) {
  const input = $(inputId);
  const button = $(buttonId);
  if (!input || !button) return;
  button.onclick = () => {
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(reveal));
  };
}

window.addEventListener("load", async () => {
  applyTheme(localStorage.getItem("keeperbma_theme") || "light");
  $("adminThemeToggle").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
  bindPasswordToggle("adminPassword", "adminPasswordToggle");

  const q = new URLSearchParams(window.location.search);
  if (q.get("registered") === "1") {
    setStatus("Admin created successfully. Sign in to continue.");
  }

  try {
    const out = await api("/admin1957/session");
    if (out?.ok) {
      window.location.replace("/kmak/1957/1965/a/dashboard");
      return;
    }
  } catch (_) {}

  $("adminLoginSubmit").onclick = async () => {
    try {
      setStatus("");
      const identifier = $("adminIdentifier").value.trim();
      const password = $("adminPassword").value;
      if (!identifier || !password) {
        setStatus("Identifier and password are required.", true);
        return;
      }
      const out = await api("/admin1957/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      setAdminToken(out?.token || "");
      setStatus("Sign in successful. Redirecting...");
      window.location.replace("/kmak/1957/1965/a/dashboard");
    } catch (error) {
      setStatus(error.message || "Admin sign in failed.", true);
    }
  };
});
