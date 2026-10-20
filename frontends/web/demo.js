"use strict";
// Entirely local sample data: this page never authenticates or calls the API.
const demoNow = new Date();
const demoMonth = `${demoNow.getFullYear()}-${String(demoNow.getMonth() + 1).padStart(2, "0")}`;
const originalDemoRows = [
  { date: `${demoMonth}-02`, type: "income", category: "YouTube", amount: 120, note: "Sample creator payout" },
  { date: `${demoMonth}-05`, type: "income", category: "Freelance", amount: 250, note: "Sample editing project" },
  { date: `${demoMonth}-06`, type: "expense", category: "Software subscriptions", amount: 25, note: "Sample editing software" },
  { date: `${demoMonth}-07`, type: "expense", category: "Equipment", amount: 45, note: "Sample microphone" },
];
const demoRows = [...originalDemoRows];
const demoCategories = [...new Set(demoRows.map((row) => row.category))];
const demoView = window.CreatorTools.mount({
  host: document.getElementById("demoWorkspace"),
  transactions: () => demoRows,
  categoryNames: () => demoCategories,
  hasAccounts: () => true,
  addCategory: async (name) => { demoCategories.push(name); },
});
document.getElementById("demoEntry").onsubmit = (event) => {
  event.preventDefault();
  const amount = Number(document.getElementById("demoAmount").value);
  const category = document.getElementById("demoSource").value.trim();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000 || !category) return;
  const month = document.querySelector(".creator-month").value;
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  demoRows.push({ date: `${month}-15`, type: document.getElementById("demoType").value, category, amount, note: "User-entered fictional sample" });
  if (!demoCategories.includes(category)) demoCategories.push(category);
  demoView.update();
  document.getElementById("demoEntryStatus").textContent = "Sample added to the selected report month. Your real account is unchanged.";
  document.getElementById("demoAmount").value = "";
};
document.getElementById("resetDemo").onclick = () => {
  demoRows.splice(0, demoRows.length, ...originalDemoRows);
  demoCategories.splice(0, demoCategories.length, ...new Set(demoRows.map((row) => row.category)));
  document.querySelector(".creator-month").value = demoMonth;
  demoView.update();
  document.getElementById("demoEntryStatus").textContent = "Sample data reset.";
};
document.getElementById("shareDemo").onclick = async () => {
  const status = document.getElementById("shareDemoStatus");
  const url = new URL("./demo.html", window.location.href).href;
  try {
    if (navigator.share) await navigator.share({ title: "Try KeeperBMA", text: "Explore a sample side hustle income report. No signup needed.", url });
    else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      status.textContent = "Demo link copied. No financial data is included.";
    } else status.textContent = `Share this link: ${url}`;
  } catch (error) {
    if (error.name !== "AbortError") status.textContent = `Share this link: ${url}`;
  }
};
