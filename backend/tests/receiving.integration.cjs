// ERP 03 tests: dedicated temporary SQLite. Never touches user's Mac database.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const root=path.resolve(__dirname,'..');
const tmp=mkdtempSync(path.join(os.tmpdir(),'thanaya-erp-receipt-'));
const dbUrl='file:'+path.join(tmp,'private.db'),secret=randomUUID()+randomUUID();
const env={...process.env,NODE_ENV:'test',DATABASE_URL:dbUrl,JWT_SECRET:secret};
let app,db,passed=0,logs='';
const port=()=>new Promise((ok,fail)=>{
 const listener=net.createServer();listener.once('error',fail);
 listener.listen(0,'127.0.0.1',()=>{const n=listener.address().port;listener.close(()=>ok(n));});
});
async function req(base,route,method='GET',body,token){
 const result=await fetch(base+route,{
  method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(16000)
 });
 let data;const raw=await result.text();try{data=JSON.parse(raw)}catch{data={nonJson:true}};
 return {status:result.status,data,headers:result.headers};
}
async function wait(base){
 for(let i=0;i<75;i++){
  if(app.exitCode!==null)throw Error('API died: '+logs);
  try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(550)})).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,200));
 }throw Error('API did not respond: '+logs);
}
async function check(name,fn){await fn();passed++;console.log('PASS ERP RECEIPT '+name);}
async function main(){
 const cli=spawnSync(path.join(root,'node_modules','.bin','prisma'),['db','push','--skip-generate'],
  {cwd:root,env,encoding:'utf8',timeout:90000});
 if(cli.status!==0)throw Error(cli.stderr+' '+cli.stdout);
 process.env.DATABASE_URL=dbUrl;
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 db=new PrismaClient({datasources:{db:{url:dbUrl}}});
 const owner=await db.user.create({data:{name:'Owner',email:'receipt-owner@invalid.test',phone:'07800000013',password:'unused',role:'owner'}});
 const admin=await db.user.create({data:{name:'Admin',email:'receipt-admin@invalid.test',phone:'07800000014',password:'unused',role:'admin'}});
 const sales=await db.user.create({data:{name:'Sales',email:'receipt-sales@invalid.test',phone:'07800000015',password:'unused',role:'sales'}});
 const token=u=>jwt.sign({userId:u.id},secret,{expiresIn:'1h'});
 const own=token(owner),adm=token(admin),sl=token(sales);
 const plain=await db.product.create({data:{name:'Dental kit',description:'test',price:80000,usdPrice:1,category:'Dental',brand:'Test',icon:'Package',stock:5}});
 const batch=await db.product.create({data:{name:'Sterile dental kit',description:'test',price:120000,usdPrice:1,category:'Dental',brand:'Test',icon:'Package',stock:0,lotTracking:true}});
 const supplier=await db.supplier.create({data:{code:'SUP-RECEIVE',name:'Supplier in Basra'}});
 const ordered=await db.purchaseOrder.create({data:{
  requestId:randomUUID(),supplierId:supplier.id,createdById:owner.id,status:'ordered',
  lines:{create:[{productId:plain.id,productName:plain.name,quantity:5,unitCostIqd:50000},
   {productId:batch.id,productName:batch.name,quantity:4,unitCostIqd:90000}]}
 },include:{lines:true}});
 const plainLine=ordered.lines.find(l=>l.productId===plain.id);
 const batchLine=ordered.lines.find(l=>l.productId===batch.id);
 const draft=await db.purchaseOrder.create({data:{requestId:randomUUID(),supplierId:supplier.id,
  createdById:owner.id,status:'draft',lines:{create:[{productId:plain.id,productName:plain.name,quantity:3,unitCostIqd:50000}]}}});
 const base='http://127.0.0.1:'+(await port());
 app=spawn(process.execPath,['dist/index.js'],{cwd:root,env:{...env,PORT:base.split(':').at(-1)},stdio:['ignore','pipe','pipe']});
 app.stderr.on('data',d=>logs=(logs+d.toString()).slice(-8000));
 app.stdout.on('data',d=>logs=(logs+d.toString()).slice(-8000));
 try{
  await wait(base);
  const route='/api/receiving/purchase-orders/'+ordered.id;
  const lines=[
   {purchaseOrderLineId:plainLine.id,quantity:2},
   {purchaseOrderLineId:batchLine.id,quantity:3,lotCode:'LOT-TEST-01',expiryDate:'2030-12-31'}
  ];
  const payload={requestId:randomUUID(),expectedRevision:0,note:'Supplier delivery note #A001',lines};
  await check('anonymous and sales cannot see or post physical receipts',async()=>{
   for(const t of [undefined,sl]){
    const list=await req(base,route,'GET',undefined,t);assert.equal(list.status,t?403:401);
    const post=await req(base,route+'/receipts','POST',payload,t);
    assert.equal(post.status,t?403:401);
   }
   assert.equal(await db.inventoryMovement.count(),0);
  });
  await check('draft supplier order cannot receive goods',async()=>{
   const result=await req(base,'/api/receiving/purchase-orders/'+draft.id+'/receipts','POST',
    {...payload,requestId:randomUUID()},own);
   assert.equal(result.status,409,JSON.stringify(result));
  });
  await check('strict receiving input validation',async()=>{
   for(const invalid of [
    {...payload,requestId:'bad-id'},
    {...payload,note:'short'},
    {...payload,extra:'forged-money'},
    {...payload,lines:[lines[0],lines[0]]},
    {...payload,lines:[{...lines[0],quantity:-1}]},
    {...payload,lines:[{...lines[0],lotCode:'should-not-have'}]},
    {...payload,lines:[{purchaseOrderLineId:batchLine.id,quantity:1}]}
   ]){
    const r=await req(base,route+'/receipts','POST',invalid,own);
    assert.equal(r.status,400,JSON.stringify(r));
   }
   assert.equal(await db.purchaseReceipt.count(),0);
  });
  await check('partial receiving changes product & lot stock and appends movements atomically',async()=>{
   const done=await req(base,route+'/receipts','POST',payload,adm);
   assert.equal(done.status,201,JSON.stringify(done));
   assert.equal((await db.product.findUnique({where:{id:plain.id}})).stock,7);
   assert.equal((await db.product.findUnique({where:{id:batch.id}})).stock,3);
   const lot=await db.productLot.findUnique({where:{productId_code:{productId:batch.id,code:'LOT-TEST-01'}}});
   assert.equal(lot.stock,3);assert.equal(lot.purchaseCostIqd,90000);
   assert.equal(await db.inventoryMovement.count(),2);
   assert.equal(await db.orderPaymentEvent.count(),0);
   const saved=await db.purchaseReceipt.findFirst({include:{lines:true}});
   assert.equal(saved.lines.length,2);
   assert.equal(saved.lines.find(x=>x.purchaseOrderLineId===plainLine.id).unitCostIqd,50000);
  });
  await check('requestId replay cannot add stock or duplicate ledger movements',async()=>{
   const again=await req(base,route+'/receipts','POST',payload,adm);
   assert.equal(again.status,200,JSON.stringify(again));
   assert.equal(again.data.alreadyProcessed,true);
   assert.equal(await db.purchaseReceipt.count(),1);
   assert.equal(await db.inventoryMovement.count(),2);
   const different=await req(base,route+'/receipts','POST',
    {...payload,lines:[{...lines[0],quantity:1},lines[1]]},adm);
   assert.equal(different.status,409);
  });
  await check('read-only receipt details show exact remainder and no forged payment',async()=>{
   const response=await req(base,route,'GET',undefined,own);
   assert.equal(response.status,200,JSON.stringify(response));
   assert.equal(response.data.lines.find(x=>x.id===plainLine.id).lotTracking,false,
    'plain inventory does not require batch fields in admin receiving UI');
   assert.equal(response.data.lines.find(x=>x.id===batchLine.id).lotTracking,true,
    'batch tracked inventory must show batch code and expiry inputs');
   assert.equal(response.data.receiptRevision,1);
   assert.equal(response.data.complete,false);
   assert.equal(response.data.lines.find(x=>x.id===plainLine.id).remainingQuantity,3);
   assert.equal(response.data.lines.find(x=>x.id===batchLine.id).remainingQuantity,1);
   assert.equal(response.headers.get('cache-control'),'no-store');
  });
  await check('over-receipt and expired/wrong batch are rolled back',async()=>{
   for(const second of [
    [{purchaseOrderLineId:plainLine.id,quantity:4}],
    [{purchaseOrderLineId:batchLine.id,quantity:1,lotCode:'LOT-EXP',expiryDate:'2020-01-01'}],
    [{purchaseOrderLineId:batchLine.id,quantity:1,lotCode:'LOT-TEST-01',expiryDate:'2029-01-01'}]
   ]){
    const result=await req(base,route+'/receipts','POST',
     {requestId:randomUUID(),expectedRevision:1,note:'Second supplier note #2',lines:second},own);
    assert.equal(result.status,409,JSON.stringify(result));
   }
   assert.equal(await db.purchaseReceipt.count(),1);
   assert.equal(await db.inventoryMovement.count(),2);
  });
  await check('second shipment fills order without registering supplier invoice/payment',async()=>{
   const data={requestId:randomUUID(),expectedRevision:1,note:'Supplier delivery note #A002',lines:[
    {purchaseOrderLineId:plainLine.id,quantity:3},
    {purchaseOrderLineId:batchLine.id,quantity:1,lotCode:'LOT-TEST-01',expiryDate:'2030-12-31'}
   ]};
   const response=await req(base,route+'/receipts','POST',data,own);
   assert.equal(response.status,201,JSON.stringify(response));
   const snapshot=await req(base,route,'GET',undefined,adm);
   assert.equal(snapshot.data.complete,true);
   assert.equal(snapshot.data.lines.every(x=>x.remainingQuantity===0),true);
   assert.equal((await db.product.findUnique({where:{id:plain.id}})).stock,10);
   assert.equal((await db.product.findUnique({where:{id:batch.id}})).stock,4);
   assert.equal(await db.inventoryMovement.count(),4);
   assert.equal(await db.orderPaymentEvent.count(),0);
  });
  await check('two parallel receives never deliver the same remaining quantity twice',async()=>{
   const next=await db.purchaseOrder.create({data:{requestId:randomUUID(),supplierId:supplier.id,
    createdById:owner.id,status:'ordered',lines:{create:[{productId:plain.id,
     productName:plain.name,quantity:2,unitCostIqd:60000}]}}});
   const p='/api/receiving/purchase-orders/'+next.id+'/receipts';
   const basePayload={expectedRevision:0,note:'Concurrent delivery note 1',
    lines:[{purchaseOrderLineId:(await db.purchaseOrderLine.findFirst({where:{purchaseOrderId:next.id}})).id,quantity:2}]};
   const [a,b]=await Promise.all([
    req(base,p,'POST',{...basePayload,requestId:randomUUID()},own),
    req(base,p,'POST',{...basePayload,requestId:randomUUID()},adm)
   ]);
   assert.equal([a.status,b.status].filter(x=>x===201).length,1,JSON.stringify([a,b]));
   assert.equal([a.status,b.status].filter(x=>x===409).length,1,JSON.stringify([a,b]));
   assert.equal(await db.purchaseReceipt.count({where:{purchaseOrderId:next.id}}),1);
   assert.equal((await db.product.findUnique({where:{id:plain.id}})).stock,12);
  });
  console.log('THANAYA ERP RECEIVING — '+passed+' isolated checks PASS.');
 }catch(error){console.error('Backend logs',logs);throw error;}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 if(app&&app.exitCode===null)app.kill('SIGTERM');
 if(db)await db.$disconnect();
 rmSync(tmp,{force:true,recursive:true});
});
