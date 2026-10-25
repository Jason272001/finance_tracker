const {test,expect}=require('@playwright/test');
test('video page exposes downloads, transcript, responsive players and playable MP4s',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());await page.goto('/index.html#watch');
 await expect(page.getByRole('heading',{name:'See how everything connects.'})).toBeVisible();
 await expect(page.locator('video[autoplay]')).toHaveCount(0);await expect(page.locator('.home-transcript li')).toHaveCount(12);
 await expect(page.getByRole('link',{name:'Download vertical MP4',exact:true})).toHaveAttribute('download','');
 for(const [id,seconds,width,height] of [['walkthroughVideo',74,1280,720],['socialVideo',29,720,1280]]){
  await page.locator('#'+id).evaluate(v=>{v.muted=true;v.load();});
  await expect.poll(()=>page.locator('#'+id).evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(1);
  const metadata=await page.locator('#'+id).evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));expect(metadata.duration).toBeCloseTo(seconds,0);expect(metadata.width).toBeGreaterThan(0);expect(metadata.height).toBeGreaterThan(0);expect(metadata.width/metadata.height).toBeCloseTo(width/height,1);
  await page.locator('#'+id).evaluate(v=>v.play());await expect.poll(()=>page.locator('#'+id).evaluate(v=>v.currentTime)).toBeGreaterThan(0);await page.locator('#'+id).evaluate(v=>v.pause());
 }
 await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('videos stay on the homepage and old links redirect to the inline section',async({page})=>{
 await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());await page.goto('/index.html');
 await expect(page.locator('.landing-cta').getByRole('link',{name:/Watch the 74-second walkthrough/})).toHaveAttribute('href','#watch');
 await page.goto('/demo.html');await page.getByRole('link',{name:'Watch demo video',exact:true}).click();await expect(page).toHaveURL(/index.html#watch$/);
 await page.goto('/frontends/web/watch-demo.html');await expect(page).toHaveURL(/frontends\/web\/index.html#watch$/);await expect(page.locator('#walkthroughVideo source')).toHaveAttribute('src','../../assets/video/keeperbma-walkthrough.mp4');
});

test('homepage explains business previews and future projects in both themes',async({page})=>{
 await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());await page.setViewportSize({width:1440,height:1000});await page.goto('/index.html');
 await expect(page.locator('#landingTitle')).toHaveText('Your business, connected.');await expect(page.locator('.home-feature-card')).toHaveCount(6);await expect(page.locator('.home-roadmap-grid article')).toHaveCount(4);await expect(page.locator('#roadmap')).toContainText('Planned / future direction');await expect(page.locator('#features')).toContainText('not yet live business operations');
 await page.locator('#landingThemeToggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.locator('#watch')).toContainText('Download vertical MP4');}
});
