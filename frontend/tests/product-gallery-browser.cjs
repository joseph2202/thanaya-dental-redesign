// Real product gallery interactions on the disposable shop. Existing brand
// images are test fixtures, never inserted into live product data.
const assert=require('node:assert/strict'),path=require('node:path');
const {mkdir}=require('node:fs/promises');
async function productGalleryBrowser(browser,base,fixture){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
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
  await modal.getByRole('button',{name:'الحجم الطبيعي',exact:true}).waitFor();
  const viewport=modal.locator('[aria-label="مساحة الصورة المكبّرة"]');
  const dimensions=await viewport.evaluate(element=>({scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,
    scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,className:element.className,
    canvasWidth:element.firstElementChild?.getBoundingClientRect().width,canvasHeight:element.firstElementChild?.getBoundingClientRect().height}));
  assert.ok(dimensions.scrollWidth>dimensions.clientWidth&&dimensions.scrollHeight>dimensions.clientHeight,JSON.stringify(dimensions));
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
  await empty.getByText('لم تُرفع صورة فوتوغرافية لهذا المنتج بعد؛ الأيقونة توضيحية فقط.',{exact:true}).waitFor();
  await page.goto(base+'/product/'+fixture.galleryOnlyId);
  const only=page.getByRole('region',{name:'صور Browser Gallery Only Product',exact:true});
  assert.equal(await only.getByText('لم تُرفع صورة فوتوغرافية لهذا المنتج بعد؛ الأيقونة توضيحية فقط.',{exact:true}).count(),0);
  await only.getByRole('button',{name:'تكبير صور المنتج',exact:true}).click();await modal.waitFor();
  await modal.getByRole('img',{name:'Browser Gallery Only Product، صورة 1',exact:true}).waitFor();
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  await page.goto(base+'/search?q=CI-SKU-440');
  const found=page.locator('article.signature-card').filter({hasText:name});
  await found.getByText('SKU: CI-SKU-440',{exact:true}).waitFor();
  await found.getByRole('button',{name:'إضافة '+name+' للسلة',exact:true}).click();
  await found.getByRole('link',{name:/عرض السلة/}).click();
  await page.getByRole('main').getByText(name,{exact:true}).first().waitFor();
  await page.goto(base+'/search?q='+encodeURIComponent('ا'.repeat(101)));
  await page.getByRole('heading',{name:'كلمة البحث طويلة جداً',exact:true}).waitFor();
  const repeated=await page.goto(base+'/search?q=first&q=second');assert.equal(repeated.status(),200);
  await page.getByRole('heading',{name:'ابحث عن منتجك',exact:true}).waitFor();
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS Playwright: gallery zoom/focus/mobile/fallback/gallery-only and preserved SKU search/add-to-cart/input guards');
 }finally{await context.close();}
}
module.exports={productGalleryBrowser};
