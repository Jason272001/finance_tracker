const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { monthlyReport } = require('../frontends/web/creator-tools.js');

test('native and web monthly reports agree on dates, transfers, cents, and sources', async () => {
  const { creatorReport, monthKey } = await import(pathToFileURL(path.resolve(__dirname, '../frontends/mobile/src/utils/creatorReport.ts')).href);
  const rows = [
    { txn_id: 1, user_id: 1, account_id: 1, date: '2026-10-01', type: 'income', category: 'Freelance', amount: '10.10' },
    { txn_id: 2, user_id: 1, account_id: 1, date: '2026-10-02', tx_type: 'income', category: 'Freelance', amount: 20.20 },
    { txn_id: 3, user_id: 1, account_id: 1, date: '2026-10-03', type: 'expense', amount: 0.10 },
    { txn_id: 4, user_id: 1, account_id: 1, date: '2026-10-03', type: 'transfer', amount: 999 },
    { txn_id: 5, user_id: 1, account_id: 1, date: '2026-09-30', type: 'income', amount: 500 },
  ];
  const native = creatorReport(rows, '2026-10');
  const web = monthlyReport(rows, '2026-10');
  assert.equal(native.income, web.income);
  assert.equal(native.expenses, web.expenses);
  assert.equal(native.net, web.net);
  assert.deepEqual(native.sources, web.sources.map(([name, amount]) => ({ name, amount })));
  assert.equal(monthKey(new Date(2026, 0, 1)), '2026-01');
});
