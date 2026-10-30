const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const AxeBuilder=require('@axe-core/playwright').default;
let fixture;const headers={Authorization:'Bearer browser-test-owner'};
test.beforeEach(async({request})=>{fixture=await(await request.post('/__test__/reset')).json();});
async function owner(browser){const context=await browser.newContext({baseURL:'http://127.0.0.1:8767'});await context.addInitScript(()=>localStorage.setItem('keeperbma_token','browser-test-owner'));const page=await context.newPage();await page.goto('/operations-admin.html?business_id=1#schedule');await expect(page.locator('#opsScheduleForm')).toBeVisible();return {context,page};}
test('weekly store schedule shows staff IDs, saves shifts, and downloads a readable PDF',async({browser})=>{
 const {context,page}=await owner(browser);try{
  for(const [name,code] of [['Jason','10002'],['Kay','10003']]){const f=page.locator('#opsScheduleForm');await f.locator('[name="staff"]').selectOption({label:name+' - ID '+code});await f.locator('[name="start"]').fill('2026-11-02T09:00');await f.locator('[name="end"]').fill('2026-11-02T14:00');await f.getByRole('button',{name:'Assign shift',exact:true}).click();await expect(page.locator('.ops-status')).toContainText('Shift assigned');await expect(page.locator('#opsWeekPDF')).toBeEnabled();}
  await expect(page.locator('#opsScheduleWeek')).toHaveValue('2026-11-02');await expect(page.locator('#opsWeeklyTable')).toContainText('ID 10002');await expect(page.locator('#opsWeeklyTable')).toContainText('ID 10003');await expect(page.locator('#opsWeeklyTable')).toContainText('9:00 AM - 2:00 PM');
  const downloaded=page.waitForEvent('download');await page.locator('#opsWeekPDF').click();const download=await downloaded;expect(download.suggestedFilename()).toBe('weekly-schedule-main-branch-2026-11-02.pdf');fs.mkdirSync('output/pdf',{recursive:true});await download.saveAs(path.resolve('output/pdf/weekly-store-schedule-'+test.info().project.name+'.pdf'));expect(fs.readFileSync(await download.path()).subarray(0,5).toString()).toBe('%PDF-');
  await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);await page.screenshot({path:'output/store-weekly-schedule-'+test.info().project.name+'.png',fullPage:true});
 }finally{await context.close();}
});
test('inactive staff remain identifiable and the calendar can request historical weeks',async({browser,request})=>{
 const snapshot=await(await request.get('/businesses/1/operations/admin?user_id=10',{headers})).json(),jason=snapshot.staff.find(p=>p.code==='10002');await request.post('/businesses/1/operations/admin?user_id=10',{headers,data:{action:'staff',values:{id:jason.id,name:jason.name,branch:jason.branch,role:'cashier',active:false,hourly_cents:0}}});
 const {context,page}=await owner(browser);try{
  const option=page.locator('#opsScheduleForm [name="staff"] option').filter({hasText:'Jason - ID 10002 - Inactive'});await expect(option).toHaveJSProperty('disabled',true);await page.locator('#opsScheduleWeek').fill('2025-01-06');await page.locator('#opsScheduleWeek').dispatchEvent('change');await expect(page.locator('#opsWeekPDF')).toBeEnabled();await expect(page.locator('#opsWeekStatus')).toContainText('Jan 6');
 }finally{await context.close();}
});
test('sales checkout opens only cashier choices and still requires its device authorization',async({browser})=>{
 const {context,page}=await owner(browser);try{
  await page.getByRole('button',{name:'Sales checkout',exact:true}).click();const link=page.locator('[data-ops-panel="checkout"]').getByRole('link',{name:'Open sales checkout'});await expect(link).toHaveAttribute('href',/mode=cashier/);await page.goto(await link.getAttribute('href'));await expect(page.locator('h1')).toHaveText('Sales checkout - select cashier');await expect(page.locator('#selectDevice option')).toHaveCount(3);await expect(page.locator('#selectDevice')).toHaveValue('');
 }finally{await context.close();}
});
