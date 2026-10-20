const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyReport, reportCsv } = require('../frontends/web/creator-tools.js');
const { calculate } = require('../frontends/web/profit-calculator.js');

test('monthly totals exclude transfers, other months and invalid amounts; aggregate sources in cents', () => {
  const result = monthlyReport([
    { date: '2026-10-01', type: 'income', amount: 0.1, category: 'YouTube' },
    { date: '2026-10-02', type: 'income', amount: 0.2, category: 'YouTube' },
    { date: '2026-10-03', tx_type: 'expense', amount: 0.1 },
    { date: '2026-10-03', type: 'transfer', amount: 500 },
    { date: '2026-09-30', type: 'income', amount: 100 },
    { date: '2026-10-03', type: 'income', amount: 'invalid' },
  ], '2026-10');
  assert.equal(result.income, 0.3);
  assert.equal(result.expenses, 0.1);
  assert.equal(result.net, 0.2);
  assert.deepEqual(result.sources, [['YouTube', 0.3]]);
  assert.equal(result.rows.length, 3);
});
test('empty months have zero totals', () => {
  assert.equal(monthlyReport([], '2026-10').net, 0);
});
test('CSV escapes quotes, newlines and spreadsheet formula text', () => {
  const csv = reportCsv(monthlyReport([
    { date: '2026-10-01', type: 'income', amount: 10, category: '=1+1', note: 'Text, "quoted"\nsecond line' },
  ], '2026-10'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Text, ""quoted""\nsecond line"'));
});

test('negative net income remains a numeric CSV value', () => {
  const report = monthlyReport([{ date: '2026-10-01', type: 'expense', amount: 40 }], '2026-10');
  assert.ok(reportCsv(report).endsWith('"Net income",-40'));
});

test('free calculator uses cents and calculates income needed for a goal', () => {
  assert.deepEqual(calculate([370, 0, 25, 45, 200]), { costs: 70, net: 300, requiredIncome: 270, goal: 200 });
  assert.equal(calculate([0, 0.1, 0.2, 0, 100]).requiredIncome, 100.3);
  assert.throws(() => calculate([0, -1, 0, 0, 200]));
  assert.throws(() => calculate([1.005, 0, 0, 0, 200]));
});
