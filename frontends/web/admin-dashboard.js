const $ = (id) => document.getElementById(id);
const state = {
  apiBase: "https://api.keeperbma.com",
  theme: "light",
  admin: null,
  dashboard: null,
  filters: {
    admins: "",
    users: "",
    accounts: "",
    transactions: "",
    categories: "",
    dailyBalances: "",
  },
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

function setStatus(targetId, message, isError = false) {
  const el = $(targetId);
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error-text", Boolean(isError));
  el.classList.toggle("success-text", !isError && Boolean(message));
}

function setDashboardStatus(message, isError = false) {
  setStatus("adminDashboardStatus", message, isError);
}

function setAdminStatus(message, isError = false) {
  setStatus("adminAdminStatus", message, isError);
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

function filterItems(items, key, toSearchText) {
  const needle = String(state.filters[key] || "").trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => String(toSearchText(item) || "").toLowerCase().includes(needle));
}

function permissions() {
  const explicit = state.admin?.permissions;
  if (explicit) return explicit;
  const role = String(state.admin?.position || "").trim().toLowerCase();
  return {
    can_manage_admins: role === "owner",
    can_manage_users: role === "owner" || role === "manager",
    read_only: role === "support",
  };
}

function lookupUserName(userId) {
  const users = state.dashboard?.users || [];
  const hit = users.find((u) => Number(u.user_id) === Number(userId));
  return hit ? escapeHtml(hit.name || hit.email || `User ${userId}`) : escapeHtml(String(userId || ""));
}

function setAdminEditorVisibility() {
  const canManageAdmins = Boolean(permissions().can_manage_admins);
  const card = $("adminManageCard");
  if (card) card.style.display = canManageAdmins ? "block" : "none";
}

function setUserEditorState() {
  const canManageUsers = Boolean(permissions().can_manage_users);
  [
    "adminEditName",
    "adminEditEmail",
    "adminEditPhone",
    "adminEditEmailNotifications",
    "adminEditPlanWebsite",
    "adminEditPlanCode",
    "adminEditSubscriptionStatus",
    "adminEditPaymentStatus",
    "adminEditTrialStatus",
    "adminEditBillingCycle",
    "adminSaveUserBtn",
  ].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.disabled = !canManageUsers;
  });
}

function renderAdmins() {
  const tbody = $("adminAdminsTable")?.querySelector("tbody");
  if (!tbody) return;
  const canManageAdmins = Boolean(permissions().can_manage_admins);
  const rows = filterItems(
    state.dashboard?.admins || [],
    "admins",
    (admin) => [admin.id, admin.name, admin.email, admin.phone, admin.position, admin.created_at].join(" ")
  ).map((admin) => {
    const action = canManageAdmins
      ? `<button type="button" class="secondary admin-edit-admin" data-admin-id="${escapeHtml(admin.id)}">Edit</button>`
      : "<span class=\"muted\">-</span>";
    return `
      <tr>
        ${rowCell("ID", escapeHtml(admin.id))}
        ${rowCell("Name", escapeHtml(admin.name))}
        ${rowCell("Email", escapeHtml(admin.email))}
        ${rowCell("Phone", escapeHtml(admin.phone))}
        ${rowCell("Position", escapeHtml(admin.position))}
        ${rowCell("Created", escapeHtml(admin.created_at))}
        ${rowCell("Action", action, "table-actions")}
      </tr>
    `;
  }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="7" data-label="Empty">No admins found.</td></tr>`;
  tbody.querySelectorAll(".admin-edit-admin").forEach((btn) => {
    btn.onclick = () => loadAdminIntoForm(Number(btn.dataset.adminId || 0));
  });
}

function renderUsers() {
  const tbody = $("adminUsersTable")?.querySelector("tbody");
  if (!tbody) return;
  const canManageUsers = Boolean(permissions().can_manage_users);
  const rows = filterItems(
    state.dashboard?.users || [],
    "users",
    (user) => [
      user.user_id,
      user.name,
      user.email,
      user.phone,
      user.plan_code,
      user.subscription_status,
      user.payment_status,
      user.trial_status,
    ].join(" ")
  ).map((user) => {
    const action = canManageUsers
      ? `<button type="button" class="secondary admin-edit-user" data-user-id="${escapeHtml(user.user_id)}">Edit</button>`
      : "<span class=\"muted\">Read only</span>";
    return `
      <tr>
        ${rowCell("ID", escapeHtml(user.user_id))}
        ${rowCell("Name", escapeHtml(user.name))}
        ${rowCell("Email", escapeHtml(user.email))}
        ${rowCell("Phone", escapeHtml(user.phone))}
        ${rowCell("Plan", escapeHtml(user.plan_code))}
        ${rowCell("Subscription", escapeHtml(user.subscription_status))}
        ${rowCell("Payment", escapeHtml(user.payment_status))}
        ${rowCell("Trial", escapeHtml(user.trial_status))}
        ${rowCell("Action", action, "table-actions")}
      </tr>
    `;
  }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="9" data-label="Empty">No users found.</td></tr>`;
  tbody.querySelectorAll(".admin-edit-user").forEach((btn) => {
    btn.onclick = () => loadUserIntoForm(Number(btn.dataset.userId || 0));
  });
}

function renderAccounts() {
  const tbody = $("adminAccountsTable")?.querySelector("tbody");
  if (!tbody) return;
  const rows = filterItems(
    state.dashboard?.accounts || [],
    "accounts",
    (account) => [
      account.account_id,
      lookupUserName(account.user_id),
      account.account_name,
      account.account_type,
      account.balance,
    ].join(" ")
  ).map((account) => `
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
  const rows = filterItems(
    state.dashboard?.transactions || [],
    "transactions",
    (tx) => {
      const account = accounts.find((a) => Number(a.account_id) === Number(tx.account_id));
      return [
        tx.txn_id,
        lookupUserName(tx.user_id),
        tx.date,
        tx.type,
        tx.amount,
        account?.account_name || tx.account_id,
        tx.category,
        tx.note,
      ].join(" ");
    }
  ).map((tx) => {
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
  const rows = filterItems(
    state.dashboard?.categories || [],
    "categories",
    (category) => [
      category.category_id,
      lookupUserName(category.user_id),
      category.name,
      category.type,
      category.is_auto,
      category.account_linked,
    ].join(" ")
  ).map((category) => `
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
  const rows = filterItems(
    state.dashboard?.daily_balances || [],
    "dailyBalances",
    (item) => [
      item.dailyb_id,
      lookupUserName(item.user_id),
      item.date,
      item.income,
      item.expense,
      item.net,
      item.snapshot,
    ].join(" ")
  ).map((item) => `
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

function loadAdminIntoForm(adminId) {
  const admin = (state.dashboard?.admins || []).find((item) => Number(item.id) === Number(adminId));
  if (!admin) return;
  $("adminSelectedAdminId").value = String(admin.id);
  $("adminEditAdminName").value = admin.name || "";
  $("adminEditAdminEmail").value = admin.email || "";
  $("adminEditAdminPhone").value = admin.phone || "";
  $("adminEditAdminPosition").value = String(admin.position || "owner").toLowerCase();
  $("adminResetPassword").value = "";
  setAdminStatus(`Editing admin ${admin.name || admin.email || admin.id}`);
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

function clearAdminCreateForm() {
  if ($("adminCreateName")) $("adminCreateName").value = "";
  if ($("adminCreateEmail")) $("adminCreateEmail").value = "";
  if ($("adminCreatePhone")) $("adminCreatePhone").value = "";
  if ($("adminCreatePosition")) $("adminCreatePosition").value = "owner";
  if ($("adminCreatePassword")) $("adminCreatePassword").value = "";
  const password = $("adminCreatePassword");
  const toggle = $("adminCreatePasswordToggle");
  if (password) password.type = "password";
  if (toggle) {
    toggle.textContent = "Show";
    toggle.setAttribute("aria-pressed", "false");
  }
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
  setDashboardStatus(`Editing user ${user.name || user.email || user.user_id}`);
}

function renderDashboard() {
  const metrics = state.dashboard?.metrics || {};
  $("metricAdmins").textContent = String(metrics.admins || 0);
  $("metricUsers").textContent = String(metrics.users || 0);
  $("metricAccounts").textContent = String(metrics.accounts || 0);
  $("metricTransactions").textContent = String(metrics.transactions || 0);
  if ($("adminWhoami")) {
    const admin = state.admin || {};
    $("adminWhoami").textContent = `${admin.name || "Admin"} - ${admin.position || ""}`.trim();
  }
  setAdminEditorVisibility();
  setUserEditorState();
  renderAdmins();
  renderUsers();
  renderAccounts();
  renderTransactions();
  renderCategories();
  renderDailyBalances();
}

function bindTableSearch(inputId, key) {
  const input = $(inputId);
  if (!input) return;
  input.value = state.filters[key] || "";
  input.oninput = () => {
    state.filters[key] = input.value || "";
    renderDashboard();
  };
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
  bindPasswordToggle("adminCreatePassword", "adminCreatePasswordToggle");
  bindTableSearch("adminAdminsSearch", "admins");
  bindTableSearch("adminUsersSearch", "users");
  bindTableSearch("adminAccountsSearch", "accounts");
  bindTableSearch("adminTransactionsSearch", "transactions");
  bindTableSearch("adminCategoriesSearch", "categories");
  bindTableSearch("adminDailyBalancesSearch", "dailyBalances");

  $("adminRefreshBtn").onclick = async () => {
    try {
      setDashboardStatus("");
      setAdminStatus("");
      await loadDashboard();
      setDashboardStatus("Dashboard refreshed.");
    } catch (error) {
      setDashboardStatus(error.message || "Failed to refresh dashboard.", true);
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
      if (!permissions().can_manage_users) {
        setDashboardStatus("Your role is read-only.", true);
        return;
      }
      const userId = Number($("adminSelectedUserId").value || 0);
      if (!userId) {
        setDashboardStatus("Select a user first.", true);
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
      setDashboardStatus("User updated successfully.");
    } catch (error) {
      setDashboardStatus(error.message || "Failed to update user.", true);
    }
  };

  const saveAdminBtn = $("adminSaveAdminBtn");
  if (saveAdminBtn) {
    saveAdminBtn.onclick = async () => {
      try {
        if (!permissions().can_manage_admins) {
          setAdminStatus("Only owners can manage admins.", true);
          return;
        }
        const adminId = Number($("adminSelectedAdminId").value || 0);
        if (!adminId) {
          setAdminStatus("Select an admin first.", true);
          return;
        }
        const payload = {
          name: $("adminEditAdminName").value.trim(),
          email: $("adminEditAdminEmail").value.trim(),
          phone: $("adminEditAdminPhone").value.trim(),
          position: $("adminEditAdminPosition").value || null,
        };
        Object.keys(payload).forEach((key) => {
          if (payload[key] === "") payload[key] = null;
        });
        await api(`/admin1957/admins/${adminId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        await loadDashboard();
        loadAdminIntoForm(adminId);
        setAdminStatus("Admin updated successfully.");
      } catch (error) {
        setAdminStatus(error.message || "Failed to update admin.", true);
      }
    };
  }

  const createAdminBtn = $("adminCreateAdminBtn");
  if (createAdminBtn) {
    createAdminBtn.onclick = async () => {
      try {
        if (!permissions().can_manage_admins) {
          setAdminStatus("Only owners can manage admins.", true);
          return;
        }
        const name = $("adminCreateName").value.trim();
        const email = $("adminCreateEmail").value.trim();
        const phone = $("adminCreatePhone").value.trim();
        const position = $("adminCreatePosition").value || "";
        const password = $("adminCreatePassword").value || "";
        if (!name || !email || !phone || !position || !password) {
          setAdminStatus("Fill in all create-admin fields first.", true);
          return;
        }
        await api("/admin1957/register", {
          method: "POST",
          body: JSON.stringify({ name, email, phone, position, password }),
        });
        clearAdminCreateForm();
        await loadDashboard();
        setAdminStatus("Admin created successfully.");
      } catch (error) {
        setAdminStatus(error.message || "Failed to create admin.", true);
      }
    };
  }

  const deleteAdminBtn = $("adminDeleteAdminBtn");
  if (deleteAdminBtn) {
    deleteAdminBtn.onclick = async () => {
      try {
        if (!permissions().can_manage_admins) {
          setAdminStatus("Only owners can manage admins.", true);
          return;
        }
        const adminId = Number($("adminSelectedAdminId").value || 0);
        if (!adminId) {
          setAdminStatus("Select an admin first.", true);
          return;
        }
        if (!window.confirm("Delete this admin? This cannot be undone.")) return;
        await api(`/admin1957/admins/${adminId}`, { method: "DELETE" });
        $("adminSelectedAdminId").value = "";
        $("adminEditAdminName").value = "";
        $("adminEditAdminEmail").value = "";
        $("adminEditAdminPhone").value = "";
        $("adminEditAdminPosition").value = "owner";
        $("adminResetPassword").value = "";
        await loadDashboard();
        setAdminStatus("Admin deleted successfully.");
      } catch (error) {
        setAdminStatus(error.message || "Failed to delete admin.", true);
      }
    };
  }

  const resetAdminPasswordBtn = $("adminResetAdminPasswordBtn");
  if (resetAdminPasswordBtn) {
    resetAdminPasswordBtn.onclick = async () => {
      try {
        if (!permissions().can_manage_admins) {
          setAdminStatus("Only owners can manage admins.", true);
          return;
        }
        const adminId = Number($("adminSelectedAdminId").value || 0);
        const newPassword = $("adminResetPassword").value || "";
        if (!adminId) {
          setAdminStatus("Select an admin first.", true);
          return;
        }
        if (!newPassword) {
          setAdminStatus("Enter a new password first.", true);
          return;
        }
        await api(`/admin1957/admins/${adminId}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ new_password: newPassword }),
        });
        $("adminResetPassword").value = "";
        setAdminStatus("Admin password reset successfully.");
      } catch (error) {
        setAdminStatus(error.message || "Failed to reset admin password.", true);
      }
    };
  }

  try {
    await loadDashboard();
  } catch (_) {
    window.location.replace("/kmak/1957/1965/a/login");
  }
});

