(function (root) {
  "use strict";
  function calculate(values) {
    const cents = values.map((value) => {
      const number = Number(value === "" ? 0 : value);
      if (!Number.isFinite(number) || number < 0 || number > 10000000 || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) {
        throw new Error("Enter non-negative amounts with at most two decimal places (up to $10,000,000 per field).");
      }
      return Math.round(number * 100);
    });
    if (cents.length !== 5) throw new Error("Five amounts are required.");
    const [income, fees, software, other, goal] = cents;
    const costs = fees + software + other;
    return { costs: costs / 100, net: (income - costs) / 100, requiredIncome: (goal + costs) / 100, goal: goal / 100 };
  }
  if (typeof module !== "undefined" && module.exports) { module.exports = { calculate }; return; }
  const form = document.getElementById("profitCalculator");
  const ids = ["calculatorIncome", "calculatorFees", "calculatorSoftware", "calculatorOther", "calculatorGoal"];
  const fields = ids.map((id) => document.getElementById(id));
  const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  function update() {
    try {
      const result = calculate(fields.map((field) => field.value));
      document.getElementById("calculatorError").textContent = "";
      document.getElementById("calculatorCosts").textContent = money(result.costs);
      document.getElementById("calculatorNet").textContent = money(result.net);
      document.getElementById("calculatorRequired").textContent = money(result.requiredIncome);
      document.getElementById("calculatorExplanation").textContent = `With ${money(result.costs)} in entered costs, ${money(result.requiredIncome)} of income would meet your ${money(result.goal)} net income goal.`;
    } catch (error) {
      document.getElementById("calculatorError").textContent = error.message;
      ["calculatorCosts", "calculatorNet", "calculatorRequired"].forEach((id) => { document.getElementById(id).textContent = "—"; });
      document.getElementById("calculatorExplanation").textContent = "Correct your inputs to calculate a result.";
    }
  }
  form.oninput = update;
  form.onsubmit = (event) => event.preventDefault();
  document.getElementById("calculatorSample").onclick = () => { fields.forEach((field, index) => { field.value = [370, 0, 25, 45, 200][index]; }); update(); };
  document.getElementById("calculatorReset").onclick = () => { fields.forEach((field) => { field.value = ""; }); update(); };
  update();
})(typeof window !== "undefined" ? window : globalThis);
