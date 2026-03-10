const $ = (id) => document.getElementById(id);

const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const SIGNUP_COUPON_KEY = "keeperbma_signup_coupon";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus"]);

const state = {
  selectedPlan: "",
};

function normalizePlan(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  return ALLOWED_SIGNUP_PLANS.has(key) ? key : "";
}

function setStatus(msg) {
  const el = $("planStatus");
  if (el) el.textContent = msg || "";
}

function renderSelectedPlan() {
  document.querySelectorAll(".plan-option").forEach((el) => {
    const plan = normalizePlan(el.getAttribute("data-plan"));
    el.classList.toggle("active", plan && plan === state.selectedPlan);
  });
}

function choosePlan(planCode) {
  state.selectedPlan = normalizePlan(planCode);
  renderSelectedPlan();
  if (state.selectedPlan) {
    localStorage.setItem(SIGNUP_PLAN_KEY, state.selectedPlan);
    setStatus("");
  }
}

window.addEventListener("load", () => {
  const q = new URLSearchParams(window.location.search);
  const queryPlan = normalizePlan(q.get("plan"));
  const savedPlan = normalizePlan(localStorage.getItem(SIGNUP_PLAN_KEY));
  const savedCoupon = String(localStorage.getItem(SIGNUP_COUPON_KEY) || "");

  state.selectedPlan = queryPlan || savedPlan;
  if ($("planCoupon")) {
    $("planCoupon").value = savedCoupon;
  }
  renderSelectedPlan();

  document.querySelectorAll(".plan-option").forEach((el) => {
    el.onclick = () => choosePlan(el.getAttribute("data-plan"));
  });

  if ($("btnPlanBack")) {
    $("btnPlanBack").onclick = () => {
      window.location.href = "./index.html";
    };
  }

  if ($("btnPlanContinue")) {
    $("btnPlanContinue").onclick = () => {
      const coupon = String(($("planCoupon")?.value || "")).trim();
      if (!state.selectedPlan) {
        setStatus("Please select a plan to continue.");
        return;
      }
      localStorage.setItem(SIGNUP_PLAN_KEY, state.selectedPlan);
      localStorage.setItem(SIGNUP_COUPON_KEY, coupon);
      const couponQuery = coupon ? `&coupon=${encodeURIComponent(coupon)}` : "";
      window.location.href = `./auth.html?mode=signup&plan=${encodeURIComponent(state.selectedPlan)}${couponQuery}`;
    };
  }
});
