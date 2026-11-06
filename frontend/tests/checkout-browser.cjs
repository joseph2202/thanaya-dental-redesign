// Checkout through actual storefront forms. All price/stock/config mutations
// are authorized fixture operations against the disposable fullstack runner.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {mkdir}=require('node:fs/promises'),path=require('node:path');
async function checkoutBrowser(browser,base,{ownerEmail,ownerPassword,receivingFixture}){
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const shopper=await browser.newContext({viewport:{width:390,height:844}});
 const operator=await browser.newContext();
 const page=await shopper.newPage();let dropped=false,posted=0,savedOrder,submission;
 let releaseResponse;const heldResponse=new Promise(resolve=>{releaseResponse=resolve;});
 try{
  const login=await operator.request.post(base+'/api/auth/login',{headers:{Origin:base,'X-Thanaya-Auth-Mode':'cookie'},
   data:{email:ownerEmail,password:ownerPassword}});assert.equal(login.status(),200);
  const proof=(await operator.cookies()).find(cookie=>cookie.name==='thanaya_csrf').value;
  const admin=async(route,method,data)=>{
   const response=await operator.request.fetch(base+'/api'+route,{method,headers:{Origin:base,'X-Thanaya-CSRF':proof},data});
   const body=await response.json();assert.ok(response.ok(),JSON.stringify({status:response.status(),body}));return body;
  };
  const signUp=await shopper.request.post(base+'/api/auth/register',{headers:{Origin:base,'X-Thanaya-Auth-Mode':'cookie'},
   data:{name:'متسوق اختبار معزول',email:'checkout-'+randomUUID()+'@test.invalid',phone:'07811110000',password:'SyntheticBuyer#2026'}});
  assert.equal(signUp.status(),200);
  const id=receivingFixture.plainId,name='Browser Receipt Plain Product';
  await page.goto(base+'/search?q=CI-SKU-440');
  const card=page.locator('article.signature-card').filter({hasText:name});
  await card.getByRole('button',{name:'إضافة '+name+' للسلة',exact:true}).click();
  await card.getByRole('link',{name:/عرض السلة/}).click();
  await page.getByRole('link',{name:/المتابعة لإتمام الطلب/}).waitFor();
  await page.getByRole('link',{name:/المتابعة لإتمام الطلب/}).click();
  const summary=page.getByRole('region',{name:'ملخص الطلب',exact:true});
  await summary.getByText('المجموع قبل أجور التوصيل',{exact:true}).waitFor();
  await summary.getByText('هذا المبلغ لا يشمل أجور التوصيل؛ يؤكدها المتجر معك قبل الشحن.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'رقم الهاتف',exact:true}).getAttribute('placeholder'),'07822088894');
  console.log('PASS Playwright checkout: phone/address labels and unknown delivery fee are explicit');

  const config=await admin('/delivery','GET');
  await admin('/delivery','PUT',{enabled:true,revision:config.revision,
   rates:config.rates.map(rate=>({...rate,available:rate.province==='البصرة',fee:rate.province==='البصرة'?5000:0}))});
  const code=('CI-CHECKOUT-'+randomUUID().slice(0,8)).toUpperCase();
  const coupon=await admin('/coupons','POST',{code,kind:'fixed',discount:5000,minSubtotal:0,maxUses:3,expiresAt:null});
  await admin('/products/'+id,'PUT',{price:45000});
  const productBefore=await (await operator.request.get(base+'/api/products/'+id)).json();
  const stockBefore=productBefore.availableStock;assert.ok(stockBefore>0);
  await page.reload();
  const prepare=async()=>{
   await page.getByRole('combobox',{name:'المحافظة',exact:true}).selectOption('البصرة');
   await page.getByRole('textbox',{name:'العنوان التفصيلي',exact:true}).fill('عنوان شراء صناعي — البصرة — لا يخص أي زبون');
   const acknowledged=page.getByRole('checkbox',{name:'تغيّر سعر أحد المنتجات. راجعت المبلغ الجديد وأوافق على المتابعة.',exact:true});
   await acknowledged.waitFor();
   assert.equal(await page.getByRole('button',{name:'تأكيد الطلب • الدفع عند الاستلام',exact:true}).isDisabled(),true);
   await acknowledged.check();
   await page.getByRole('textbox',{name:'رمز خصم (اختياري)',exact:true}).fill(code);
   await page.getByRole('button',{name:'تطبيق',exact:true}).click();
   await page.getByText('كوبون '+code+' · خصم 5,000 د.ع',{exact:true}).waitFor();
   await summary.getByText('الإجمالي',{exact:true}).waitFor();
   await page.getByRole('button',{name:'تأكيد الطلب • الدفع عند الاستلام',exact:true}).waitFor();
  };
  await prepare();
  // A later stock change must be caught by the final server quote before any
  // attempt/order/coupon use is committed.
  await admin('/products/'+id+'/stock-adjustment','POST',{delta:-stockBefore,reason:'Synthetic concurrent stock reservation'});
  await page.getByRole('button',{name:'تأكيد الطلب • الدفع عند الاستلام',exact:true}).click();
  await page.getByText('المخزون تغيّر؛ عد إلى السلة وعدّل الكميات',{exact:true}).waitFor();
  assert.equal((await (await shopper.request.get(base+'/api/orders/mine')).json()).length,0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('thanaya-checkout-attempt')),null);
  console.log('PASS Playwright checkout: repricing consent and final stock check prevent a stale-stock order');
  await admin('/products/'+id+'/stock-adjustment','POST',{delta:stockBefore,reason:'Synthetic reservation released before retry'});
  await page.reload();await prepare();
  await page.route('**/api/orders',async route=>{
   if(route.request().method()!=='POST'){await route.continue();return;}
   posted++;submission=route.request().postDataJSON();
   const response=await route.fetch();
   if(response.status()!==201){await route.fulfill({response});return;}
   savedOrder=await response.json();dropped=true;
   await heldResponse;
   await route.abort('connectionreset'); // commit succeeded, browser response lost
  });
  await page.getByRole('button',{name:'تأكيد الطلب • الدفع عند الاستلام',exact:true}).dblclick();
  releaseResponse();
  await page.waitForURL(/\/order\/confirmation\?id=/,{timeout:18000});
  await page.getByRole('heading',{name:'تم استلام طلبك بنجاح!',exact:true}).waitFor();
  assert.equal(dropped,true);assert.equal(posted,1);
  assert.equal(savedOrder.subtotal,45000);assert.equal(savedOrder.shippingFee,5000);
  assert.equal(savedOrder.discountAmount,5000);assert.equal(savedOrder.total,45000);assert.equal(savedOrder.paymentMethod,'cod');
  assert.equal(savedOrder.items[0].quantity,1);assert.equal(savedOrder.items[0].price,45000);
  assert.equal(Object.hasOwn(submission,'total'),false);assert.equal(Object.hasOwn(submission.items[0],'price'),false);
  const mine=await (await shopper.request.get(base+'/api/orders/mine')).json();assert.equal(mine.length,1);assert.equal(mine[0].id,savedOrder.id);
  const after=await (await operator.request.get(base+'/api/products/'+id)).json();assert.equal(after.availableStock,stockBefore-1);
  const coupons=await admin('/coupons','GET');assert.equal(coupons.find(row=>row.id===coupon.id).usedCount,1);
  const ledger=await admin('/finance/orders/'+savedOrder.id,'GET');assert.equal(ledger.totals.collectedIqd,0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('thanaya-checkout-attempt')),null);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thanaya-cart'))),[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.THANAYA_QA_SCREENSHOT_DIR){
   await mkdir(process.env.THANAYA_QA_SCREENSHOT_DIR,{recursive:true});
   await page.screenshot({path:path.join(process.env.THANAYA_QA_SCREENSHOT_DIR,'checkout-confirmation-mobile.png'),animations:'disabled',fullPage:true});
  }
  console.log('PASS Playwright: mobile checkout, accessible address/phone, unknown shipping, repricing consent, stock change, coupon/shipping and lost-response recovery without duplicate money/stock');
 }finally{releaseResponse();await shopper.close();await operator.close();}
}
module.exports={checkoutBrowser};
