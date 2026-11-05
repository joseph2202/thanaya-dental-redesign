// Real product gallery interactions on the disposable shop. Existing brand
// images are test fixtures, never inserted into live product data.
const assert=require('node:assert/strict'),path=require('node:path');
const {mkdir}=require('node:fs/promises');
async function productGalleryBrowser(context,base,fixture){
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(base+'/product/'+fixture.plainId);
  const name='Browser Receipt Plain Product';
  const gallery=page.getByRole('region',{name:'صور '+name,exact:true});
  const trigger=gallery.getByRole('button',{name:'تكبير صور المنتج',exact:true});
  await page.waitForFunction(name=>[...document.images].some(image=>image.alt===name&&image.complete&&image.naturalWidth>0),name);
  await trigger.click();
  const modal=page.getByRole('dialog',{name:'تكبير صور المنتج',exact:true});
  await modal.waitFor();
  assert.equal(await modal.getByRole('button',{name:'إغلاق معرض الصور',exact:true}).evaluate(element=>document.activeElement===element),true);
  await page.keyboard.press('Tab');
  assert.equal(await modal.evaluate(element=>element.contains(document.activeElement)),true);
  const zoom=modal.getByRole('button',{name:'تكبير 2×',exact:true});
  await zoom.click();
  const viewport=modal.locator('[aria-label="مساحة الصورة المكبّرة"]');
  assert.equal(await viewport.evaluate(element=>element.scrollWidth>element.clientWidth&&element.scrollHeight>element.clientHeight),true);
  await modal.getByRole('button',{name:'الحجم الطبيعي',exact:true}).click();
  await page.keyboard.press('ArrowLeft');
  await modal.getByText('الصورة 2 من 3',{exact:true}).waitFor();
  await modal.getByRole('img',{name:name+'، صورة 2',exact:true}).waitFor();
  await modal.getByRole('button',{name:'الصورة السابقة',exact:true}).click();
  await modal.getByText('الصورة 1 من 3',{exact:true}).waitFor();
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(element=>document.activeElement===element),true);
  await gallery.getByRole('button',{name:'عرض الصورة 3',exact:true}).click();
  await gallery.getByRole('img',{name:'صورة '+name+' غير متاحة',exact:true}).waitFor();
  assert.equal(await gallery.getByRole('button',{name:'الصورة غير متاحة للتكبير',exact:true}).isDisabled(),true);
  await gallery.getByRole('button',{name:'عرض الصورة 1',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();await modal.waitFor();
  const bounds=await modal.boundingBox();assert.ok(bounds.x>=0&&bounds.width<=390&&bounds.y>=0&&bounds.height<=844);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await modal.evaluate(element=>getComputedStyle(element).animationName),'none');
  if(process.env.THANAYA_QA_SCREENSHOT_DIR){
   await mkdir(process.env.THANAYA_QA_SCREENSHOT_DIR,{recursive:true});
   await modal.screenshot({path:path.join(process.env.THANAYA_QA_SCREENSHOT_DIR,'product-gallery-mobile.png'),animations:'disabled'});
  }
  await modal.getByRole('button',{name:'إغلاق معرض الصور',exact:true}).click();await modal.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow==='hidden'),false);
  await page.goto(base+'/product/'+fixture.trackedId);
  const empty=page.getByRole('region',{name:'صور Browser Receipt Tracked Product',exact:true});
  assert.equal(await empty.getByRole('button',{name:'تكبير صور المنتج',exact:true}).count(),0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS Playwright: product zoom, keyboard/focus, mobile/reduced motion and broken/missing image fallback');
 }finally{await page.close();}
}
module.exports={productGalleryBrowser};
