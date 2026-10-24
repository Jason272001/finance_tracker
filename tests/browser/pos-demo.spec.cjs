const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => {
  await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await page.goto('/demo.html');
  await page.getByRole('button', { name: 'POS & inventory', exact: true }).click();
  await expect(page.locator('#demoPos')).toBeVisible();
  await page.locator('#registerPin').fill('0000');await page.locator('#registerSignIn').getByRole('button',{name:'Sign in to demo register',exact:true}).click();
});
const tab = (page, name) => page.getByRole('navigation', { name: 'POS sections' }).getByRole('button', { name, exact: true }).click();
test('products, brands, categories, photo and CSV uploads are temporary and local', async ({ page }) => {
  const requests = []; page.on('request', r => { if (r.url().includes('api.keeperbma')) requests.push(r.url()); });
  await tab(page, 'Brands'); const brand = page.locator('[data-pos-entity="brands"]'); await brand.locator('[name="name"]').fill('Demo Brand'); await brand.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.locator('#posbrandsTable')).toContainText('Demo Brand');
  await tab(page, 'Categories'); const category = page.locator('[data-pos-entity="categories"]'); await category.locator('[name="name"]').fill('Demo Category'); await category.getByRole('button', { name: 'Save category', exact: true }).click();
  await tab(page, 'Products');
  await page.locator('#posProductName').fill('Sample tote'); await page.locator('#posProductSku').fill('TOTE001');
  await page.locator('#posProductBrand').selectOption({ label: 'Demo Brand' }); await page.locator('#posProductCategory').selectOption({ label: 'Demo Category' });
  await page.locator('#posProductCost').fill('4.50'); await page.locator('#posProductPrice').fill('9.00'); await page.locator('#posProductStock').fill('10'); await page.locator('#posProductDescription').fill('Fictional cotton bag');
  await page.locator('#posProductPhoto').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=', 'base64') });
  await page.locator('#posSaveProduct').click();
  const row = page.locator('#posProductTable tr').filter({ hasText: 'TOTE001' }); await expect(row).toContainText('$9.00'); await expect(row.locator('img')).toHaveCount(1);
  await row.getByRole('button', { name: 'Edit', exact: true }).click(); await page.locator('#posProductPrice').fill('10'); await page.locator('#posSaveProduct').click(); await expect(row).toContainText('$10.00');
  await page.getByText('Upload products from CSV', { exact: true }).click();
  await page.locator('#posCsvFile').setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from('sku,name,price,cost,stock,brand,category,description\nCSV1,Imported sample,12,5,4,Demo Brand,Demo Category,Sample CSV') }); await page.locator('#posImportCsv').click(); await expect(page.locator('#posProductTable')).toContainText('Imported sample');
  await page.reload(); await page.getByRole('button', { name: 'POS & inventory', exact: true }).click(); await tab(page, 'Products'); await expect(page.locator('#posProductTable')).not.toContainText('TOTE001'); await expect(page.locator('#posProductTable')).not.toContainText('CSV1'); expect(requests).toEqual([]);
});
test('supplier purchase, checkout, receipts and void keep inventory consistent', async ({ page }) => {
  await tab(page, 'Suppliers'); const form = page.locator('[data-pos-entity="suppliers"]'); await form.locator('[name="name"]').fill('Demo supplier'); await form.locator('[name="email"]').fill('supplier@example.test'); await form.getByRole('button', { name: 'Save supplier', exact: true }).click();
  await tab(page, 'Purchases'); await page.locator('#posPurchaseSupplier').selectOption({ label: 'Demo supplier' }); await page.locator('#posPurchaseProduct').selectOption('1'); await page.locator('#posPurchaseQty').fill('5'); await page.locator('#posPurchaseCost').fill('7'); await page.getByRole('button', { name: 'Add to purchase', exact: true }).click(); await page.locator('#posReceivePurchase').click(); await expect(page.locator('#posPurchaseTable')).toContainText('Demo supplier');
  await tab(page, 'Products'); await expect(page.locator('#posProductTable tr').filter({ hasText: 'COF001' })).toContainText('25');
  await tab(page, 'Checkout'); await page.locator('#posSaleProduct').selectOption('1'); await page.locator('#posSaleQty').fill('2'); await page.getByRole('button', { name: 'Add to sale', exact: true }).click(); await page.locator('#posDiscount').fill('5'); await page.locator('#posTax').fill('10'); await page.locator('#posPaid').fill('30'); await page.locator('#posCompleteSale').click();
  await expect(page.locator('#hubMetrics')).toContainText('$50.00'); await expect(page.locator('#hubTax')).toContainText('$2.00'); await expect(page.getByRole('dialog')).toContainText('$22.00'); await expect(page.getByRole('dialog')).toContainText('Change $8.00');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download sample record', exact: true }).click(); expect((await download).suggestedFilename()).toContain('-DEMO.csv'); await page.getByRole('button', { name: 'Close receipt', exact: true }).click();
  await tab(page, 'Products'); await expect(page.locator('#posProductTable tr').filter({ hasText: 'COF001' })).toContainText('23');
  await tab(page, 'Sales'); page.once('dialog', d => d.accept()); await page.locator('#posSalesTable tr').nth(1).getByRole('button', { name: 'Void sale', exact: true }).click(); await expect(page.locator('#posSalesTable tr').nth(1)).toContainText('void');
  await expect(page.locator('#hubMetrics')).toContainText('$30.00'); await tab(page, 'Products'); await expect(page.locator('#posProductTable tr').filter({ hasText: 'COF001' })).toContainText('25');
  for (const width of [320, 1280]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
});

test('direct POS link opens business mode after session restoration', async ({ page }) => {
  await page.goto('/demo.html#demoPos');
  await expect(page.locator('#demoPos')).toBeVisible();
  await expect(page.locator('#posSaleLine')).toBeVisible();
});
