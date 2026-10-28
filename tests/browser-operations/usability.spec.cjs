const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
let fixture;
test.beforeEach(async({request})=>{fixture=await(await request.post('/__test__/reset')).json();});
test.describe.configure({timeout:90000});
async function audit(page){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))).toEqual([]);}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
async function owner(browser){const context=await browser.newContext({baseURL:"http://127.0.0.1:8767"});await context.addInitScript(()=>{if(!localStorage.getItem('keeperbma_logout_at'))localStorage.setItem('keeperbma_token','browser-test-owner');});return {context,page:await context.newPage()};}

test('business navigation is grouped, works on narrow screens, and supports both accessible themes',async({browser})=>{
 const {context,page}=await owner(browser);try{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/operations-admin.html?business_id=1');await expect(page.getByRole('link',{name:'Select device',exact:true})).toHaveAttribute('href',/select-device\.html\?business_id=1/);await expect(page.locator('.ops-nav-group')).toHaveCount(4);await expect(page.locator('[data-ops-panel="report"]')).toBeVisible();await audit(page);await noOverflow(page);await page.screenshot({path:'output/business-ui-light-'+test.info().project.name+'.png',fullPage:true});
  await page.getByRole('button',{name:'Toggle dark mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await audit(page);await page.screenshot({path:'output/business-ui-dark-'+test.info().project.name+'.png',fullPage:true});
  for(const width of [768,390,320]){await page.setViewportSize({width,height:900});await noOverflow(page);}
  const nav=page.locator('.ops-tabs');for(const button of await nav.locator('[data-ops-tab]').all()){const key=await button.getAttribute('data-ops-tab');await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-ops-panel="'+key+'"]').first()).toBeVisible();await noOverflow(page);await audit(page);}
  await nav.getByRole('button',{name:'Devices',exact:true}).click();await audit(page);await page.screenshot({path:'output/business-ui-mobile-'+test.info().project.name+'.png',fullPage:true});
 }finally{await context.close();}
});

test('device setup explains steps, prevents empty choices and returns keyboard focus when cancelled',async({browser})=>{
 const {context,page}=await owner(browser);try{
  await page.setViewportSize({width:390,height:844});await page.goto('/select-device.html?business_id=1');await expect(page.locator('#selectDevice')).toBeVisible();await expect(page.locator('#selectContinue')).toBeDisabled();await noOverflow(page);await audit(page);
  await page.locator('#selectDevice').selectOption({label:'Office \u00b7 Main branch \u00b7 Office'});await expect(page.locator('#selectContinue')).toBeEnabled();await page.locator('#selectDevice').focus();await page.keyboard.press('Tab');await expect(page.locator('#selectContinue')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#selectOwnerSignout')).toBeFocused();await expect(page.locator('.select-device-steps [aria-current="step"]')).toHaveText('2. Connect if needed');await page.locator('#selectOwnerCancel').click();await expect(page.locator('#selectDevice')).toBeFocused();await expect(page.locator('#selectContinue')).toBeDisabled();
  await page.getByRole('button',{name:'Toggle dark mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');const surface=await page.evaluate(()=>({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,height:document.body.getBoundingClientRect().height,viewport:innerHeight}));expect(surface.html).toBe(surface.body);expect(surface.height).toBeGreaterThanOrEqual(surface.viewport-1);await audit(page);await page.screenshot({path:'output/device-setup-mobile-'+test.info().project.name+'.png',fullPage:true});
 }finally{await context.close();}
});

test('cashier customization and time-clock screens have accessible controls in dark mode',async({browser})=>{
 const context=await browser.newContext({baseURL:"http://127.0.0.1:8767"}),page=await context.newPage();try{
  await page.goto('/business-device.html?selected=1');await page.locator('#stationPairForm [name="code"]').fill(fixture.codes['Cashier 1']);await page.locator('#stationPairForm button').click();await page.locator('#stationLoginForm [name="code"]').fill('10002');await page.locator('#stationLoginForm [name="credential"]').fill('654321');await page.locator('#stationLoginForm button').click();await expect(page.locator('#stationCheckout')).toBeVisible();await page.getByRole('button',{name:'Toggle dark mode'}).click();await audit(page);
  await page.getByRole('button',{name:/Cheeseburger/}).click();await expect(page.getByRole('dialog',{name:'Customize your item'})).toBeVisible();await audit(page);await page.locator('#stationExtrasCancel').click();await page.setViewportSize({width:320,height:900});await noOverflow(page);await page.locator('#stationLogout').click();await expect(page.locator('#stationLogin')).toBeVisible();await audit(page);await page.goto('/select-device.html');await page.locator('#selectDevice').selectOption({label:'Time clock \u00b7 Main branch \u00b7 Time clock'});await page.locator('#selectContinue').click();await page.locator('#selectPairForm [name="code"]').fill(fixture.codes['Time clock']);await page.locator('#selectPairForm').getByRole('button',{name:'Connect selected device',exact:true}).click();await expect(page.locator('#stationClock')).toBeVisible();await noOverflow(page);await audit(page);await page.screenshot({path:'output/time-clock-mobile-'+test.info().project.name+'.png',fullPage:true});
 }finally{await context.close();}
});
