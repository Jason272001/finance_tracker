const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
});
const open = async page => {
  await page.goto('/demo.html');
  await expect(page.locator('.creator-net')).toHaveText('$300.00');
};
const settings = async page => {
  await page.getByRole('button', { name: 'Settings & billing', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Demo settings and billing"]');
  await expect(frame.locator('#profileUsername')).toHaveValue('Sample creator');
  return frame;
};

test('demo never reads or changes real storage and each tab starts fresh', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.realStorageReads = [];
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { window.realStorageReads.push(key); return original.call(this, key); };
  });
  const external = [];
  page.on('request', request => { if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) external.push(request.url()); });
  await page.goto('/profit-calculator.html');
  await page.evaluate(() => { localStorage.setItem('keeperbma_token', 'real-session-sentinel'); localStorage.setItem('keeperbma_theme', 'dark'); sessionStorage.setItem('real-session', 'keep'); });
  await open(page);
  await page.evaluate(() => window.KeeperDemo.request('/accounts', { method: 'POST', body: JSON.stringify({ account_name: 'Temporary account', account_type: 'asset', balance: 12 }) }));
  const second = await context.newPage();
  await second.goto('/demo.html');
  await expect(second.locator('.creator-net')).toHaveText('$300.00');
  expect(await second.evaluate(async () => (await KeeperDemo.request('/accounts')).some(a => a.account_name === 'Temporary account'))).toBe(false);
  await second.close();
  await page.reload();
  expect(await page.evaluate(async () => (await KeeperDemo.request('/accounts')).length)).toBe(3);
  expect(await page.evaluate(() => window.realStorageReads)).toEqual([]);
  expect(await page.evaluate(() => [localStorage.getItem('keeperbma_token'), localStorage.getItem('keeperbma_theme'), sessionStorage.getItem('real-session')])).toEqual(['real-session-sentinel', 'dark', 'keep']);
  expect(external).toEqual([]);
  expect(await page.evaluate(async () => { try { await KeeperDemo.request('/unknown-action'); return false; } catch (error) { return error.message.includes('No real request'); } })).toBe(true);
});

test('account editing, deletion, transactions, transfers and filters work', async ({ page }) => {
  await open(page);
  await page.locator('#accName').fill('Demo wallet'); await page.locator('#accBal').fill('50'); await page.locator('#btnAddAccount').click();
  const wallet = page.locator('#accountsRows tr').filter({ hasText: 'Demo wallet' });
  await expect(wallet).toContainText('$50.00');
  await wallet.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#accBal').fill('75'); await page.locator('#btnAddAccount').click(); await expect(wallet).toContainText('$75.00');
  await wallet.getByRole('button', { name: 'Delete', exact: true }).click(); await expect(wallet).toHaveCount(0);
  await page.locator('#transferFromAccount').selectOption('1'); await page.locator('#transferToAccount').selectOption('2'); await page.locator('#transferAmount').fill('25'); await page.locator('#btnTransferMoney').click();
  await expect(page.locator('#accountsRows tr').filter({ hasText: 'Sample checking' })).toContainText('$775.00');
  await expect(page.locator('.creator-net')).toHaveText('$300.00');
  await page.locator('#txType').selectOption('expense'); await page.locator('#txAccount').selectOption('1'); await page.locator('#txAmount').fill('15'); await page.locator('#txNote').fill('Demo test expense'); await page.locator('#btnAddTx').click();
  await expect(page.locator('.creator-net')).toHaveText('$285.00');
  const expense = page.locator('#txRows tr').filter({ hasText: 'Demo test expense' });
  await expense.getByRole('button', { name: 'Edit', exact: true }).click(); await page.locator('#txAmount').fill('20'); await page.locator('#btnAddTx').click();
  await expect(page.locator('.creator-net')).toHaveText('$280.00');
  await page.locator('#txFilterKeyword').fill('Demo test expense'); await expect(page.locator('#txRows tr')).toHaveCount(1);
  await expense.getByRole('button', { name: 'Delete', exact: true }).click(); await expect(page.locator('.creator-net')).toHaveText('$300.00');
  await page.locator('#btnClearTxFilters').click(); await expect(page.locator('#txRows tr')).toHaveCount(6);
});

test('business profile and employee permissions can be edited without publishing', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Business & employees', exact: true }).click();
  await page.getByRole('navigation',{name:'Business categories'}).getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.locator('#businessName')).toHaveValue('Sample Creator Studio');
  await page.locator('#businessName').fill('Demo Studio Updated'); await page.locator('#btnSaveBusiness').click();
  await expect(page.locator('#businessSelect')).toContainText('Demo Studio Updated');
  await page.getByRole('navigation',{name:'Business settings tools'}).getByRole('button',{name:'Employee access',exact:true}).click();
  await page.locator('#businessEmployeeName').fill('Demo editor'); await page.locator('#businessEmployeeEmail').fill('editor@example.test'); await page.locator('#permReports').check(); await page.locator('#btnSaveEmployee').click();
  await expect(page.locator('#businessEmployeeSelect')).toContainText('Demo editor');
  const id = await page.locator('#businessEmployeeSelect option').filter({ hasText: 'Demo editor' }).getAttribute('value');
  await page.locator('#businessEmployeeSelect').selectOption(id); await expect(page.locator('#permReports')).toBeChecked();
  page.once('dialog', d => d.accept()); await page.locator('#btnDeleteEmployee').click(); await expect(page.locator('#businessEmployeeSelect')).not.toContainText('Demo editor');
  await expect(page.locator('#businessModules')).toContainText('Planned — not available yet');
});

test('fictional bank connection, repeat sync and disconnection are simulated', async ({ page }) => {
  await open(page); await page.locator('#btnConnectBank').click();
  await expect(page.getByRole('dialog')).toContainText('No Plaid or bank request');
  await page.getByRole('button', { name: 'Connect Sample Bank', exact: true }).click();
  await expect(page.locator('#bankConnectionsList')).toContainText('Sample Bank — simulated');
  await page.locator('#btnSyncBank').click(); await expect(page.locator('.creator-net')).toHaveText('$320.00');
  await page.locator('#btnSyncBank').click(); await expect(page.locator('#bankSyncStatus')).toContainText('Imported 0');
  const frame = await settings(page);
  page.once('dialog', d => d.accept()); await frame.getByRole('button', { name: 'Disconnect bank', exact: true }).click();
  await expect(frame.locator('.connected-banks-status')).toContainText('disconnected');
  await page.getByRole('button', { name: 'Back to demo workspace', exact: true }).click();
  await expect(page.locator('#bankConnectionsList')).not.toContainText('Sample Bank');
  await expect(page.locator('#txRows')).toContainText('Simulated bank deposit');
});

test('settings, sample plans, cancellation and passwords cannot change real accounts', async ({ page }) => {
  await open(page); const frame = await settings(page);
  await frame.locator('#profileUsername').fill('Demo user renamed'); await frame.locator('#btnSaveProfile').click(); await expect(frame.locator('#profileStatus')).toContainText('success');
  await frame.locator('#planBtnBasic').click(); await expect(frame.locator('#planCodeValue')).toHaveText('Basic');
  await frame.locator('#btnOpenBillingPortal').click(); await expect(frame.getByRole('dialog')).toContainText('No real payment'); await frame.getByRole('button', { name: 'Close', exact: true }).click();
  page.once('dialog', d => d.accept()); await frame.locator('#btnCancelSubscription').click(); await expect(frame.locator('#planStatusMsg')).toContainText('Demo cancellation simulated');
  await frame.locator('#currentPassword').fill('SampleOld123'); await frame.locator('#newPassword').fill('SampleNew123'); await frame.locator('#confirmNewPassword').fill('SampleNew123'); await frame.locator('#btnChangePassword').click(); await expect(frame.locator('#passwordStatus')).toContainText('success');
  await page.getByRole('button', { name: 'Back to demo workspace', exact: true }).click(); await expect(page.locator('#userBadge')).toContainText('Demo user renamed');
  await page.reload(); await page.getByRole('button', { name: 'Settings & billing', exact: true }).click(); await expect(page.frameLocator('iframe').locator('#profileUsername')).toHaveValue('Sample creator');
});

test('charts, PDF and support work locally and alternate demo entry works', async ({ page }) => {
  await page.goto('/frontends/web/demo.html'); await expect(page.locator('.creator-net')).toHaveText('$300.00');
  expect(await page.evaluate(() => typeof Chart)).toBe('function');
  const download = page.waitForEvent('download'); await page.locator('#btnDownloadPdf').click(); expect((await download).suggestedFilename()).toBe('keeperbma-summary.pdf');
  await page.getByRole('button', { name: 'Support', exact: true }).click(); await page.locator('#supportInput').fill('How do I add income?'); await page.locator('#btnSendSupport').click(); await expect(page.locator('#supportMessages')).toContainText('Personal finance and reports');
  await page.locator('#btnCloseSupport').click();
  for (const width of [320, 1280]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  await page.getByRole('button', { name: 'Settings & billing', exact: true }).click(); await expect(page.frameLocator('iframe').locator('#profileUsername')).toHaveValue('Sample creator');
});
