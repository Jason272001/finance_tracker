const $ = (id) => document.getElementById(id);

const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const SIGNUP_COUPON_KEY = "keeperbma_signup_coupon";
const SIGNUP_COUPON_MAP_KEY = "keeperbma_signup_coupon_map";
const BILLING_CYCLE_KEY = "keeperbma_billing_cycle";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus"]);
const ALLOWED_BILLING_CYCLES = new Set(["monthly", "annual"]);
const COUPON_MAX_LEN = 64;

const state = {
  selectedPlan: "",
  billingCycle: "monthly",
  couponsByPlan: {
    basic: "",
    regular: "",
    business: "",
    premium_plus: "",
  },
};

function normalizePlan(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  return ALLOWED_SIGNUP_PLANS.has(key) ? key : "";
}

function normalizeBillingCycle(cycle) {
  const key = String(cycle || "").trim().toLowerCase();
  return ALLOWED_BILLING_CYCLES.has(key) ? key : "monthly";
}

function normalizeCoupon(rawCoupon) {
  return String(rawCoupon || "").trim().slice(0, COUPON_MAX_LEN);
}

function loadCouponMap() {
  const out = {
    basic: "",
    regular: "",
    business: "",
    premium_plus: "",
  };
  const raw = String(localStorage.getItem(SIGNUP_COUPON_MAP_KEY) || "").trim();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    Object.keys(out).forEach((plan) => {
      out[plan] = normalizeCoupon(parsed?.[plan]);
    });
  } catch (_) {}
  return out;
}

function saveCouponMap() {
  localStorage.setItem(SIGNUP_COUPON_MAP_KEY, JSON.stringify(state.couponsByPlan));
}

function getCouponForPlan(planCode) {
  const plan = normalizePlan(planCode);
  if (!plan) return "";
  return normalizeCoupon(state.couponsByPlan[plan]);
}

function setCouponForPlan(planCode, coupon) {
  const plan = normalizePlan(planCode);
  if (!plan) return;
  state.couponsByPlan[plan] = normalizeCoupon(coupon);
  saveCouponMap();
}

function setStatus(msg) {
  const el = $("planStatus");
  if (el) el.textContent = msg || "";
}

function cycleLabel(cycle) {
  return normalizeBillingCycle(cycle) === "annual" ? "yearly" : "monthly";
}

function renderBillingCycle() {
  const cycle = normalizeBillingCycle(state.billingCycle);
  state.billingCycle = cycle;
  localStorage.setItem(BILLING_CYCLE_KEY, cycle);

  document.querySelectorAll("[data-billing-cycle]").forEach((el) => {
    const value = normalizeBillingCycle(el.getAttribute("data-billing-cycle"));
    el.classList.toggle("active", value === cycle);
    if (value === cycle) el.classList.remove("secondary");
    else el.classList.add("secondary");
  });

  const hintEl = $("billingCycleHint");
  if (hintEl) {
    hintEl.textContent = cycle === "annual"
      ? "Yearly selected: discounted annual pricing will be used at checkout."
      : "Monthly selected: standard monthly pricing will be used at checkout.";
  }

  const priceMap = {
    basic: { monthly: "$2 / month", annual: "$20 / year (save $4/yr)" },
    regular: { monthly: "$5 / month", annual: "$50 / year (save $10/yr)" },
    business: { monthly: "$25 / month", annual: "$250 / year (save $50/yr)" },
    premium_plus: { monthly: "$50-$70 / month", annual: "$500-$700 / year (save up to $140/yr)" },
  };
  document.querySelectorAll("[data-plan-price]").forEach((el) => {
    const plan = normalizePlan(el.getAttribute("data-plan-price"));
    if (!plan || !priceMap[plan]) return;
    el.textContent = priceMap[plan][cycle];
  });
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
    localStorage.setItem(SIGNUP_COUPON_KEY, getCouponForPlan(state.selectedPlan));
    setStatus("");
  }
}

function renderCouponInputs() {
  document.querySelectorAll("[data-coupon-plan]").forEach((inputEl) => {
    const plan = normalizePlan(inputEl.getAttribute("data-coupon-plan"));
    if (!plan) return;
    inputEl.value = getCouponForPlan(plan);
  });
}

function continueToSignup(planCode) {
  const plan = normalizePlan(planCode) || state.selectedPlan;
  if (!plan) {
    setStatus("Please select a plan to continue.");
    return;
  }
  const cycle = normalizeBillingCycle(state.billingCycle);
  choosePlan(plan);
  const coupon = getCouponForPlan(plan);
  localStorage.setItem(SIGNUP_PLAN_KEY, plan);
  localStorage.setItem(SIGNUP_COUPON_KEY, coupon);
  localStorage.setItem(BILLING_CYCLE_KEY, cycle);
  const couponQuery = coupon ? `&coupon=${encodeURIComponent(coupon)}` : "";
  window.location.href = `./auth.html?mode=signup&plan=${encodeURIComponent(plan)}&cycle=${encodeURIComponent(cycle)}${couponQuery}`;
}

window.addEventListener("load", () => {
  const q = new URLSearchParams(window.location.search);
  const queryPlan = normalizePlan(q.get("plan"));
  const rawQueryCycle = String(q.get("cycle") || "").trim().toLowerCase();
  const queryCycle = rawQueryCycle ? normalizeBillingCycle(rawQueryCycle) : "";
  const queryCoupon = normalizeCoupon(q.get("coupon"));
  const savedPlan = normalizePlan(localStorage.getItem(SIGNUP_PLAN_KEY));
  const savedCycle = normalizeBillingCycle(localStorage.getItem(BILLING_CYCLE_KEY));
  const savedCoupon = normalizeCoupon(localStorage.getItem(SIGNUP_COUPON_KEY));

  state.couponsByPlan = loadCouponMap();
  state.billingCycle = queryCycle || savedCycle || "monthly";
  if (queryPlan && queryCoupon) {
    setCouponForPlan(queryPlan, queryCoupon);
  } else if (savedPlan && savedCoupon && !getCouponForPlan(savedPlan)) {
    // Migrate legacy single coupon storage to per-plan storage.
    setCouponForPlan(savedPlan, savedCoupon);
  }
  state.selectedPlan = queryPlan || savedPlan;
  renderBillingCycle();
  renderSelectedPlan();
  renderCouponInputs();

  document.querySelectorAll("[data-billing-cycle]").forEach((el) => {
    el.onclick = () => {
      state.billingCycle = normalizeBillingCycle(el.getAttribute("data-billing-cycle"));
      renderBillingCycle();
    };
  });

  document.querySelectorAll(".plan-option").forEach((el) => {
    el.onclick = (event) => {
      const target = event.target;
      if (
        target &&
        (
          target.closest("[data-plan-continue]") ||
          target.closest("[data-coupon-plan]") ||
          target.closest("[data-billing-cycle]")
        )
      ) {
        return;
      }
      choosePlan(el.getAttribute("data-plan"));
    };
  });

  document.querySelectorAll("[data-coupon-plan]").forEach((inputEl) => {
    inputEl.oninput = () => {
      const plan = inputEl.getAttribute("data-coupon-plan");
      setCouponForPlan(plan, inputEl.value);
      const normalized = getCouponForPlan(plan);
      if (inputEl.value !== normalized) inputEl.value = normalized;
      if (normalizePlan(plan) === state.selectedPlan) {
        localStorage.setItem(SIGNUP_COUPON_KEY, normalized);
      }
    };
  });

  document.querySelectorAll("[data-plan-continue]").forEach((btn) => {
    btn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      continueToSignup(btn.getAttribute("data-plan-continue"));
    };
  });

  if ($("btnPlanBack")) {
    $("btnPlanBack").onclick = () => {
      window.location.href = "./index.html";
    };
  }
});
