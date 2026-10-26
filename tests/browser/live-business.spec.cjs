const {test,expect}=require('@playwright/test');
async function setup(page,{businessError=false,staffError=false}={}){
 const requests=[],profile={user_id:1,name:'Business owner',email:'owner@example.test',plan_code:'premium_plus',subscription_status:'active',access_active:true,is_lifetime:false,feature_flags:{business_profile:true,employee_management:true,bank_sync:false}};
 const businesses=[{business_id:21,business_name:'21CT',business_type:'education',industry:'Education',is_owner:true,email:'owner@example.test',page_enabled:false,website_enabled:false},{business_id:22,business_name:'Second store',business_type:'retail',is_owner:true}];
 const staff={21:[{employee_id:101,employee_name:'Jason',role_code:'staff',status:'active',permissions:{}}],22:[{employee_id:201,employee_name:'Kay',role_code:'staff',status:'active',permissions:{}}]};
 await page.addInitScript(()=>localStorage.setItem('keeperbma_app_mode','business'));
 await page.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),r=>r.abort());
 await page.route('https://api.keeperbma.com/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method();requests.push({path,method,body:request.postDataJSON()});let body={ok:true};
  if(['/auth/session','/profile','/billing/subscription'].includes(path))body=profile;
  if(path==='/businesses'){
   if(businessError)return route.fulfill({status:503,json:{detail:'Try again later'}});
   if(method==='POST'){const b={...request.postDataJSON(),business_id:23,is_owner:true};businesses.push(b);staff[23]=[];body={business:b};}else body={items:businesses};
  }
  const match=path.match(/^\/businesses\/(\d+)\/employees(?:\/(\d+))?$/);
  if(match){const id=Number(match[1]);if(staffError&&method==='GET')return route.fulfill({status:503,json:{detail:'Staff temporarily unavailable'}});if(method==='POST'){staff[id].push({...request.postDataJSON(),employee_id:300});body={ok:true};}else body={items:staff[id]||[]};}
  if(/^\/businesses\/\d+$/.test(path)&&method==='PUT'){const id=Number(path.split('/').at(-1));Object.assign(businesses.find(b=>b.business_id===id),request.postDataJSON());body={ok:true};}
  if(['/accounts','/categories','/transactions','/daily_balances'].includes(path))body=[];
  await route.fulfill({json:body});
 });return {requests,businesses,staff};
}
const nav=page=>page.getByRole('navigation',{name:'Business workspace',exact:true});
test('business loads without bank sync and staff records save through the selected business API',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const fixture=await setup(page);await page.goto('/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('Welcome to 21CT');await expect(page.locator('#businessStatus')).not.toContainText('No business workspace');await expect(page.locator('#businessName')).toBeHidden();expect(fixture.requests.some(r=>r.path.startsWith('/bank/'))).toBe(false);
 await nav(page).getByRole('button',{name:'Team',exact:true}).click();await expect(page.locator('#businessEmployeesList')).toContainText('Jason');await expect(page.locator('#liveStaffEditor')).toBeHidden();await page.locator('#btnNewEmployee').click();await page.getByLabel('Staff name',{exact:true}).fill('Taylor');await page.locator('#btnSaveEmployee').click();await expect(page.locator('#businessEmployeesList')).toContainText('Taylor');expect(fixture.requests.some(r=>r.path==='/businesses/21/employees'&&r.method==='POST'&&r.body.employee_name==='Taylor')).toBe(true);
 await page.locator('[data-live-business="22"]').click();await expect(page.locator('#businessEmployeesList')).toContainText('Kay');await expect(page.locator('#businessEmployeesList')).not.toContainText('Jason');await expect(page.locator('#liveStaffEditor')).toBeHidden();await page.reload();await expect(page.locator('#liveOverviewGreeting')).toHaveText('Welcome to 21CT');await nav(page).getByRole('button',{name:'Team',exact:true}).click();await expect(page.locator('#businessEmployeesList')).toContainText('Taylor');expect(errors).toEqual([]);
});
test('new business remains a blank form and is created rather than overwriting an existing business',async({page})=>{
 const fixture=await setup(page);await page.goto('/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('Welcome to 21CT');await page.locator('#btnNewBusiness').click();await expect(page.locator('#businessName')).toHaveValue('');await page.getByLabel('Business name',{exact:true}).fill('New cafe');await page.locator('#btnSaveBusiness').click();await expect(page.locator('#liveBusinessSubtitle')).toContainText('New cafe');const create=fixture.requests.find(r=>r.path==='/businesses'&&r.method==='POST');expect(create.body.business_name).toBe('New cafe');expect(create.body.page_enabled).toBe(false);expect(fixture.requests.filter(r=>r.method==='PUT')).toEqual([]);
});
test('account finances open existing tools; POS remains explicitly a preview with direct restaurant demo entry',async({page})=>{
 await setup(page);await page.goto('/index.html');await nav(page).getByRole('button',{name:'Finance',exact:true}).click();await expect(page.locator('[data-live-panel="finance"]')).toContainText('not separated by business');await page.getByRole('button',{name:'Accounts & balances →',exact:true}).click();await expect(page.locator('#personalWorkspace')).toBeVisible();await expect(page.locator('#businessWorkspace')).toBeHidden();await page.locator('#btnModeBusiness').click();await nav(page).getByRole('button',{name:'POS',exact:true}).click();await expect(page.locator('[data-live-panel="pos"]')).toContainText('not live checkout');await page.getByRole('link',{name:'Explore restaurant menu demo ↗',exact:true}).click();await expect(page.locator('#restaurantMenu')).toBeVisible();await expect(page.locator('[data-industry="restaurant"]')).toHaveAttribute('aria-pressed','true');
});
test('business loading failure offers retry without claiming an empty account',async({page})=>{
 await setup(page,{businessError:true});await page.goto('/index.html');await expect(page.locator('#liveLoadStatus')).toContainText('Businesses could not be loaded');await expect(page.locator('#liveRetryBusiness')).toBeVisible();await expect(page.locator('#businessStatus')).not.toContainText('No business workspace yet');await expect(page.locator('#liveBusinessMetrics')).toContainText('—');
});
test('staff loading failure is visible and does not show a false empty roster',async({page})=>{
 await setup(page,{staffError:true});await page.goto('/index.html');await nav(page).getByRole('button',{name:'Team',exact:true}).click();await expect(page.locator('#liveStaffLoadStatus')).toContainText('Staff could not be loaded');await expect(page.locator('#businessEmployeesList')).toBeHidden();await expect(page.locator('#liveRetryStaff')).toBeVisible();
});
test('signed-in business workspace is responsive in both themes and shows only one task',async({page})=>{
 await setup(page);await page.goto('/frontends/web/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('Welcome to 21CT');
 for(const theme of ['light','dark']){await page.locator('[data-live-theme="'+theme+'"]').click();for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.locator('[data-live-panel]:visible')).toHaveCount(1);}await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/live-business-'+theme+'.png',fullPage:true});}
 await nav(page).getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Business name',{exact:true})).toHaveValue('21CT');await expect(page.locator('#businessModules')).toBeHidden();await page.getByRole('button',{name:'Feature availability',exact:true}).click();await expect(page.locator('#liveAvailability')).toContainText('including lifetime accounts');
});
