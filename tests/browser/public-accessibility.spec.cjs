const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;

test('public homepage and sign-in are accessible at desktop and phone widths',async({page})=>{
 test.setTimeout(90000);
 await page.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 for(const path of ['/index.html','/auth.html','/auth.html?mode=signup&plan=business','/auth.html?mode=recover','/admin-login.html']){
  await page.goto(path);await expect(page.locator('h1').first()).toBeVisible();
  for(const width of [1440,320]){
   await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   expect(result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  }
 }
});


test('invalid signup data is explained without sending an account-creation request',async({page})=>{
 const posts=[];await page.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>{if(route.request().method()==='POST')posts.push(new URL(route.request().url()).pathname);return route.abort();});
 await page.goto('/auth.html?mode=signup&plan=business');await expect(page.locator('#signupFields')).toBeVisible();await expect(page.locator('#authStatus')).toHaveAttribute('role','status');
 await page.locator('#authSubmit').click();await expect(page.locator('#authStatus')).toContainText('required');
 await page.getByLabel('Username',{exact:true}).fill('QA fictional user');await page.getByRole('textbox',{name:'Email',exact:true}).fill('invalid-email');await page.getByLabel('Phone',{exact:true}).fill('5550123456');await page.locator('#authPass').fill('Test password 123!');await page.locator('#authPassConfirm').fill('Test password 123!');await page.locator('#authSubmit').click();await expect(page.locator('#authStatus')).toContainText('Email is invalid');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('qa@example.test');await page.getByLabel('Phone',{exact:true}).fill('123');await page.locator('#authSubmit').click();await expect(page.locator('#authStatus')).toContainText('too short');
 await page.getByLabel('Phone',{exact:true}).fill('5550123456');await page.locator('#authPassConfirm').fill('Different password 123!');await page.locator('#authSubmit').click();await expect(page.locator('#authStatus')).toContainText('does not match');expect(posts).toEqual([]);
});
