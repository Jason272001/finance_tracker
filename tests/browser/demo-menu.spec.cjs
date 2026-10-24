const {test,expect}=require('@playwright/test');
test('every business and POS shortcut opens its interactive demo panel',async({page})=>{
 await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());await page.goto('/demo.html');
 await page.getByRole('tab',{name:'Business tools',exact:true}).click();const menu=page.getByRole('navigation',{name:'Business demo shortcuts'});const count=await menu.locator('button').count();expect(count).toBe(12);
 for(let i=0;i<count;i++){const b=menu.locator('button').nth(i);const key=await b.getAttribute('data-demo-hub-tab');await b.click();await expect(page.locator(`[data-hub-panel="${key}"]`)).toBeVisible();}
 await page.getByRole('tab',{name:'POS & inventory',exact:true}).click();const pos=page.getByRole('navigation',{name:'POS demo shortcuts'});expect(await pos.locator('button').count()).toBe(8);
 for(let i=0;i<8;i++){const b=pos.locator('button').nth(i);const key=await b.getAttribute('data-demo-pos-tab');await b.click();await expect(page.locator(`[data-pos-panel="${key}"]`)).toBeVisible();}
});

test('demo directory uses accessible tabs with compact layouts in both themes',async({page})=>{
 await page.goto('/demo.html');
 await expect(page.locator('#demoMenu details')).toHaveCount(0);
 const start=page.getByRole('tab',{name:'Start here',exact:true});await expect(start).toHaveAttribute('aria-selected','true');await start.focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Business tools',exact:true})).toBeFocused();await expect(page.getByRole('navigation',{name:'Business demo shortcuts'})).toBeVisible();await expect(page.locator('#demo-directory-panel-start')).toBeHidden();
 await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('navigation',{name:'Business demo shortcuts'}).getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('button',{name:'Dark',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
