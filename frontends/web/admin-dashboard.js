const $ = (id) => document.getElementById(id);
const state = {
  apiBase: "https://api.keeperbma.com",
  theme: "light",
  admin: null,
  dashboard: null,
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
  const el = $("adminDashboardStatus");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error-text", Boolean(isError));
  el.classList.toggle("success-text", !isError && Boolean(message));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rowCell(label, value, extraClass = "") {
  return `<td data-label="${escapeHtml(label)}" class="${extraClass}">${value}</td>`;
}

function lookupUserName(userId) {
  const users = state.dashboard?.users || [];
  const hit = users.find((u) => Number(u.user_id) === Number(userId));
  return hit ? escapeHtml(hit.name || hit.email || `User ${userId}`) : escapeHtml(String(userId || ""));
}

function renderAdmins() {
  const tbody = $("adminAdminsTable")?.querySelector("tbody");
  if (!tbody) return;
  const rows = (state.dashboard?.admins || []).map((admin) => `
    <tr>
      ${rowCell("ID", escapeHtml(admin.id))}
      ${rowCell("Name", escapeHtml(admin.name))}
      ${rowCell("Email", escapeHtml(admin.email))}
      ${rowCell("Phone", escapeHtml(admin.phone))}
      ${rowCell("Position", escapeHtml(admin.position))}
      ${rowCell("Created", escapeHtml(admin.created_at))}
    </tr>
  `).join("");
  tbody.innerHTML = rows || `<tr><td colspan="6" data-label="Empty">No admins found.</td></tr>`;
}

function renderUsers() {
  const tbody = $("adminUsersTable")?.querySelector("tbody");
  if (!tbody) return;
  const rows = (state.dashboard?.users || []).map((user) => `
    <tr>
      ${rowCell("ID", escapeHtml(user.user_id))}
      ${rowCell("Name", escapeHtml(user.name))}
      ${rowCell("Email", escapeHtml(user.email))}
      ${rowCell("Phone", escapeHtml(user.phone))}
      ${rowCell("Plan", escapeHtml(user.plan_code))}
      ${rowCell("Subscription", escapeHtml(user.subscription_status))}
      ${rowCell("Payment", escapeHtml(user.payment_status))}
      ${rowCell("Trial", escapeHtml(user.trial_status))}
      ${rowCell("Action", `<button type="button" class="secondary admin-edit-user" data-user-id="${escapeHtml(user.user_id)}">Edit</button>`, "table-actions")}
    </tr>
  `).join("");
  tbody.innerHTML = rows || `<tr><td colspan="9" data-label="Empty">No users found.</td></tr>`;
  tbody.querySelectorAll(".admin-edit-user").forEach((btn) => {
    btn.onclick = () => loadUserIntoForm(Number(btn.dataset.userId || 0));
  });
}

function renderAccounts() {
  const tbody = $("adminAccountsTable")?.querySelector("tbody");
  if (!tbody) return;
  const rows = (state.dashboard?.accounts || []).map((account) => `
    <tr>
      ${rowCell("ID", escapeHtml(account.account_id))}
      ${rowCell("User", lookupUserName(account.user_id))}
      ${rowCell("Name", escapeHtml(account.account_name))}
      ${rowCell("Type", escapeHtml(account.account_type))}
      ${rowCell("Balance", escapeHtml(account.balance))}
    </tr>
  `).join("");
  tbody.innerHTML = rows || `<tr><td colspan="5" data-label="Empty">No accounts found.</td></tr>`;
}

function renderTransactions() {
  const tbody = $("adminTransactionsTable")?.querySelector("tbody");
  if (!tbody) return;
  const accounts = state.dashboard?.accounts || [];
  const rows = (state.dashboard?.transactions || []).map((tx) => {
    const account = accounts.find((a) => Number(a.account_id) === Number(tx.account_id));
    return `
      <tr>
        ${rowCell("ID", escapeHtml(tx.txn_id))}
        ${rowCell("User", lookupUserName(tx.user_id))}
        ${rowCell("Date", escapeHtml(tx.date))}
        ${rowCell("Type", escapeHtml(tx.type))}
        ${rowCell("Amount", escapeHtml(tx.amount))}
        ${rowCell("Account", escapeHtml(account?.account_name || tx.account_id))}
        ${rowCell("Category", escapeHtml(tx.category))}
        ${rowCell("Note", escapeHtml(tx.note))}
      </tr>
    `;
  }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="8" data-label="Empty">No transactions found.</td></tr>`;
}

function renderCategories() {
  const tbody = $("adminCategoriesTable")?.querySelector("tbody");
  if (!tbody) return;
  const rows = (state.dashboard?.categories || []).map((category) => `
    <tr>
      ${rowCell("ID", escapeHtml(category.category_id))}
      ${rowCell("User", lookupUserName(category.user_id))}
      ${rowCell("Name", escapeHtml(category.name))}
      ${rowCell("Type", escapeHtml(category.type))}
      ${rowCell("Auto", escapeHtml(category.is_auto || category.account_linked || ""))}
    </tr>
  `).join("");
  tbody.innerHTML = rows || `<tr><td colspan="5" data-label="Empty">No categories found.</td></tr>`;
}

function renderDailyBalances() {
  const tbody = $("adminDailyBalancesTable")?.querySelector("tbody");
  if (!tbody) return;
  const rows = (state.dashboard?.daily_balances || []).map((item) => `
    <tr>
      ${rowCell("ID", escapeHtml(item.dailyb_id))}
      ${rowCell("User", lookupUserName(item.user_id))}
      ${rowCell("Date", escapeHtml(item.date))}
      ${rowCell("Income", escapeHtml(item.income))}
      ${rowCell("Expense", escapeHtml(item.expense))}
      ${rowCell("Net", escapeHtml(item.net))}
      ${rowCell("Snapshot", escapeHtml(item.snapshot))}
    </tr>
  `).join("");
  tbody.innerHTML = rows || `<tr><td colspan="7" data-label="Empty">No daily balances found.</td></tr>`;
}

function loadUserIntoForm(userId) {
  const user = (state.dashboard?.users || []).find((item) => Number(item.user_id) === Number(userId));
  if (!user) return;
  $("adminSelectedUserId").value = String(user.user_id);
  $("adminEditName").value = user.name || "";
  $("adminEditEmail").value = user.email || "";
  $("adminEditPhone").value = user.phone || "";
  $("adminEditEmailNotifications").checked = Boolean(user.email_notifications_enabled);
  $("adminEditPlanWebsite").checked = Boolean(user.plan_with_website);
  $("adminEditPlanCode").value = user.plan_code || "";
  $("adminEditSubscriptionStatus").value = user.subscription_status || "";
  $("adminEditPaymentStatus").value = user.payment_status || "";
  $("adminEditTrialStatus").value = user.trial_status || "";
  $("adminEditBillingCycle").value = user.billing_cycle || "";
  setStatus(`Editing user ${user.name || user.email || user.user_id}`);
}

function renderDashboard() {
  const metrics = state.dashboard?.metrics || {};
  $("metricAdmins").textContent = String(metrics.admins || 0);
  $("metricUsers").textContent = String(metrics.users || 0);
  $("metricAccounts").textContent = String(metrics.accounts || 0);
  $("metricTransactions").textContent = String(metrics.transactions || 0);
  if ($("adminWhoami")) {
    const admin = state.admin || {};
    $("adminWhoami").textContent = `${admin.name || "Admin"} • ${admin.position || ""}`.trim();
  }
  renderAdmins();
  renderUsers();
  renderAccounts();
  renderTransactions();
  renderCategories();
  renderDailyBalances();
}

async function loadDashboard() {
  const session = await api("/admin1957/session");
  state.admin = session.admin || null;
  const dashboard = await api("/admin1957/dashboard");
  state.dashboard = dashboard;
  renderDashboard();
}

window.addEventListener("load", async () => {
  applyTheme(localStorage.getItem("keeperbma_theme") || "light");
  $("adminThemeToggle").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
  $("adminRefreshBtn").onclick = async () => {
    try {
      setStatus("");
      await loadDashboard();
      setStatus("Dashboard refreshed.");
    } catch (error) {
      setStatus(error.message || "Failed to refresh dashboard.", true);
    }
  };
  $("adminLogoutBtn").onclick = async () => {
    try {
      await api("/admin1957/logout", { method: "POST" });
    } catch (_) {}
    window.location.replace("/kmak/1957/1965/a/login");
  };
  $("adminSaveUserBtn").onclick = async () => {
    try {
      const userId = Number($("adminSelectedUserId").value || 0);
      if (!userId) {
        setStatus("Select a user first.", true);
        return;
      }
      const payload = {
        name: $("adminEditName").value.trim(),
        email: $("adminEditEmail").value.trim(),
        phone: $("adminEditPhone").value.trim(),
        email_notifications_enabled: $("adminEditEmailNotifications").checked,
        plan_code: $("adminEditPlanCode").value || null,
        subscription_status: $("adminEditSubscriptionStatus").value || null,
        payment_status: $("adminEditPaymentStatus").value || null,
        trial_status: $("adminEditTrialStatus").value || null,
        billing_cycle: $("adminEditBillingCycle").value || null,
        plan_with_website: $("adminEditPlanWebsite").checked,
      };
      Object.keys(payload).forEach((key) => {
        if (payload[key] === "") payload[key] = null;
      });
      await api(`/admin1957/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await loadDashboard();
      loadUserIntoForm(userId);
      setStatus("User updated successfully.");
    } catch (error) {
      setStatus(error.message || "Failed to update user.", true);
    }
  };

  try {
    await loadDashboard();
  } catch (error) {
    window.location.replace("/kmak/1957/1965/a/login");
  }
});
