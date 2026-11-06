// Boots the exact Mac launcher and its real production Next/Express pair.
// Both services, all clients and Chrome live in this same disposable test run.
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {once}=require('node:events');
const {existsSync,mkdirSync,writeFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'../..'),base='http://127.0.0.1:3108';
let child,browser,logs='',previewRoot;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeLogs=()=>logs.replace(/^Password:.*$/gm,'Password: [redacted]').slice(-6500);
async function stop(){
 if(!child||child.exitCode!==null)return;
 const ended=once(child,'exit');
 try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}
 let timer;await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(resolve,8000)})]);clearTimeout(timer);
 if(child.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}await ended;}
}
async function main(){
 const httpOnly=process.argv.includes('--http-only');
 child=spawn('bash',['scripts/preview-local.sh','--skip-install','--no-open'],{
  cwd:root,detached:true,env:{...process.env,RUST_LOG:'info'},stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+String(chunk)).slice(-30000)});
 let ready=false;
 for(let i=0;i<180;i++){
  if(child.exitCode!==null)throw Error('Preview exited: '+safeLogs());
  if(logs.includes('Press Ctrl+C')){
   try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}
  }
  await delay(1000);
 }
 assert.ok(ready,'Preview did not become healthy: '+safeLogs());
 previewRoot=logs.match(/^Creating a brand-new private SQLite database under (.+)\.\.\.$/m)?.[1];
 const password=logs.match(/^Password: ([^\r\n]+)$/m)?.[1];
 assert.ok(previewRoot&&password,'Private launcher must provide a temporary root/credential');
 assert.match(logs,/Server running on http:\/\/127\.0\.0\.1:4108/);
 const request=async(route,{method='GET',data,cookie,csrf}={})=>{
  const r=await fetch(base+'/api'+route,{method,headers:{Origin:base,'X-Thanaya-Auth-Mode':'cookie',
   ...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Thanaya-CSRF':csrf}:{})},
   body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
  const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null,headers:r.headers};
 };
 const ownerLogin=await request('/auth/login',{method:'POST',data:{email:'preview-owner@thanaya.local',password}});
 assert.equal(ownerLogin.status,200);assert.equal(ownerLogin.body.user.role,'owner');assert.equal(Object.hasOwn(ownerLogin.body,'token'),false);
 const cookies=ownerLogin.headers.getSetCookie(),cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 const csrf=cookies.find(c=>c.startsWith('thanaya_csrf=')).split(';')[0].slice('thanaya_csrf='.length);
 const admin=(route,method='GET',data)=>request(route,{method,data,cookie,csrf});
 const products=(await request('/products')).body;
 const chosen=products.find(p=>p.name==='حزمة أدوات فحص الأسنان');assert.ok(chosen&&chosen.availableStock>1);
 const operation=await admin('/reports/operations?range=all');assert.equal(operation.status,200);
 assert.equal(operation.body.period.collectedIqd,60000);assert.equal(operation.body.period.expenseIqd,25000);
 assert.equal(operation.body.payables.dueIqd,348000);assert.equal(operation.body.receivables.dueIqd,145000);
 const created=await admin('/products','POST',{name:'صنف فحص RC معزول',description:'بيانات صناعية لفحص الإنشاء والتعديل فقط',
  price:12000,usdPrice:0,stock:3,category:chosen.category,brand:'فحص صناعي',icon:'Package'});
 assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal((await admin('/products/'+created.body.id,'PUT',{price:14000})).status,200);
 assert.equal((await request('/products/'+created.body.id)).body.price,14000);
 const signup=await request('/auth/register',{method:'POST',data:{name:'متسوق فحص صناعي',email:'preview-http-'+randomUUID()+'@test.invalid',phone:'07812345678',password:'SyntheticHttp#2026'}});
 assert.equal(signup.status,200);const customerCookie=signup.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const customerCsrf=signup.headers.getSetCookie().find(c=>c.startsWith('thanaya_csrf=')).split(';')[0].slice('thanaya_csrf='.length);
 const customer=(route,method='GET',data)=>request(route,{method,data,cookie:customerCookie,csrf:customerCsrf});
 assert.equal((await customer('/products/'+chosen.id,'PUT',{price:1})).status,403);
 const quote=await customer('/products/quote','POST',{items:[{productId:chosen.id,quantity:1}]});assert.equal(quote.status,200);assert.equal(quote.body.canCheckout,true);
 const intent={requestId:randomUUID(),items:[{productId:chosen.id,quantity:1}],customer:{name:'متسوق فحص صناعي',phone:'07812345678',city:'البصرة',address:'عنوان صناعي لفحص المعاينة المستقلة'}};
 const order=await customer('/orders','POST',intent);assert.equal(order.status,201,JSON.stringify(order.body));
 const repeat=await customer('/orders','POST',intent);assert.equal(repeat.status,200);assert.equal(repeat.body.id,order.body.id);
 assert.equal((await request('/products/'+chosen.id)).body.availableStock,chosen.availableStock-1);
 assert.equal((await admin('/finance/orders/'+order.body.id)).body.totals.collectedIqd,0);
 // Receive one real synthetic return through the normal APIs, not report mocks.
 for(const status of ['confirmed','shipped','delivered']){
  const changed=await admin('/orders/'+order.body.id+'/status','PATCH',{status,reason:'انتقال صناعي لفحص مراجعة المرتجع'});
  assert.equal(changed.status,200,JSON.stringify(changed.body));
 }
 const sold=await admin('/orders/'+order.body.id);assert.equal(sold.status,200);
 const returned=await admin('/orders/'+order.body.id+'/returns','POST',{requestId:randomUUID(),reason:'استلام صناعي محجور للفحص فقط',
  items:[{orderItemId:sold.body.items[0].id,quantity:1,quarantinedQuantity:1}]});
 assert.equal(returned.status,201,JSON.stringify(returned.body));
 const review=await admin('/reports/return-review?range=30');assert.equal(review.status,200);assert.equal(review.body.total,1);
 assert.equal(review.body.rows[0].quarantinedUnits,1);assert.equal(review.body.rows[0].restockedUnits,0);
 assert.equal(review.body.rows[0].cost.totalHistoricalSaleCostIqd,34000);
 assert.equal(review.body.rows[0].currentOrderLedger.collectedIqd,0);assert.equal(review.body.rows[0].currentOrderLedger.refundableRemainingIqd,0);
 assert.equal((await customer('/reports/return-review?range=30')).status,403);
 assert.equal((await request('/products/'+chosen.id)).body.availableStock,chosen.availableStock-1,'quarantine must not replenish sellable stock');
 console.log('PASS private return review HTTP: actual receipt, original cost, quarantine, no automatic refund and denied customer report access');
 console.log('PASS private production preview HTTP: owner/customer auth, permissions, product create/edit, server quote, idempotent COD, stock and real seeded reports');
 if(!httpOnly){
  const {chromium}=require('playwright-core');
  const chrome=['google-chrome-stable','google-chrome','chromium'].map(name=>spawnSync('which',[name],{encoding:'utf8'})).find(r=>r.status===0)?.stdout.trim();
  assert.ok(chrome,'Chrome must be installed in CI; no browser launch is attempted by --http-only');
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
  const directory=process.env.THANAYA_QA_SCREENSHOT_DIR;assert.ok(directory,'Screenshot artifact directory is required');mkdirSync(directory,{recursive:true});
  const shopper=await browser.newContext({viewport:{width:1440,height:900}}),page=await shopper.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByRole('note').getByText(/بيانات صناعية فقط/).waitFor();
  await page.locator('article.signature-card:visible').first().waitFor();
  await page.screenshot({path:path.join(directory,'preview-store-desktop.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'تفعيل المظهر الفاتح',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(directory,'preview-store-mobile.png'),animations:'disabled',fullPage:true});
  await page.goto(base+'/register');
  await page.getByPlaceholder('أحمد محمد').fill('متسوق معاينة صناعي');await page.getByPlaceholder('example@email.com').fill('preview-ui-'+randomUUID()+'@test.invalid');
  await page.getByPlaceholder('07822088894').fill('07812345678');await page.getByPlaceholder('8 أحرف على الأقل').fill('SyntheticBrowser#2026');
  await page.getByPlaceholder('أعد كتابة كلمة المرور').fill('SyntheticBrowser#2026');await page.getByRole('button',{name:'إنشاء حساب',exact:true}).click();
  await page.waitForURL('**/account');
  await page.goto(base+'/product/'+chosen.id);await page.getByRole('button',{name:'أضف للسلة',exact:true}).first().click();
  await page.getByRole('status').filter({hasText:'تمت الإضافة للسلة'}).waitFor();
  await page.getByRole('link',{name:/^السلة، /}).click();await page.getByRole('link',{name:/المتابعة لإتمام الطلب/}).click();
  await page.getByRole('combobox',{name:'المحافظة',exact:true}).selectOption('البصرة');
  await page.getByRole('textbox',{name:'العنوان التفصيلي',exact:true}).fill('عنوان معاينة صناعية — لا يخص أي زبون');
  await page.getByRole('button',{name:'تأكيد الطلب • الدفع عند الاستلام',exact:true}).click();await page.waitForURL(/\/order\/confirmation\?id=/);
  await page.getByRole('heading',{name:'تم استلام طلبك بنجاح!',exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:path.join(directory,'preview-order-mobile.png'),animations:'disabled',fullPage:true});
  const staff=await browser.newContext({viewport:{width:1440,height:1000}}),owner=await staff.newPage();owner.on('pageerror',error=>errors.push(error.message));
  await owner.goto(base+'/login');await owner.getByPlaceholder('example@email.com').fill('preview-owner@thanaya.local');
  await owner.getByPlaceholder('6 أحرف على الأقل').fill(password);await owner.getByRole('button',{name:'دخول',exact:true}).click();await owner.waitForURL('**/admin');
  const financial=owner.getByRole('region',{name:'المؤشرات المالية والتشغيلية',exact:true});await financial.getByText('التحصيل الموثّق',{exact:true}).waitFor();
  await owner.screenshot({path:path.join(directory,'preview-admin-desktop.png'),animations:'disabled'});
  await owner.setViewportSize({width:390,height:844});assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await financial.screenshot({path:path.join(directory,'preview-financial-mobile.png'),animations:'disabled',style:'.thanaya-admin-header {visibility:hidden !important}'});
  await financial.getByRole('link',{name:'مراجعة التسويات المالية للمرتجعات',exact:true}).click();await owner.waitForURL('**/admin/reports#return-review');
  const returns=owner.getByRole('region',{name:'مراجعة التسويات المالية للمرتجعات',exact:true});
  await returns.getByText('1 سند استلام ضمن الفترة',{exact:true}).waitFor();
  await returns.locator('summary').click();await returns.getByText('تسوية هذا السند غير موثقة بهذا التقرير',{exact:true}).waitFor();
  await returns.getByText('حجر / غير صالحة للبيع',{exact:true}).waitFor();
  assert.match(await returns.innerText(),/34,000 د.ع/);assert.match(await returns.innerText(),/0 د.ع/);
  const ledgerLink=returns.getByRole('link',{name:'مراجعة سجل الطلب المالي',exact:true});
  assert.equal(await ledgerLink.getAttribute('href'),'/admin/finance?orderId='+encodeURIComponent(order.body.id));
  assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await returns.screenshot({path:path.join(directory,'preview-return-review-mobile.png'),animations:'disabled',style:'.thanaya-admin-header {visibility:hidden !important}'});
  // A delayed obsolete period must not replace the current return/COGS reports.
  let seenOld;const oldSeen=new Promise(resolve=>{seenOld=resolve});
  await owner.route('**/api/reports/**',async route=>{
   if(new URL(route.request().url()).searchParams.get('range')==='7'){
    const response=await route.fetch();seenOld();await delay(900);await route.fulfill({response}).catch(()=>{});
   }else await route.continue();
  });
  await owner.getByRole('button',{name:'7 أيام',exact:true}).click();await oldSeen;
  assert.equal(await returns.getByText('1 سند استلام ضمن الفترة',{exact:true}).isVisible(),false);
  await owner.getByRole('button',{name:'90 يوم',exact:true}).click();
  await returns.getByText('1 سند استلام ضمن الفترة',{exact:true}).waitFor();await delay(1100);
  assert.equal(await returns.getByText('1 سند استلام ضمن الفترة',{exact:true}).isVisible(),true);
  await owner.getByRole('heading',{name:'تكلفة البضاعة وهامش المبيعات الموثّق',exact:true}).waitFor();
  await owner.unroute('**/api/reports/**');
  await owner.route('**/api/reports/return-review?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'انقطاع صناعي مؤقت لتقرير المرتجعات'})}));
  await returns.getByRole('button',{name:'تحديث المرتجعات',exact:true}).click();await returns.getByRole('alert').waitFor();
  assert.equal(await returns.locator('summary').count(),0);await owner.getByRole('heading',{name:'تكلفة البضاعة وهامش المبيعات الموثّق',exact:true}).waitFor();
  await owner.unroute('**/api/reports/return-review?*');await returns.getByRole('button',{name:'إعادة تحميل المرتجعات من الصفحة الأولى',exact:true}).click();
  await returns.getByText('1 سند استلام ضمن الفترة',{exact:true}).waitFor();
  await returns.locator('summary').click();
  await ledgerLink.click();await owner.waitForURL('**/admin/finance?orderId=*');
  await owner.getByText(order.body.id,{exact:false}).first().waitFor();
  console.log('PASS private return review Chrome: dashboard link, actual received quarantine/cost/zero cash, mobile report, deep-linked ledger, obsolete period and independent error/retry');
  await owner.goto(base+'/admin/products');await owner.getByRole('main').getByText('صنف فحص RC معزول',{exact:true}).filter({visible:true}).waitFor();
  if(process.env.THANAYA_RC_QUALITY==='1')await require('./rc-quality-browser.cjs').qualityReview({browser,base,password,product:chosen,directory,shopperPage:page,ownerPage:owner});
  assert.deepEqual(errors,[]);await staff.close();await shopper.close();
  console.log('PASS private production preview Chrome: live storefront/admin, desktop/mobile, actual registration/cart/COD order and synthetic financial screenshots');
 }
 await stop();assert.equal(existsSync(previewRoot),false,'launcher must clean its temporary database/uploads');
 console.log('PASS private preview cleanup: original checkout data untouched; disposable database removed');
}
main().catch(error=>{console.error(error);console.error(safeLogs());process.exitCode=1}).finally(async()=>{if(browser)await browser.close();await stop();});
