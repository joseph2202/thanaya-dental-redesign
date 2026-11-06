const assert=require('node:assert/strict');
async function cartRecoveryBrowser(browser,base,fixture){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(base+'/terms');
  for(const raw of ['{}','null','[null,{"product":{},"quantity":1}]','{broken']){
   await page.evaluate(value=>localStorage.setItem('thanaya-cart',value),raw);
   await page.goto(base+'/cart');
   await page.getByRole('heading',{name:'سلتك بانتظار أول اختيار',exact:true}).waitFor();
   await page.getByRole('status').filter({hasText:'نظّفنا بيانات غير صالحة من السلة.'}).waitFor();
   await page.waitForFunction(()=>localStorage.getItem('thanaya-cart')==='[]');
  }
  const response=await context.request.get(base+'/api/products/'+fixture.plainId);assert.equal(response.status(),200);
  const product=await response.json(),name=product.name;
  await page.evaluate(value=>localStorage.setItem('thanaya-cart',JSON.stringify([
   {product:{...value,price:1},quantity:1},null,{product:value,quantity:2}
  ])),product);
  await page.goto(base+'/cart');
  await page.getByRole('region',{name:'المنتجات المضافة للسلة',exact:true}).getByText(name,{exact:true}).waitFor();
  await page.getByText('تغيّر سعر منتج في المتجر؛ تم عرض السعر المُحدّث، راجعه قبل المتابعة.',{exact:true}).waitFor();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('thanaya-cart')).length===1);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thanaya-cart')));
  assert.equal(saved[0].quantity,1,'duplicates are not merged');assert.equal(saved[0].product.price,1,'snapshot stays stale until explicit server quote review');
  const canContinue=page.getByRole('link',{name:/المتابعة لإتمام الطلب/});await canContinue.waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}

 const blocked=await browser.newContext({viewport:{width:390,height:844}});
 await blocked.addInitScript(()=>{
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  Storage.prototype.getItem=function(key){if(key==='thanaya-cart')throw new DOMException('Synthetic storage denial','SecurityError');return get.call(this,key)};
  Storage.prototype.setItem=function(key,value){if(key==='thanaya-cart')throw new DOMException('Synthetic storage quota','QuotaExceededError');return set.call(this,key,value)};
 });
 const session=await blocked.newPage(),blockedErrors=[];session.on('pageerror',error=>blockedErrors.push(error.message));
 try{
  await session.goto(base+'/search?q=CI-SKU-440');
  const card=session.locator('article.signature-card:visible').filter({hasText:'Browser Receipt Plain Product'});
  await card.getByRole('button',{name:'إضافة Browser Receipt Plain Product للسلة',exact:true}).click();
  await card.getByRole('link',{name:/عرض السلة/}).click();
  await session.getByRole('region',{name:'المنتجات المضافة للسلة',exact:true}).getByText('Browser Receipt Plain Product',{exact:true}).waitFor();
  await session.getByRole('status').filter({hasText:'المتصفح ما يسمح بحفظ السلة حالياً.'}).waitFor();
  await session.getByRole('button',{name:'زيادة كمية Browser Receipt Plain Product',exact:true}).click();
  await session.getByRole('region',{name:'المنتجات المضافة للسلة',exact:true}).getByRole('status').filter({hasText:'2'}).waitFor();
  assert.deepEqual(blockedErrors,[]);
  console.log('PASS Playwright: corrupt cart recovery, retained valid/duplicate entries, fresh server price and blocked-storage session basket');
 }finally{await blocked.close();}
}
module.exports={cartRecoveryBrowser};
