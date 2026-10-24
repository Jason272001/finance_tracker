const {test,expect}=require('@playwright/test');
test('promotion checkout flows into accounting and resets on refresh',async({page})=>{
 await page.goto('/demo.html#demoPos');await page.locator('#registerPin').fill('0000');await page.locator('#registerSignIn').getByRole('button',{name:'Sign in to demo register',exact:true}).click();
 const tab=name=>page.getByRole('navigation',{name:'POS sections'}).getByRole('button',{name,exact:true}).click();
 await tab('Promotions');const form=page.locator('#posPromotionForm');
 await form.locator('[name="name"]').fill('Five dollar offer');await form.locator('[name="code"]').fill('FIVE');await form.locator('[name="type"]').selectOption('fixed');await form.locator('[name="value"]').fill('5');await form.getByRole('button',{name:'Create promotion'}).click();
 await expect(page.locator('#posPromotionTable')).toContainText('FIVE');
 await tab('Checkout');await page.getByRole('button',{name:'Add to sale',exact:true}).click();await page.locator('#posPromotion').selectOption({label:'FIVE · Five dollar offer'});await page.locator('#posTax').fill('10');await page.locator('#posPayment').selectOption('card');await expect(page.locator('#posSaleTotal')).toContainText('$8.25');await page.locator('#posCompleteSale').click();
 await expect(page.getByRole('dialog')).toContainText('FIVE');await page.getByRole('button',{name:'Close receipt',exact:true}).click();
 await page.locator('[data-business-category="finance"]').click();await page.getByRole('navigation',{name:'Business hub sections'}).getByRole('button',{name:'Accounting',exact:true}).click();
 await expect(page.locator('#accountingProfit')).toContainText('$37.50');await expect(page.locator('#accountingProfit')).toContainText('$0.75');await expect(page.locator('#accountingLedger')).toContainText('FIVE');
 const download=page.waitForEvent('download');await page.locator('#accountingExport').click();expect((await download).suggestedFilename()).toBe('sample-accounting-DEMO.csv');
 await page.reload();await page.getByRole('button',{name:'POS & inventory',exact:true}).click();await tab('Promotions');await expect(page.locator('#posPromotionTable')).not.toContainText('FIVE');
});
