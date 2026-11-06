// Release gates on the exact synthetic production preview. No public service.
const assert=require('node:assert/strict');
const {writeFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function qualityReview({browser,base,password,product,directory,shopperPage,ownerPage}){
 const AxeBuilder=require('@axe-core/playwright').default;
 const result={scope:'synthetic production preview; automated sample, not a full accessibility certification or field performance',
  axe:[],performance:null,webkit:null};
 const failures=[];let wk;
 const persist=()=>writeFileSync(path.join(directory,'rc-quality.json'),JSON.stringify(result,null,2));
 async function theme(page,value){
  const target=value==='light'?'تفعيل المظهر الفاتح':'تفعيل المظهر الداكن';
  const toggle=page.getByRole('button',{name:target,exact:true});
  if(await toggle.count())await toggle.click();
  await page.waitForFunction(value=>document.documentElement.dataset.thanayaTheme===value,value);
  await delay(250);
 }
 async function scan(page,label,prepare){
  for(const mode of ['dark','light']){
   await theme(page,mode);if(prepare)await prepare();
   const report=await new AxeBuilder({page}).analyze();
   const violations=report.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,
    nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}));
   result.axe.push({page:label,theme:mode,viewport:page.viewportSize(),violations,
    incomplete:report.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
   const serious=violations.filter(v=>['serious','critical'].includes(v.impact));
   if(serious.length)failures.push(label+'/'+mode+': '+serious.map(v=>v.id+' ('+v.nodes.length+')').join(', '));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   if(overflow)failures.push(label+'/'+mode+': horizontal overflow');
   persist();
  }
 }
 try{
  // A clean initial navigation measured before axe runs. These are lab samples,
  // not field p75 CWV/INP. Font completion is included in the observation window.
  const lab=await browser.newContext({viewport:{width:390,height:844}});
  await lab.addInitScript(()=>{
   window.__rcPerf={lcp:0,layoutShift:0};
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__rcPerf.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__rcPerf.layoutShift+=e.value;}).observe({type:'layout-shift',buffered:true});}catch{}
  });
  const page=await lab.newPage();await page.goto(base);await page.locator('article.signature-card:visible').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);await delay(800);
  result.performance=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0],resources=performance.getEntriesByType('resource');
   return {engine:'Chrome',viewport:'390x844',ttfbMs:Math.round(n.responseStart-n.requestStart),
    fcpMs:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0),
    observedLcpMs:Math.round(window.__rcPerf.lcp),observedLayoutShiftScore:window.__rcPerf.layoutShift,
    sameOriginScriptEncodedBytes:resources.filter(r=>r.initiatorType==='script'&&r.name.startsWith(location.origin)).reduce((s,r)=>s+r.encodedBodySize,0),
    resourceCount:resources.length};
  });persist();
  await scan(page,'home-mobile');
  await page.setViewportSize({width:1440,height:900});await scan(page,'home-desktop');
  await page.setViewportSize({width:390,height:844});
  for(const route of ['/login','/register','/products','/product/'+product.id]){
   await page.goto(base+route);await page.getByRole('main').waitFor();await scan(page,route);
  }
  await lab.close();
  await shopperPage.setViewportSize({width:390,height:844});
  await shopperPage.goto(base+'/product/'+product.id);await shopperPage.getByRole('button',{name:'أضف للسلة',exact:true}).first().click();
  await shopperPage.getByRole('status').filter({hasText:'تمت الإضافة للسلة'}).waitFor();
  await shopperPage.goto(base+'/cart');await shopperPage.getByRole('link',{name:/المتابعة لإتمام الطلب/}).waitFor();await scan(shopperPage,'cart-filled');
  await shopperPage.getByRole('link',{name:/المتابعة لإتمام الطلب/}).click();await shopperPage.getByRole('combobox',{name:'المحافظة',exact:true}).waitFor();
  await scan(shopperPage,'checkout-filled');
  await ownerPage.setViewportSize({width:390,height:844});
  for(const route of ['/admin','/admin/reports','/admin/products','/admin/finance','/admin/cash']){
   await ownerPage.goto(base+route);await ownerPage.getByRole('heading',{level:1}).waitFor();
   if(route==='/admin')await ownerPage.getByText('التحصيل الموثّق',{exact:true}).waitFor();
   if(route==='/admin/reports'){
    await ownerPage.getByText('1 سند استلام ضمن الفترة',{exact:true}).waitFor();
    await ownerPage.getByRole('region',{name:'مراجعة التسويات المالية للمرتجعات',exact:true}).locator('summary').click();
   }
   await scan(ownerPage,route);
   if(route==='/admin/products'){
    await ownerPage.getByRole('button',{name:'+ إضافة منتج',exact:true}).click();
    const editor=ownerPage.getByRole('form',{name:'إضافة بيانات المنتج',exact:true});await editor.waitFor();
    await scan(ownerPage,'product-create-form');
    const name='منتج تحقق واجهة RC '+randomUUID().slice(0,6);
    await editor.getByLabel('اسم المنتج *',{exact:true}).fill(name);
    await editor.getByLabel('التصنيف *',{exact:true}).fill(product.category);
    await editor.getByLabel('السعر بالألف دينار',{exact:true}).fill('10');
    await editor.getByLabel('الماركة / الشركة المصنعة *',{exact:true}).fill('فحص صناعي');
    await editor.getByLabel('الكمية الابتدائية (المخزون) *',{exact:true}).fill('2');
    await editor.getByLabel('وصف المنتج *',{exact:true}).fill('منتج صناعي لاختبار الإنشاء والتعديل من واجهة الإدارة');
    const [created]=await Promise.all([ownerPage.waitForResponse(r=>r.url()===base+'/api/products'&&r.request().method()==='POST'),editor.getByRole('button',{name:'إضافة المنتج',exact:true}).click()]);
    assert.equal(created.status(),201);const saved=await created.json();assert.equal(saved.price,10000);
    const card=ownerPage.getByRole('article').filter({has:ownerPage.getByText(name,{exact:true})});await card.waitFor();
    await card.getByRole('button',{name:'تعديل',exact:true}).click();
    const edit=ownerPage.getByRole('form',{name:'تعديل بيانات المنتج',exact:true});await edit.waitFor();
    await edit.getByLabel('السعر بالألف دينار',{exact:true}).fill('12.5');
    const [updated]=await Promise.all([ownerPage.waitForResponse(r=>r.url()===base+'/api/products/'+saved.id&&r.request().method()==='PUT'),edit.getByRole('button',{name:'تحديث المنتج',exact:true}).click()]);
    assert.equal(updated.status(),200);
    const actual=await (await ownerPage.request.get(base+'/api/products/'+saved.id)).json();assert.equal(actual.price,12500);assert.equal(actual.stock,2);
    result.productEditor={passed:true,createdPriceIqd:10000,editedPriceIqd:12500,stockUnchangedOnPriceEdit:true};persist();
    console.log('PASS RC product editor: actual owner create/edit forms, thousands IQD conversion and unchanged initial stock');
   }
  }
  // Native WebKit (the engine used by Safari), a fresh actual shopping journey.
  wk=await require('playwright-core').webkit.launch({headless:true});
  const context=await wk.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile=await context.newPage(),errors=[];mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base);await mobile.getByRole('note').waitFor();await mobile.locator('article.signature-card:visible').first().waitFor();
  await theme(mobile,'light');assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await mobile.screenshot({path:path.join(directory,'rc-webkit-store-mobile.png'),animations:'disabled'});
  await mobile.goto(base+'/register');
  await mobile.getByRole('textbox',{name:'الاسم الكامل',exact:true}).fill('متسوق WebKit صناعي');
  await mobile.getByRole('textbox',{name:'البريد الإلكتروني',exact:true}).fill('webkit-'+randomUUID()+'@test.invalid');
  await mobile.getByRole('textbox',{name:'رقم الهاتف',exact:true}).fill('07812345678');
  await mobile.getByLabel('كلمة المرور',{exact:true}).fill('WebKitSynthetic#2026');await mobile.getByLabel('تأكيد كلمة المرور',{exact:true}).fill('WebKitSynthetic#2026');
  await mobile.getByRole('button',{name:'إنشاء حساب',exact:true}).click();await mobile.waitForURL('**/account');
  await mobile.reload();await mobile.getByRole('heading',{name:/أهلاً متسوق WebKit صناعي/}).waitFor();
  await mobile.goto(base+'/product/'+product.id);await mobile.getByRole('button',{name:'أضف للسلة',exact:true}).first().click();
  await mobile.getByRole('status').filter({hasText:'تمت الإضافة للسلة'}).waitFor();await mobile.goto(base+'/cart');
  await mobile.getByRole('link',{name:/المتابعة لإتمام الطلب/}).click();
  await mobile.getByRole('combobox',{name:'المحافظة',exact:true}).selectOption('البصرة');
  await mobile.getByRole('textbox',{name:'العنوان التفصيلي',exact:true}).fill('عنوان WebKit صناعي للفحص فقط');
  await mobile.getByRole('button',{name:'تأكيد الطلب • الدفع عند الاستلام',exact:true}).click();await mobile.waitForURL(/\/order\/confirmation\?id=/);
  await mobile.getByRole('heading',{name:'تم استلام طلبك بنجاح!',exact:true}).waitFor();
  const orderId=new URL(mobile.url()).searchParams.get('id');assert.ok(orderId);
  await mobile.reload();await mobile.getByRole('heading',{name:'تم استلام طلبك بنجاح!',exact:true}).waitFor();
  await scan(mobile,'webkit-order-confirmation');
  await mobile.goto(base+'/account');await mobile.setViewportSize({width:1440,height:900});
  await mobile.locator('button.thanaya-header-logout-link').click();await mobile.waitForURL(/\/login(?:\?|$)/);
  assert.equal((await mobile.evaluate(async()=>(await fetch('/api/auth/me')).status)),401);
  const ownerContext=await wk.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const admin=await ownerContext.newPage();admin.on('pageerror',e=>errors.push(e.message));
  await admin.goto(base+'/login');await admin.getByLabel('البريد الإلكتروني',{exact:true}).fill('preview-owner@thanaya.local');
  await admin.getByLabel('كلمة المرور',{exact:true}).fill(password);await admin.getByRole('button',{name:'دخول',exact:true}).click();await admin.waitForURL('**/admin');
  await admin.getByText('التحصيل الموثّق',{exact:true}).waitFor();
  await admin.getByRole('button',{name:'فتح قائمة الإدارة',exact:true}).click();const menu=admin.getByRole('dialog',{name:'قائمة إدارة ثنايا',exact:true});
  await menu.waitFor();await admin.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);
  await admin.goto(base+'/admin/reports#return-review');await admin.getByText('1 سند استلام ضمن الفترة',{exact:true}).waitFor();
  assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await admin.screenshot({path:path.join(directory,'rc-webkit-admin-mobile.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);await context.close();await ownerContext.close();
  result.webkit={passed:true,engine:wk.version(),viewport:'390x844 touch',orderCreated:true,
   journeys:['register','reload session','cart','COD','confirmation/reload','logout','owner login','admin menu/Escape','return review'],errors};persist();
  console.log('PASS RC WebKit: actual mobile registration/session/cart/COD/reload/logout and owner admin/report/menu journey');
  console.log('RC Chrome lab performance:',JSON.stringify(result.performance));
  assert.deepEqual(failures,[],'RC accessibility/layout failures; see rc-quality.json');
  console.log('PASS RC axe: no serious/critical violations across '+result.axe.length+' real page/theme samples');
 }finally{persist();if(wk)await wk.close();}
}
module.exports={qualityReview};
