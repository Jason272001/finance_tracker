const $ = (id) => document.getElementById(id);
const state = {
  apiBase: "https://api.keeperbma.com",
  theme: "light",
};

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

window.addEventListener("load", async () => {
  applyTheme(localStorage.getItem("keeperbma_theme") || "light");
  $("adminThemeToggle").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");

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
      await api("/admin1957/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      setStatus("Sign in successful. Redirecting...");
      window.location.replace("/kmak/1957/1965/a/dashboard");
    } catch (error) {
      setStatus(error.message || "Admin sign in failed.", true);
    }
  };
});
