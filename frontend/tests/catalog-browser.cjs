const assert=require('node:assert/strict');
async function catalogBrowser(browser,base){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const plain='Browser Receipt Plain Product',tracked='Browser Receipt Tracked Product',gallery='Browser Gallery Only Product';
 const cards=page.locator('main article.signature-card:visible');
 try{
  await page.goto(base+'/search?q=Dental');
  await page.getByRole('heading',{name:'نتائج البحث',exact:true}).waitFor();
  assert.equal(await cards.count(),3,'search by category must find all three published fixture products');
  const query='category=Dental&brand=CI&sort=price-asc&minPrice=40000&maxPrice=90000';
  const api=await context.request.get(base+'/api/products?'+query);assert.equal(api.status(),200);
  const rows=await api.json();assert.deepEqual(rows.map(p=>p.name),[plain,tracked],JSON.stringify(rows.map(p=>({name:p.name,price:p.price,category:p.category,brand:p.brand}))));
  await page.goto(base+'/products?'+query+'&inStock=1');
  await page.getByText('2 منتج مطابق',{exact:true}).waitFor();
  assert.equal(await cards.count(),2);
  await cards.nth(0).getByRole('link',{name:'تفاصيل '+plain,exact:true}).waitFor();
  await cards.nth(1).getByRole('link',{name:'تفاصيل '+tracked,exact:true}).waitFor();
  const form=page.getByRole('form',{name:'البحث وتصفية المنتجات',exact:true});
  await form.getByRole('button',{name:'عرض الفلاتر',exact:true}).click();
  await form.getByRole('textbox',{name:'من',exact:true}).fill('95000');
  await form.getByRole('textbox',{name:'إلى',exact:true}).fill('20000');
  await form.getByRole('button',{name:'عرض النتائج',exact:true}).click();
  await form.getByRole('alert').filter({hasText:'الحد الأدنى للسعر أكبر من الحد الأعلى'}).waitFor();
  await form.getByRole('textbox',{name:'من',exact:true}).fill('0');
  await form.getByRole('button',{name:'عرض النتائج',exact:true}).click();
  await page.waitForURL(/maxPrice=20000/);
  await page.getByRole('heading',{name:'ماكو منتجات تطابق اختيارك.',exact:true}).waitFor();
  await form.getByRole('button',{name:'عرض الفلاتر',exact:true}).click();
  await form.getByRole('checkbox',{name:'المتوفر حالياً فقط',exact:true}).uncheck();
  await form.getByRole('button',{name:'عرض النتائج',exact:true}).click();
  await page.waitForURL(url=>!url.searchParams.has('inStock'));
  await page.getByText('1 منتج مطابق',{exact:true}).waitFor();
  assert.equal(await cards.count(),1);await cards.getByRole('link',{name:'تفاصيل '+gallery,exact:true}).waitFor();
  assert.equal(await cards.getByRole('button',{name:'إضافة '+gallery+' للسلة',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  // Next's URL boundary must render a usable recovery page, not a server error
  // or a Client Component .trim() exception for a string[] value.
  for(const query of ['category=Dental&category=other','search=one&search=two','minPrice=1e3',
   'minPrice=50000&maxPrice=1000','sort=__proto__','inStock=1&inStock=0',
   'search='+encodeURIComponent('ا'.repeat(101))]){
   const response=await page.goto(base+'/products?'+query);assert.equal(response.status(),200,query);
   await page.getByRole('heading',{name:'رابط الفلاتر غير صالح',exact:true}).waitFor();
   await page.getByRole('link',{name:'مسح الفلاتر وتصفح المنتجات',exact:true}).waitFor();
  }
  await page.getByRole('link',{name:'مسح الفلاتر وتصفح المنتجات',exact:true}).click();
  await page.waitForURL(base+'/products');await page.getByText('3 منتج مطابق',{exact:true}).waitFor();assert.equal(await cards.count(),3);
  await page.goto(base+'/products?brand=CI');
  await page.getByRole('form',{name:'البحث وتصفية المنتجات',exact:true}).waitFor();
  await page.getByText('3 منتج مطابق',{exact:true}).waitFor();assert.equal(await cards.count(),3);assert.deepEqual(errors,[]);
  console.log('PASS Playwright: category search, combined stock/price filters, mobile form validation and invalid/repeated URL recovery');
 }finally{await context.close();}
}
module.exports={catalogBrowser};
