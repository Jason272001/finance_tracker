const {test,expect}=require('@playwright/test');

let fixture;

test.beforeEach(async({request})=>{fixture=await(await request.post('/__test__/reset')).json();});

async function station(browser,name){const context=await browser.newContext({baseURL:'http://127.0.0.1:8767'}),page=await context.newPage();await page.goto('/business-device.html');await page.locator('#stationPairForm [name="code"]').fill(fixture.codes[name]);await page.locator('#stationPairForm button').click();await expect(page.locator('#stationTitle')).toHaveText(name);return {context,page};}

async function login(page,code,credential){await page.locator('#stationLoginForm [name="code"]').fill(code);await page.locator('#stationLoginForm [name="credential"]').fill(credential);await page.locator('#stationLoginForm button').click();}

async function unlock(page,code='10001',credential='7351'){await page.locator('#stationManage').click();await page.locator('#stationApprovalForm [name="code"]').fill(code);await page.locator('#stationApprovalForm [name="credential"]').fill(credential);await page.locator('#stationApprovalForm button').filter({hasText:'Unlock management'}).click();}



test('two cashier devices share stock and a separate kitchen receives a real persisted order',async({browser})=>{

 const one=await station(browser,'Cashier 1'),two=await station(browser,'Cashier 2'),kitchen=await station(browser,'Kitchen');

 try{

  await login(one.page,'10002','654321');await login(two.page,'10003','123456');await login(kitchen.page,'10004','456789');

  await one.page.getByRole('button',{name:/Cheeseburger/}).click();await one.page.locator('#stationExtrasForm').getByRole('button',{name:'Add to sale'}).click();await one.page.locator('#stationOrderNote').fill('No onions');await one.page.locator('#stationPayForm [name="received"]').fill('10');await one.page.locator('#stationPay').click();await expect(one.page.locator('#stationReceipt')).toContainText('Cashier: Jason');await expect(one.page.locator('#stationReceipt')).toContainText('$6.50');

  await expect(kitchen.page.locator('#stationTickets')).toContainText('No onions');await expect(kitchen.page.locator('#stationTickets')).not.toContainText('$6.50');await kitchen.page.getByRole('button',{name:'Start preparing',exact:true}).click();await expect(kitchen.page.getByRole('button',{name:'Mark ready',exact:true})).toBeVisible();

  await two.page.bringToFront();await expect(two.page.locator('#stationProducts')).toContainText('19 in stock',{timeout:12000});await expect(two.page.locator('#stationCashier')).toContainText('Kay');

  expect((await two.context.request.get('/operations/admin')).status()).toBe(403);

  await two.page.locator('#stationManage').click();await two.page.locator('#stationApprovalForm [name="code"]').fill('10003');await two.page.locator('#stationApprovalForm [name="credential"]').fill('9999');await two.page.getByRole('button',{name:'Unlock management',exact:true}).click();await expect(two.page.locator('#stationApprovalError')).toContainText('incorrect');await two.page.locator('#stationApprovalCancel').click();await unlock(two.page);await expect(two.page.locator('#stationManagement')).toContainText('Daily report');await two.page.locator('#stationLock').click();await expect(two.page.locator('#stationManagement')).toBeHidden();await expect(two.page.locator('#stationCheckout')).toBeVisible();

  await one.page.locator('#stationReceiptClose').click();await one.page.locator('#stationLogout').click();await expect(one.page.locator('#stationLogin')).toBeVisible();expect((await one.context.request.post('/operations/orders',{data:{request_id:'no-operator',items:[],received_cents:1000,kind:'retail'}})).status()).not.toBe(200);

 }finally{await one.context.close();await two.context.close();await kitchen.context.close();}

});



test('time clock clears every credential and manager lock returns to a public punch screen',async({browser})=>{

 const clock=await station(browser,'Time clock');try{

  const form=clock.page.locator('#stationClockForm');await form.locator('[name="code"]').fill('10005');await form.locator('[name="credential"]').fill('567890');await form.getByRole('button',{name:'Clock in',exact:true}).click();await expect(clock.page.locator('#stationClockResult')).toContainText('Team member clocked in');await expect(form.locator('[name="code"]')).toHaveValue('');await expect(form.locator('[name="credential"]')).toHaveValue('');expect((await(await clock.context.request.get('/operations/device')).json()).staff).toBe(null);

  await form.locator('[name="code"]').fill('10005');await form.locator('[name="credential"]').fill('567890');await form.getByRole('button',{name:'Clock out',exact:true}).click();await expect(clock.page.locator('#stationClockResult')).toContainText('clocked out');await unlock(clock.page);await clock.page.getByRole('button',{name:'Timesheets',exact:true}).click();await expect(clock.page.locator('[data-ops-panel="timesheets"]')).toContainText('Team member');await clock.page.locator('#stationLock').click();await expect(clock.page.locator('#stationClock')).toBeVisible();await expect(clock.page.locator('#stationManagement')).toBeHidden();expect((await clock.context.request.get('/operations/admin')).status()).toBe(403);

 }finally{await clock.context.close();}

});



test('owner console authorizes devices while an office manager cannot grant owner access',async({browser})=>{

 const owner=await browser.newContext({baseURL:'http://127.0.0.1:8767'});await owner.addInitScript(()=>localStorage.setItem('keeperbma_token','browser-test-owner'));const page=await owner.newPage();const office=await station(browser,'Office');try{

  await page.goto('/operations-admin.html?business_id=1');await page.getByRole('button',{name:'Devices',exact:true}).click();const form=page.locator('#opsEnrollForm');await form.locator('[name="name"]').fill('New register');await form.getByRole('button',{name:'Add device',exact:true}).click();await expect(page.locator('#opsPairResult')).toContainText('expires in five minutes');

  await login(office.page,'10001','7351');await expect(office.page.locator('#stationManagement')).toContainText('Daily report');await expect(office.page.getByRole('button',{name:'Devices',exact:true})).toHaveCount(1);await office.page.getByRole('button',{name:'Staff & access',exact:true}).click();await expect(office.page.locator('#opsStaffForm [name="role"]')).not.toContainText('Original owner');expect((await office.context.request.post('/operations/admin',{data:{action:'staff',values:{id:'forged-owner',branch:fixture.branch,name:'Pretend owner',code:'99999',role:'owner',credential:'4321'}}})).status()).toBe(403);

  await office.page.getByRole('button',{name:'Schedules',exact:true}).click();const schedule=office.page.locator('#opsScheduleForm');await schedule.locator('[name="staff"]').selectOption({label:'Jason · Main branch'});await schedule.locator('[name="start"]').fill('2026-11-02T09:00');await schedule.locator('[name="end"]').fill('2026-11-02T14:00');await schedule.getByRole('button',{name:'Assign shift',exact:true}).click();await expect(office.page.locator('[data-ops-panel="schedule"] table')).toContainText('Jason');

  for(const width of [390,320]){await office.page.setViewportSize({width,height:900});expect(await office.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}await office.page.screenshot({path:'output/operations-manager-mobile.png',fullPage:true});

 }finally{await owner.close();await office.context.close();}

});



test('a shared station refuses to retain the owner account session',async({browser})=>{

 const context=await browser.newContext({baseURL:'http://127.0.0.1:8767'});await context.addCookies([{name:'keeperbma_session',value:'owner-cookie',domain:'127.0.0.1',path:'/',httpOnly:true}]);const page=await context.newPage();try{await page.goto('/business-device.html');await expect(page.locator('#stationOwnerSession')).toBeVisible();await page.locator('#stationOwnerSignout').click();await expect(page.locator('#stationPair')).toBeVisible();}finally{await context.close();}

});


test('existing business account creates an owner ID once and can find it after reload',async({browser,request})=>{
 await request.post('/__test__/reset?empty=true');
 const context=await browser.newContext({baseURL:'http://127.0.0.1:8767'});await context.addInitScript(()=>localStorage.setItem('keeperbma_token','browser-test-owner'));const page=await context.newPage();try{
  await page.goto('/operations-admin.html?business_id=1');await expect(page.getByRole('heading',{name:'Create your owner ID',exact:true})).toBeVisible();const code=await page.getByLabel('Your owner ID',{exact:true}).inputValue();expect(code).toMatch(/^[0-9]{6}$/);await expect(page.getByLabel('Your owner ID',{exact:true})).toHaveAttribute('readonly','');
  await page.locator('#ownerOpsSetupForm [name="industry"]').selectOption('retail');await page.getByLabel('Choose your owner PIN',{exact:true}).fill('807362');await page.getByLabel('Confirm PIN',{exact:true}).fill('807362');await page.getByRole('button',{name:'Create my owner ID',exact:true}).click();await expect(page.locator('#ownerOpsCode')).toHaveText(code);await expect(page.locator('#ownerOpsSetup')).toBeHidden();
  await page.reload();await expect(page.locator('#ownerOpsCode')).toHaveText(code);await page.getByRole('button',{name:'Manage my owner ID & PIN',exact:true}).click();await expect(page.locator('#opsStaffEditor')).toHaveAttribute('open','');await expect(page.locator('#opsStaffForm [name="code"]')).toHaveValue(code);await expect(page.locator('#opsStaffForm [name="credential"]')).toHaveValue('');
  await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'output/owner-id-mobile.png',fullPage:true});
 }finally{await context.close();}
});

test('owner creates a custom role and a staff ID is assigned automatically',async({browser})=>{
 const owner=await browser.newContext({baseURL:'http://127.0.0.1:8767'});await owner.addInitScript(()=>localStorage.setItem('keeperbma_token','browser-test-owner'));const page=await owner.newPage();try{
  await page.goto('/operations-admin.html?business_id=1');await page.getByRole('button',{name:'Roles & permissions',exact:true}).click();await page.locator('#opsRoleEditor summary').click();const role=page.locator('#opsRoleForm');await role.getByLabel('Role name',{exact:true}).fill('Shift supervisor');await role.getByLabel('Manage schedules',{exact:true}).check();await expect(role.getByLabel('Open back office',{exact:true})).toBeChecked();await role.getByLabel('Use POS checkout',{exact:true}).check();await role.getByRole('button',{name:'Save role permissions',exact:true}).click();await expect(page.locator('[data-ops-panel="roles"] table')).toContainText('Shift supervisor');
  await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'output/custom-roles-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Staff & access',exact:true}).click();await page.locator('#opsStaffEditor summary').click();const staff=page.locator('#opsStaffForm');await staff.getByLabel('Staff name',{exact:true}).fill('Alex');await expect(staff.locator('[name="code"]')).toHaveAttribute('readonly','');await staff.getByLabel('Business role',{exact:true}).selectOption({label:'Shift supervisor'});await staff.locator('[name="credential"]').fill('6789');await staff.getByRole('button',{name:'Save staff access',exact:true}).click();const row=page.locator('[data-ops-panel="staff"] tbody tr').filter({hasText:'Alex'});await expect(row).toContainText('Shift supervisor');const code=(await row.locator('td').first().innerText()).match(/[0-9]{6}/)[0];expect(code).toMatch(/^[0-9]{6}$/);
  const office=await station(browser,'Office');try{await login(office.page,code,'6789');await expect(office.page.getByRole('button',{name:'Schedules',exact:true})).toBeVisible();await expect(office.page.getByRole('button',{name:'Daily report',exact:true})).toHaveCount(0);await expect(office.page.getByRole('button',{name:'Products',exact:true})).toHaveCount(0);expect((await office.context.request.post('/operations/admin',{data:{action:'product',values:{}}})).status()).toBe(403);}finally{await office.context.close();}
  const clock=await station(browser,'Time clock');try{const f=clock.page.locator('#stationClockForm');await f.locator('[name="code"]').fill(code);await f.locator('[name="credential"]').fill('6789');await f.getByRole('button',{name:'Clock in',exact:true}).click();await expect(clock.page.locator('#stationClockResult')).toContainText('Alex clocked in');}finally{await clock.context.close();}
 }finally{await owner.close();}
});

test('device table saves codes across refresh and supports copy renewal and deletion',async({browser})=>{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:8767'});await context.addInitScript(()=>{localStorage.setItem('keeperbma_token','browser-test-owner');Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedDeviceCode=value;}}});});const page=await context.newPage();try{
  await page.goto('/operations-admin.html?business_id=1');await page.getByRole('button',{name:'Devices',exact:true}).click();const form=page.locator('#opsEnrollForm');await form.locator('[name="name"]').fill('Saved tablet');await form.getByRole('button',{name:'Add device',exact:true}).click();const row=page.locator('[data-ops-device-row]').filter({hasText:'Saved tablet'});await expect(row).toBeVisible();const first=await row.locator('code').innerText();expect(first).toMatch(/^[A-F0-9]{16}$/);const id=await row.getAttribute('data-ops-device-row');
  await page.getByRole('button',{name:'Daily report',exact:true}).click();await page.getByRole('button',{name:'Devices',exact:true}).click();await expect(row.locator('code')).toHaveText(first);await page.reload();await expect(row.locator('code')).toHaveText(first);await page.getByRole('button',{name:'Devices',exact:true}).click();await page.screenshot({path:'output/saved-device-table.png',fullPage:true});await row.getByRole('button',{name:'Copy code',exact:true}).click();expect(await page.evaluate(()=>window.copiedDeviceCode)).toBe(first);
  const office=await station(browser,'Office');try{await login(office.page,'10001','7351');await office.page.getByRole('button',{name:'Devices',exact:true}).click();await expect(office.page.locator('[data-ops-device-row]').filter({hasText:'Saved tablet'}).locator('code')).toHaveText(first);}finally{await office.context.close();}
  await row.getByRole('button',{name:'Generate new code',exact:true}).click();await expect(row.locator('code')).not.toHaveText(first);await expect(row).toHaveAttribute('data-ops-device-row',id);const second=await row.locator('code').innerText();await page.reload();await page.getByRole('button',{name:'Devices',exact:true}).click();await expect(row.locator('code')).toHaveText(second);await expect(page.getByRole('button',{name:'Revoke',exact:true})).toHaveCount(0);
  page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Delete device',exact:true}).click();await expect(row).toHaveCount(0);await page.reload();await page.getByRole('button',{name:'Devices',exact:true}).click();await expect(row).toHaveCount(0);
 }finally{await context.close();}
});


test('manager assigns the same device to a locked clock then back to office',async({browser})=>{
 const {context,page}=await station(browser,'Cashier 1');try{
  await login(page,'10002','654321');await expect(page.locator('#stationCheckout')).toBeVisible();await expect(page.locator('#stationAssignment')).toBeHidden();
  await unlock(page);await expect(page.locator('#stationAssignment')).toBeVisible();
  await page.locator('#stationAssignmentMode').selectOption('clock');await page.getByRole('button',{name:'Save and lock device',exact:true}).click();
  await expect(page.locator('#stationClock')).toBeVisible();await expect(page.locator('#stationManagement')).toBeHidden();await expect(page.locator('#stationAssignment')).toBeHidden();
  expect([401,403]).toContain((await context.request.get('/operations/admin')).status());
  await page.reload();await expect(page.locator('#stationClock')).toBeVisible();await expect(page.locator('#stationPair')).toBeHidden();await expect(page.locator('#stationStatus')).not.toHaveText('Connecting…');await page.screenshot({path:'output/assigned-time-clock-'+test.info().project.name+'.png',fullPage:true});
  await unlock(page);await page.locator('#stationAssignmentMode').selectOption('office');await page.getByRole('button',{name:'Save and lock device',exact:true}).click();
  await expect(page.locator('#stationLogin')).toBeVisible();await expect(page.locator('#stationIdentity')).toContainText('office');
  await login(page,'10002','654321');await expect(page.locator('#stationStatus')).toContainText('role');await expect(page.locator('#stationManagement')).toBeHidden();
  await login(page,'10001','7351');await expect(page.locator('#stationManagement')).toBeVisible();await page.locator('#stationLock').click();await expect(page.locator('#stationLogin')).toBeVisible();
 }finally{await context.close();}
});
