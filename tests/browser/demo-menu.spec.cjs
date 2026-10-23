const {test,expect}=require('@playwright/test');
test('every business and POS shortcut opens its interactive demo panel',async({page})=>{
 await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());await page.goto('/demo.html');
 await page.getByText('All business tools',{exact:true}).click();const menu=page.getByRole('navigation',{name:'Business demo shortcuts'});const count=await menu.locator('button').count();expect(count).toBe(12);
 for(let i=0;i<count;i++){const b=menu.locator('button').nth(i);const key=await b.getAttribute('data-demo-hub-tab');await b.click();await expect(page.locator(`[data-hub-panel="${key}"]`)).toBeVisible();}
 await page.getByText('All POS tools',{exact:true}).click();const pos=page.getByRole('navigation',{name:'POS demo shortcuts'});expect(await pos.locator('button').count()).toBe(8);
 for(let i=0;i<8;i++){const b=pos.locator('button').nth(i);const key=await b.getAttribute('data-demo-pos-tab');await b.click();await expect(page.locator(`[data-pos-panel="${key}"]`)).toBeVisible();}
});
