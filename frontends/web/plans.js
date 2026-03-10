const $ = (id) => document.getElementById(id);

const SIGNUP_PLAN_KEY = "keeperbma_signup_plan";
const SIGNUP_WITH_WEBSITE_KEY = "keeperbma_signup_with_website";
const SIGNUP_COUPON_KEY = "keeperbma_signup_coupon";
const SIGNUP_COUPON_MAP_KEY = "keeperbma_signup_coupon_map";
const BILLING_CYCLE_KEY = "keeperbma_billing_cycle";
const PLAN_SEGMENT_KEY = "keeperbma_plan_segment";
const ALLOWED_SIGNUP_PLANS = new Set(["basic", "regular", "business", "premium_plus", "diamond"]);
const ALLOWED_REGISTER_PLANS = new Set(["basic", "regular", "business", "premium_plus"]);
const ALLOWED_BILLING_CYCLES = new Set(["monthly", "annual"]);
const ALLOWED_PLAN_SEGMENTS = new Set(["personal", "business"]);
const COUPON_MAX_LEN = 64;

const state = {
  selectedPlan: "",
  billingCycle: "monthly",
  planSegment: "personal",
  couponsByPlan: {
    basic: "",
    regular: "",
    business: "",
    premium_plus: "",
    diamond: "",
  },
};

function normalizePlan(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  return ALLOWED_SIGNUP_PLANS.has(key) ? key : "";
}

function normalizeRegisterPlan(planCode) {
  const key = String(planCode || "").trim().toLowerCase();
  return ALLOWED_REGISTER_PLANS.has(key) ? key : "";
}

function normalizeBillingCycle(cycle) {
  const key = String(cycle || "").trim().toLowerCase();
  return ALLOWED_BILLING_CYCLES.has(key) ? key : "monthly";
}

function normalizePlanSegment(segment) {
  const key = String(segment || "").trim().toLowerCase();
  return ALLOWED_PLAN_SEGMENTS.has(key) ? key : "personal";
}

function normalizeCoupon(rawCoupon) {
  return String(rawCoupon || "").trim().slice(0, COUPON_MAX_LEN);
}

function parseBoolFlag(value) {
  const key = String(value || "").trim().toLowerCase();
  return key === "1" || key === "true" || key === "yes" || key === "on";
}

function effectivePlanForRegister(uiPlanCode) {
  const uiPlan = normalizePlan(uiPlanCode);
  if (!uiPlan) return "";
  if (uiPlan === "diamond") return "premium_plus";
  return normalizeRegisterPlan(uiPlan);
}

function withWebsiteForPlan(uiPlanCode) {
  const uiPlan = normalizePlan(uiPlanCode);
  return uiPlan === "diamond";
}

function uiPlanFromStored(registerPlanCode, withWebsite = false) {
  const registerPlan = normalizeRegisterPlan(registerPlanCode) || normalizePlan(registerPlanCode);
  if (!registerPlan) return "";
  if (registerPlan === "premium_plus" && withWebsite) return "diamond";
  return normalizePlan(registerPlan);
}

function segmentForPlan(uiPlanCode) {
  const uiPlan = normalizePlan(uiPlanCode);
  if (!uiPlan) return "personal";
  if (uiPlan === "basic" || uiPlan === "regular") return "personal";
  return "business";
}

function loadCouponMap() {
  const out = {
    basic: "",
    regular: "",
    business: "",
    premium_plus: "",
    diamond: "",
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

function renderBillingCycle() {
  const cycle = normalizeBillingCycle(state.billingCycle);
  state.billingCycle = cycle;
  localStorage.setItem(BILLING_CYCLE_KEY, cycle);

  const switchEl = $("billingCycleSwitch");
  if (switchEl) switchEl.setAttribute("data-state", cycle === "annual" ? "right" : "left");

  document.querySelectorAll("[data-billing-cycle]").forEach((el) => {
    const value = normalizeBillingCycle(el.getAttribute("data-billing-cycle"));
    el.classList.toggle("active", value === cycle);
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
    premium_plus: { monthly: "$50 / month", annual: "$500 / year (save $100/yr)" },
    diamond: { monthly: "$70 / month", annual: "$700 / year (save $140/yr)" },
  };

  document.querySelectorAll("[data-plan-price]").forEach((el) => {
    const plan = normalizePlan(el.getAttribute("data-plan-price"));
    if (!plan || !priceMap[plan]) return;
    el.textContent = priceMap[plan][cycle];
  });
}

function renderPlanSegment() {
  const segment = normalizePlanSegment(state.planSegment);
  state.planSegment = segment;
  localStorage.setItem(PLAN_SEGMENT_KEY, segment);

  const switchEl = $("planTypeSwitch");
  if (switchEl) switchEl.setAttribute("data-state", segment === "business" ? "right" : "left");

  document.querySelectorAll("[data-plan-segment-toggle]").forEach((el) => {
    const value = normalizePlanSegment(el.getAttribute("data-plan-segment-toggle"));
    el.classList.toggle("active", value === segment);
  });

  const hintEl = $("planTypeHint");
  if (hintEl) {
    hintEl.textContent = segment === "business"
      ? "Business includes Business, Premium Plus, and Diamond."
      : "Personal includes Basic and Regular.";
  }

  document.querySelectorAll(".plan-option").forEach((el) => {
    const itemSegment = normalizePlanSegment(el.getAttribute("data-plan-segment"));
    const hidden = itemSegment !== segment;
    el.classList.toggle("segment-hidden", hidden);
  });

  if (state.selectedPlan && segmentForPlan(state.selectedPlan) !== segment) {
    state.selectedPlan = "";
    localStorage.removeItem(SIGNUP_PLAN_KEY);
    localStorage.removeItem(SIGNUP_WITH_WEBSITE_KEY);
    localStorage.removeItem(SIGNUP_COUPON_KEY);
  }
}

function renderSelectedPlan() {
  document.querySelectorAll(".plan-option").forEach((el) => {
    const plan = normalizePlan(el.getAttribute("data-plan"));
    const isHidden = el.classList.contains("segment-hidden");
    el.classList.toggle("active", !isHidden && plan && plan === state.selectedPlan);
  });
}

function choosePlan(planCode) {
  const selected = normalizePlan(planCode);
  if (!selected) return;
  state.selectedPlan = selected;
  state.planSegment = segmentForPlan(selected);
  renderPlanSegment();
  renderSelectedPlan();

  const registerPlan = effectivePlanForRegister(selected);
  const withWebsite = withWebsiteForPlan(selected);
  const coupon = getCouponForPlan(selected);
  if (registerPlan) localStorage.setItem(SIGNUP_PLAN_KEY, registerPlan);
  localStorage.setItem(SIGNUP_WITH_WEBSITE_KEY, withWebsite ? "1" : "0");
  localStorage.setItem(SIGNUP_COUPON_KEY, coupon);
  setStatus("");
}

function renderCouponInputs() {
  document.querySelectorAll("[data-coupon-plan]").forEach((inputEl) => {
    const plan = normalizePlan(inputEl.getAttribute("data-coupon-plan"));
    if (!plan) return;
    inputEl.value = getCouponForPlan(plan);
  });
}

function continueToSignup(planCode) {
  const uiPlan = normalizePlan(planCode) || state.selectedPlan;
  if (!uiPlan) {
    setStatus("Please select a plan to continue.");
    return;
  }
  choosePlan(uiPlan);

  const registerPlan = effectivePlanForRegister(uiPlan);
  if (!registerPlan) {
    setStatus("Invalid plan selected. Please try again.");
    return;
  }

  const cycle = normalizeBillingCycle(state.billingCycle);
  const withWebsite = withWebsiteForPlan(uiPlan);
  const coupon = getCouponForPlan(uiPlan);

  localStorage.setItem(SIGNUP_PLAN_KEY, registerPlan);
  localStorage.setItem(SIGNUP_WITH_WEBSITE_KEY, withWebsite ? "1" : "0");
  localStorage.setItem(SIGNUP_COUPON_KEY, coupon);
  localStorage.setItem(BILLING_CYCLE_KEY, cycle);

  const couponQuery = coupon ? `&coupon=${encodeURIComponent(coupon)}` : "";
  const websiteQuery = `&website=${withWebsite ? "1" : "0"}`;
  window.location.href = `./auth.html?mode=signup&plan=${encodeURIComponent(registerPlan)}&cycle=${encodeURIComponent(cycle)}${websiteQuery}${couponQuery}`;
}

window.addEventListener("load", () => {
  const q = new URLSearchParams(window.location.search);

  const queryPlanRaw = String(q.get("plan") || "").trim().toLowerCase();
  const queryCycleRaw = String(q.get("cycle") || "").trim().toLowerCase();
  const queryCoupon = normalizeCoupon(q.get("coupon"));
  const querySegmentRaw = String(q.get("segment") || "").trim().toLowerCase();
  const queryWebsite = parseBoolFlag(q.get("website"));

  const savedPlanRaw = String(localStorage.getItem(SIGNUP_PLAN_KEY) || "").trim().toLowerCase();
  const savedCycleRaw = String(localStorage.getItem(BILLING_CYCLE_KEY) || "").trim().toLowerCase();
  const savedCoupon = normalizeCoupon(localStorage.getItem(SIGNUP_COUPON_KEY));
  const savedSegmentRaw = String(localStorage.getItem(PLAN_SEGMENT_KEY) || "").trim().toLowerCase();
  const savedWebsite = parseBoolFlag(localStorage.getItem(SIGNUP_WITH_WEBSITE_KEY));

  const queryUiPlan = uiPlanFromStored(queryPlanRaw, queryWebsite);
  const savedUiPlan = uiPlanFromStored(savedPlanRaw, savedWebsite);
  const queryCycle = queryCycleRaw ? normalizeBillingCycle(queryCycleRaw) : "";
  const savedCycle = savedCycleRaw ? normalizeBillingCycle(savedCycleRaw) : "monthly";
  const querySegment = querySegmentRaw ? normalizePlanSegment(querySegmentRaw) : "";
  const savedSegment = savedSegmentRaw ? normalizePlanSegment(savedSegmentRaw) : "";

  state.couponsByPlan = loadCouponMap();
  state.selectedPlan = queryUiPlan || savedUiPlan;
  state.billingCycle = queryCycle || savedCycle || "monthly";
  state.planSegment = querySegment
    || savedSegment
    || (state.selectedPlan ? segmentForPlan(state.selectedPlan) : "personal");

  if (queryUiPlan && queryCoupon) {
    setCouponForPlan(queryUiPlan, queryCoupon);
  } else if (savedUiPlan && savedCoupon && !getCouponForPlan(savedUiPlan)) {
    setCouponForPlan(savedUiPlan, savedCoupon);
  }

  renderPlanSegment();
  renderBillingCycle();
  renderSelectedPlan();
  renderCouponInputs();

  document.querySelectorAll("[data-plan-segment-toggle]").forEach((el) => {
    el.onclick = () => {
      state.planSegment = normalizePlanSegment(el.getAttribute("data-plan-segment-toggle"));
      renderPlanSegment();
      renderSelectedPlan();
    };
  });

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
        target
        && (
          target.closest("[data-plan-continue]")
          || target.closest("[data-coupon-plan]")
          || target.closest("[data-billing-cycle]")
          || target.closest("[data-plan-segment-toggle]")
        )
      ) {
        return;
      }
      choosePlan(el.getAttribute("data-plan"));
      renderSelectedPlan();
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
