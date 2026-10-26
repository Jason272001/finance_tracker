const {test,expect}=require('@playwright/test');
async function setup(page,{businessError=false,staffError=false,empty=false}={}){
 const requests=[],profile={user_id:1,name:'Business owner',email:'owner@example.test',plan_code:'premium_plus',subscription_status:'active',access_active:true,is_lifetime:false,feature_flags:{business_profile:true,employee_management:true,bank_sync:false}};
 const businesses=[{business_id:21,business_name:'21CT',business_type:'education',industry:'Education',is_owner:true,email:'owner@example.test',page_enabled:false,website_enabled:false},{business_id:22,business_name:'Second store',business_type:'retail',is_owner:true}];
 if(empty)businesses.splice(0);
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
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const fixture=await setup(page);await page.goto('/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('21CT');await expect(page.locator('#businessStatus')).not.toContainText('No business workspace');await expect(page.locator('#businessName')).toBeHidden();expect(fixture.requests.some(r=>r.path.startsWith('/bank/'))).toBe(false);
 await nav(page).getByRole('button',{name:'Staff',exact:true}).click();await expect(page.locator('#businessEmployeesList')).toContainText('Jason');await expect(page.locator('#liveStaffEditor')).toBeHidden();await page.locator('#btnNewEmployee').click();await page.getByLabel('Staff name',{exact:true}).fill('Taylor');await page.locator('#btnSaveEmployee').click();await expect(page.locator('#businessEmployeesList')).toContainText('Taylor');expect(fixture.requests.some(r=>r.path==='/businesses/21/employees'&&r.method==='POST'&&r.body.employee_name==='Taylor')).toBe(true);
 await page.locator('[data-live-business="22"]').click();await expect(page.locator('#businessEmployeesList')).toContainText('Kay');await expect(page.locator('#businessEmployeesList')).not.toContainText('Jason');await expect(page.locator('#liveStaffEditor')).toBeHidden();await page.reload();await expect(page.locator('#liveOverviewGreeting')).toHaveText('21CT');await nav(page).getByRole('button',{name:'Staff',exact:true}).click();await expect(page.locator('#businessEmployeesList')).toContainText('Taylor');expect(errors).toEqual([]);
});
test('new business remains a blank form and is created rather than overwriting an existing business',async({page})=>{
 const fixture=await setup(page);await page.goto('/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('21CT');await page.locator('#btnNewBusiness').click();await expect(page.locator('#businessName')).toHaveValue('');await expect(page.locator('#liveOptionalBusiness')).not.toHaveAttribute('open','');await expect(page.locator('#businessPhone')).toBeHidden();await expect(page.locator('#businessPageSlug')).toBeHidden();await page.getByLabel('Business name',{exact:true}).fill('New cafe');await page.locator('#btnSaveBusiness').click();await expect(page.locator('#liveBusinessSubtitle')).toContainText('New cafe');const create=fixture.requests.find(r=>r.path==='/businesses'&&r.method==='POST');expect(create.body.business_name).toBe('New cafe');expect(create.body.page_enabled).toBe(false);expect(fixture.requests.filter(r=>r.method==='PUT')).toEqual([]);
});
test('signed-in workspace contains only available tools and account finances',async({page})=>{
 await setup(page);await page.goto('/index.html');await expect(nav(page).getByRole('button')).toHaveCount(4);
 for(const name of ['Home','Staff','Finance','Business profile']){await nav(page).getByRole('button',{name,exact:true}).click();await expect(page.locator('#businessWorkspace a[href*="demo"]')).toHaveCount(0);await expect(page.locator('[data-live-panel]:visible')).not.toContainText(/demo|preview/i);}
 await nav(page).getByRole('button',{name:'Finance',exact:true}).click();await expect(page.locator('[data-live-panel="finance"]')).toContainText('not separated by business');await page.getByRole('button',{name:'Accounts & balances →',exact:true}).click();await expect(page.locator('#personalWorkspace')).toBeVisible();await expect(page.locator('#businessWorkspace')).toBeHidden();
});
test('business loading failure offers retry without claiming an empty account',async({page})=>{
 await setup(page,{businessError:true});await page.goto('/index.html');await expect(page.locator('#liveLoadStatus')).toContainText('Businesses could not be loaded');await expect(page.locator('#liveRetryBusiness')).toBeVisible();await expect(page.locator('#businessStatus')).not.toContainText('No business workspace yet');await expect(page.locator('#liveBusinessMetrics')).toContainText('—');
});
test('staff loading failure is visible and does not show a false empty roster',async({page})=>{
 await setup(page,{staffError:true});await page.goto('/index.html');await nav(page).getByRole('button',{name:'Staff',exact:true}).click();await expect(page.locator('#liveStaffLoadStatus')).toContainText('Staff could not be loaded');await expect(page.locator('#businessEmployeesList')).toBeHidden();await expect(page.locator('#liveRetryStaff')).toBeVisible();
});
test('signed-in business workspace is responsive in both themes and shows only one task',async({page})=>{
 await setup(page);await page.goto('/frontends/web/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('21CT');
 for(const theme of ['light','dark']){await page.locator('[data-live-theme="'+theme+'"]').click();for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.locator('[data-live-panel]:visible')).toHaveCount(1);}await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/live-business-'+theme+'.png',fullPage:true});}
 await nav(page).getByRole('button',{name:'Business profile',exact:true}).click();await expect(page.getByLabel('Business name',{exact:true})).toHaveValue('21CT');await expect(page.locator('#businessModules')).toBeHidden();await expect(page.getByRole('button',{name:'Feature availability',exact:true})).toHaveCount(0);
});

test('business creation validates the name, supports Enter, and cancel does not save',async({page})=>{
 const fixture=await setup(page);await page.goto('/index.html');await expect(page.locator('#liveOverviewGreeting')).toHaveText('21CT');await page.locator('#btnNewBusiness').click();await page.locator('#btnSaveBusiness').click();expect(fixture.requests.filter(r=>r.method==='POST')).toEqual([]);await page.getByLabel('Business name',{exact:true}).fill('Unsaved cafe');await page.locator('#liveCancelBusiness').click();await expect(page.locator('[data-live-panel="overview"]')).toBeVisible();expect(fixture.requests.filter(r=>r.method==='POST')).toEqual([]);await page.locator('#btnNewBusiness').click();await page.getByLabel('Business name',{exact:true}).fill('Keyboard cafe');await page.getByLabel('Business name',{exact:true}).press('Enter');await expect(page.locator('#liveOverviewGreeting')).toHaveText('Keyboard cafe');await expect(page.locator('#liveLoadStatus')).toContainText('Business created');
});

test('empty account starts with one clear setup action and two basic fields',async({page})=>{
 const fixture=await setup(page,{empty:true});await page.goto('/index.html');await page.getByRole('button',{name:'Create my business',exact:true}).click();await expect(page.getByLabel('Business name',{exact:true})).toBeVisible();await expect(page.getByLabel('Business type',{exact:true})).toBeVisible();await expect(page.locator('#businessEmail')).toBeHidden();await expect(page.locator('#businessIndustry')).toBeHidden();await page.locator('#businessWorkspace').screenshot({path:'output/simple-create-business.png'});await page.getByLabel('Business name',{exact:true}).fill('My first shop');await page.getByLabel('Business type',{exact:true}).selectOption('retail');await page.getByRole('button',{name:'Create business',exact:true}).click();await expect(page.locator('#liveOverviewGreeting')).toHaveText('My first shop');expect(fixture.businesses).toHaveLength(1);await expect(page.locator('#liveFirstBusiness')).toBeHidden();
});
