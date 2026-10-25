// Capture fictional screens only. No real credentials, customer data or payments.
const {chromium}=require('@playwright/test');const fs=require('node:fs');const path=require('node:path');
const out=path.resolve(__dirname,'../build/demo-video');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await page.goto((process.env.DEMO_VIDEO_URL||'https://www.keeperbma.com/demo.html')+'#demoBusinessHub');
 await page.evaluate(()=>{document.querySelector('#supportLauncher')?.remove();document.querySelector('.demo-menu-return')?.remove();});
 async function shot(name,target){const el=page.locator(target);await el.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'.png')});}
 async function category(key){await page.locator('[data-business-category="'+key+'"]').click();}
 async function hub(key){await page.locator('nav[aria-label="Business hub sections"] [data-hub-tab="'+key+'"]').click();}
 async function pos(key){await page.locator('nav[aria-label="POS sections"] [data-pos-tab="'+key+'"]').click();}
 await shot('overview','.business-demo-header');
 await category('pos');await pos('products');await shot('products','#posProductTable');
 await pos('checkout');await page.locator('#registerAccount').selectOption('101');await page.locator('#registerPin').fill('1111');await page.locator('#registerSignIn').getByRole('button',{name:'Sign in to demo register',exact:true}).click();
 await page.locator('#posSavedCustomer').selectOption('1');await page.locator('#posSaleQty').fill('2');await page.getByRole('button',{name:'Add to sale',exact:true}).click();await page.locator('#posPayment').selectOption('card');await shot('checkout','#posCheckout');
 await page.locator('#posCompleteSale').click();await page.getByRole('dialog').screenshot({path:path.join(out,'receipt.png')});await page.getByRole('button',{name:'Close receipt',exact:true}).click();
 await category('team');await hub('schedule');await shot('schedule','#scheduleBoard');await hub('time');await shot('time','#timeEmployee');
 await category('growth');await hub('loyalty');await shot('loyalty','#memberOverview');await hub('marketing');await shot('marketing','[data-hub-panel="marketing"]');
 await category('finance');await hub('accounting');await shot('accounting','#accountingProfit');
 await page.getByRole('button',{name:'Personal',exact:true}).click();await page.getByRole('button',{name:'Monthly report',exact:true}).click();await shot('personal','#creatorReport');
 await browser.close();console.log('Captured 10 fictional demo screens in '+out);
})().catch(error=>{console.error(error);process.exitCode=1;});
