const {test,expect}=require('@playwright/test');
test('time clock, breaks, review, overtime and CSV remain temporary',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());
 await page.goto('/demo.html#demoBusinessHub');await page.getByRole('navigation',{name:'Business hub sections'}).getByRole('button',{name:'Time clock & payroll',exact:true}).click();
 await page.locator('#timeIn').click();await expect(page.locator('#timeIn')).toBeDisabled();await page.locator('#timeBreak').click();await expect(page.locator('#timeActive')).toContainText('on unpaid break');await page.locator('#timeBreak').click();await page.locator('#timeOut').click();await expect(page.locator('#timeTable')).toContainText('Needs review');
 await page.locator('#timeTable').getByRole('button',{name:'Delete',exact:true}).click();
 await page.locator('summary').filter({hasText:'Add a sample timesheet entry'}).click();
 const f=page.locator('#timeManual');await page.locator('#timePeriod').fill('2026-10-19');await page.locator('#timeThreshold').fill('8');
 await f.locator('[name="start"]').fill('2026-10-19T08:00');await f.locator('[name="end"]').fill('2026-10-19T18:00');await f.locator('[name="break"]').fill('30');await f.getByRole('button').click();await expect(page.locator('#timeTotal')).toContainText('$0.00');
 await page.locator('#timeTable').getByRole('button',{name:'Approve',exact:true}).click();await expect(page.locator('#timePayroll')).toContainText('1.50');await expect(page.locator('#timeTotal')).toContainText('$184.50');await expect(page.locator('#timeTable').getByRole('button',{name:'Delete',exact:true})).toBeDisabled();
 const dl=page.waitForEvent('download');await page.locator('#timeExport').click();expect((await dl).suggestedFilename()).toContain('timesheet.csv');
 await page.locator('#timeTable').getByRole('button',{name:'Reopen',exact:true}).click();await expect(page.locator('#timeTotal')).toContainText('$0.00');
 await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.reload();await page.getByRole('navigation',{name:'Business hub sections'}).getByRole('button',{name:'Time clock & payroll',exact:true}).click();await expect(page.locator('#timeTable')).toContainText('No sample records');expect(errors).toEqual([]);
});
