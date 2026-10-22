const { test, expect } = require('@playwright/test');

// Keep browser checks independent of live providers/CDNs. Individual account
// mocks registered below take precedence over this default external block.
test.beforeEach(async ({ page }) => {
  await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
});

test('public demo computes, exports, resets, and never calls the account API', async ({ page }) => {
  const apiCalls = [];
  page.on('request', request => { if (request.url().includes('api.keeperbma.com')) apiCalls.push(request.url()); });
  await page.goto('/demo.html');
  await expect(page.locator('.creator-net')).toHaveText('$300.00');
  await page.locator('#txType').selectOption('income');
  await page.locator('#txAccount').selectOption('1');
  await page.locator('#txAmount').fill('50');
  await page.locator('#txCategory').selectOption('Sponsorships');
  await page.locator('#btnAddTx').click();
  await expect(page.locator('.creator-net')).toHaveText('$350.00');
  await expect(page.locator('.creator-sources')).toContainText('Sponsorships: $50.00');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download monthly CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^keeperbma-\d{4}-\d{2}\.csv$/);
  await page.getByRole('button', { name: 'Restart demo' }).click();
  await expect(page.locator('.creator-net')).toHaveText('$300.00');
  await page.locator('.creator-month').fill('2020-01');
  await expect(page.locator('.creator-net')).toHaveText('$0.00');
  await expect(page.locator('.creator-export')).toBeDisabled();
  expect(apiCalls).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('demo can save through the Android native bridge', async ({ page }) => {
  await page.addInitScript(() => {
    window.Capacitor = { getPlatform: () => 'android', Plugins: { ReportExport: {
      saveCsv: async (report) => { window.testSavedReport = report; return {}; },
    } } };
  });
  await page.goto('/demo.html');
  await page.locator('.creator-export').click();
  await expect(page.locator('.creator-status')).toContainText('Report saved');
  expect(await page.evaluate(() => window.testSavedReport.csv)).toContain('Sample creator payout');
});

test('old Android clients receive an actionable export message', async ({ page }) => {
  await page.addInitScript(() => { window.Capacitor = { getPlatform: () => 'android', Plugins: {} }; });
  await page.goto('/demo.html');
  await page.locator('.creator-export').click();
  await expect(page.locator('.creator-status')).toContainText('open keeperbma.com in your browser');
});

async function mockAccount(page, failTransactions = false) {
  const categories = [];
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await page.route('https://api.keeperbma.com/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const profile = { user_id: 1, name: 'Sample creator', plan_code: 'basic', subscription_status: 'active', access_active: true, feature_flags: {} };
    let body = {};
    if (path === '/ready') body = { ok: true, storage: 'sql' };
    if (['/auth/session', '/profile', '/billing/subscription'].includes(path)) body = profile;
    if (path === '/accounts') body = [{ account_id: 1, account_name: 'Cash', account_type: 'asset', balance: 100 }];
    if (path === '/transactions') {
      if (failTransactions) return route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } });
      body = [{ txn_id: 1, date: `${month}-05`, type: 'income', amount: 100, category: 'Freelance', account_id: 1 }];
    }
    if (path === '/categories') {
      if (request.method() === 'POST') categories.push({ category_name: request.postDataJSON().category_name });
      body = request.method() === 'POST' ? { ok: true } : categories;
    }
    if (path === '/daily_balances') body = [];
    await route.fulfill({ json: body });
  });
}

for (const entry of ['/index.html', '/frontends/web/index.html']) {
  test(`signed-in creator workflow works from ${entry}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockAccount(page);
    await page.goto(entry);
    await expect(page.locator('#creatorReport')).toBeVisible();
    await expect(page.locator('.creator-net')).toHaveText('$100.00');
    await expect(page.locator('#incomeChart').locator('..')).toContainText('Chart unavailable');
    await expect(page.getByRole('navigation', { name: 'Personal workspace' })).toContainText('Transactions');
    await page.getByRole('button', { name: '+ YouTube', exact: true }).click();
    await expect(page.getByRole('button', { name: '✓ YouTube', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: 'Transactions', exact: true }).click();
    await expect(page).toHaveURL(/#transactionsTitle$/);
    expect(errors).toEqual([]);
  });
}

test('failed transaction loading never presents a zero report as real data', async ({ page }) => {
  await mockAccount(page, true);
  await page.goto('/index.html');
  await expect(page.locator('.creator-net')).toHaveText('Unavailable');
  await expect(page.locator('.creator-export')).toBeDisabled();
  await expect(page.locator('.creator-data-warning')).toContainText('not zero balances');
});

test('public landing stays visible when session restoration fails', async ({ page }) => {
  await page.route('https://api.keeperbma.com/**', route => route.abort());
  await page.goto('/index.html');
  await expect(page.locator('#landingTitle')).toHaveText('See what your side hustle actually earns');
  await expect(page.getByRole('link', { name: 'Try the demo — no signup' })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Features', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('settings can disconnect a bank without displaying credentials', async ({ page }) => {
  await mockAccount(page);
  let connected = true;
  await page.route('https://api.keeperbma.com/bank/connections**', async route => {
    if (route.request().method() === 'DELETE') {
      connected = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: connected ? [{ connection_id: 7, institution_name: 'Sample Bank' }] : [] });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/settings.html');
  await expect(page.locator('#connectedBanksSettings')).toContainText('Sample Bank');
  await page.getByRole('button', { name: 'Disconnect bank', exact: true }).click();
  await expect(page.locator('#connectedBanksSettings')).toContainText('Bank disconnected');
  await expect(page.getByRole('button', { name: 'Disconnect bank', exact: true })).toHaveCount(0);
});

test('settings offers support when the live server cannot disconnect banks yet', async ({ page }) => {
  await mockAccount(page);
  await page.route('https://api.keeperbma.com/ready', route => route.fulfill({ status: 404, json: { detail: 'Not Found' } }));
  await page.route('https://api.keeperbma.com/bank/connections**', route => route.fulfill({ json: [{ connection_id: 7, institution_name: 'Sample Bank' }] }));
  await page.goto('/settings.html');
  await expect(page.getByRole('button', { name: 'Disconnect bank', exact: true })).toBeDisabled();
  await expect(page.locator('#connectedBanksSettings')).toContainText('contact support@keeperbma.com');
});

test('free calculator explains costs and updates without API calls', async ({ page }) => {
  const apiCalls = [];
  page.on('request', request => { if (request.url().includes('api.keeperbma.com')) apiCalls.push(request.url()); });
  await page.goto('/profit-calculator.html');
  await page.getByRole('button', { name: 'Try sample numbers' }).click();
  await expect(page.locator('#calculatorNet')).toHaveText('$300.00');
  await expect(page.locator('#calculatorRequired')).toHaveText('$270.00');
  await page.getByLabel('Income before costs').fill('100');
  await expect(page.locator('#calculatorNet')).toHaveText('$30.00');
  await page.getByLabel('Income before costs').fill('-5');
  await expect(page.locator('#calculatorError')).toContainText('non-negative');
  await expect(page.locator('#calculatorNet')).toHaveText('—');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  expect(apiCalls).toEqual([]);
});
