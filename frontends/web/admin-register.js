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
  const el = $("adminRegisterStatus");
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

  $("adminRegisterSubmit").onclick = async () => {
    try {
      setStatus("");
      const name = $("adminName").value.trim();
      const email = $("adminEmail").value.trim().toLowerCase();
      const phone = $("adminPhone").value.trim();
      const position = $("adminPosition").value.trim();
      const password = $("adminPassword").value;
      if (!name || !email || !phone || !position || !password) {
        setStatus("All fields are required.", true);
        return;
      }
      await api("/admin1957/register", {
        method: "POST",
        body: JSON.stringify({ name, email, phone, position, password }),
      });
      setStatus("Admin created successfully. Redirecting to login...");
      window.setTimeout(() => {
        window.location.replace("/kmak/1957/1965/a/login?registered=1");
      }, 600);
    } catch (error) {
      setStatus(error.message || "Admin registration failed.", true);
    }
  };
});
