const assert=require('node:assert/strict');
const path=require('node:path');
const {mkdir}=require('node:fs/promises');

async function readableOrder(page,label){
 const report=await page.getByRole('main').evaluate(main=>{
  const ctx=document.createElement('canvas').getContext('2d');
  const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((n,i)=>i===3?n/255:n);};
  const over=(a,b)=>a.slice(0,3).map((n,i)=>n*a[3]+b[i]*(1-a[3]));
  const luminance=rgb=>rgb.map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  let checked=0,minimum=Infinity;const failures=[];
  for(const element of main.querySelectorAll('*')){
   const text=[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim();
   const style=getComputedStyle(element);
   if(!text||!element.getClientRects().length||style.visibility!=='visible'||element.closest('[aria-hidden="true"],:disabled'))continue;
   const ancestors=[];for(let parent=element;parent;parent=parent.parentElement)ancestors.unshift(parent);
   let background=[255,255,255],opacity=1;
   for(const ancestor of ancestors){const s=getComputedStyle(ancestor);background=over(rgba(s.backgroundColor),background);opacity*=Number(s.opacity);}
   const color=rgba(style.color);color[3]*=opacity;
   const foreground=over(color,background),light=luminance(foreground),dark=luminance(background);
   const ratio=(Math.max(light,dark)+.05)/(Math.min(light,dark)+.05);
   const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.667&&Number(style.fontWeight)>=700);
   const required=large?3:4.5;checked++;minimum=Math.min(minimum,ratio);
   if(ratio<required)failures.push({text:text.slice(0,85),ratio:Number(ratio.toFixed(2)),required,color:style.color,background:background.map(Math.round)});
  }
  return {checked,minimum:Number(minimum.toFixed(2)),failures};
 });
 assert.ok(report.checked>=30,label+': too few rendered text samples '+JSON.stringify(report));
 assert.deepEqual(report.failures,[],label+': computed text/background contrast '+JSON.stringify(report));
 console.log('PASS order contrast '+label+': '+report.checked+' text samples; minimum '+report.minimum+':1');
}

async function orderExperienceBrowser(page){
 const heading=page.getByRole('heading',{name:'تم استلام طلبك بنجاح!',exact:true});
 await heading.waitFor();
 const url=new URL(page.url()),api=url.origin+'/api/orders/'+encodeURIComponent(url.searchParams.get('id'));
 const actual=await page.request.get(api);assert.equal(actual.status(),200);const order=await actual.json();
 let visualStatus='pending';
 // Read-only presentation fixtures cover later statuses without modifying the
 // saved order, delivered stock, collections or refund ledgers.
 const displayStatus=async route=>route.request().method()==='GET'
  ? route.fulfill({json:{...order,status:visualStatus}}):route.continue();
 await page.route(api,displayStatus);
 try{
 for(const theme of ['dark','light']){
  const current=await page.evaluate(()=>document.documentElement.dataset.thanayaTheme);
  if(current!==theme)await page.getByRole('button',{name:theme==='light'?'تفعيل المظهر الفاتح':'تفعيل المظهر الداكن',exact:true}).click();
  await page.waitForFunction(expected=>document.documentElement.dataset.thanayaTheme===expected,theme);
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});
   await readableOrder(page,theme+'/'+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,theme+'/'+width+' horizontal overflow');
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('region',{name:'ملخص الطلب المؤكد',exact:true}).getByText('الإجمالي',{exact:true}).waitFor();
  const currentStep=page.getByRole('region',{name:'تقدم حالة الطلب',exact:true}).locator('[aria-current="step"]');
  assert.equal(await currentStep.count(),1);await currentStep.getByText('استلام الطلب',{exact:true}).waitFor();
  for(const button of await page.getByRole('main').getByRole('button').all()){
   const bounds=await button.boundingBox();assert.ok(bounds.height>=43.9,'44px touch control');
  }
  const refresh=page.getByRole('button',{name:'تحديث حالة الطلب',exact:true});
  await refresh.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  assert.equal(await refresh.evaluate(e=>e.matches(':focus-visible')),true);
  assert.ok(await refresh.evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth)>=2));
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  if(process.env.THANAYA_QA_SCREENSHOT_DIR){
   await mkdir(process.env.THANAYA_QA_SCREENSHOT_DIR,{recursive:true});
   await page.screenshot({path:path.join(process.env.THANAYA_QA_SCREENSHOT_DIR,'order-confirmation-'+theme+'-mobile.png'),animations:'disabled',fullPage:true});
  }
  for(const [status,title] of [['confirmed','طلبك تم تأكيده'],['shipped','طلبك بالطريق'],['delivered','تم تسليم الطلب'],['cancelled','هذا الطلب ملغي'],['returned','هذا الطلب مرتجع']]){
   visualStatus=status;await page.reload();await page.getByRole('heading',{name:title,exact:true}).waitFor();
   await readableOrder(page,theme+'/'+status);
  }
  visualStatus='pending';await page.reload();await heading.waitFor();
 }
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
 await heading.waitFor();
 assert.equal(await page.getByRole('region',{name:'تقدم حالة الطلب',exact:true}).locator('[aria-current="step"]').count(),1);
 await page.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
 }finally{await page.unroute(api,displayStatus);}
 assert.equal((await (await page.request.get(api)).json()).status,'pending','presentation fixtures never alter the saved order');
 console.log('PASS Playwright: readable order confirmation in both themes, semantic totals/progress, 320/390/768px and keyboard focus');
}
module.exports={orderExperienceBrowser};
