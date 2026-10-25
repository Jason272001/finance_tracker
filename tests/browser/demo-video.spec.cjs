const {test,expect}=require('@playwright/test');
test('video page exposes downloads, transcript, responsive players and playable MP4s',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/watch-demo.html');
 await expect(page.getByRole('heading',{name:'A quick look at your next workday.'})).toBeVisible();
 await expect(page.locator('video[autoplay]')).toHaveCount(0);await expect(page.locator('.tour-transcript li')).toHaveCount(12);
 await expect(page.getByRole('link',{name:'Download vertical MP4',exact:true})).toHaveAttribute('download','');
 for(const [id,seconds,width,height] of [['walkthroughVideo',74,1280,720],['socialVideo',29,720,1280]]){
  await page.locator('#'+id).evaluate(v=>{v.muted=true;v.load();});
  await expect.poll(()=>page.locator('#'+id).evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(1);
  const metadata=await page.locator('#'+id).evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));expect(metadata.duration).toBeCloseTo(seconds,0);expect(metadata.width).toBeGreaterThan(0);expect(metadata.height).toBeGreaterThan(0);expect(metadata.width/metadata.height).toBeCloseTo(width/height,1);
  await page.locator('#'+id).evaluate(v=>v.play());await expect.poll(()=>page.locator('#'+id).evaluate(v=>v.currentTime)).toBeGreaterThan(0);await page.locator('#'+id).evaluate(v=>v.pause());
 }
 await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('website and demo link to the video page',async({page})=>{
 await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());await page.goto('/index.html');
 await expect(page.locator('.landing-cta').getByRole('link',{name:/Watch the 74-second walkthrough/})).toHaveAttribute('href','./watch-demo.html');
 await page.goto('/demo.html');await page.getByRole('link',{name:'Watch demo video',exact:true}).click();await expect(page).toHaveURL(/watch-demo.html$/);
 await page.goto('/frontends/web/watch-demo.html');await expect(page.locator('#walkthroughVideo source')).toHaveAttribute('src','../../assets/video/keeperbma-walkthrough.mp4');
});
