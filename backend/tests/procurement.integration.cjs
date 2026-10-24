// Disposable SQLite only: ERP phase-one procurement never touches local dev.db.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const root=path.resolve(__dirname,'..');
const dir=mkdtempSync(path.join(os.tmpdir(),'thanaya-erp-procurement-'));
const url='file:'+path.join(dir,'private.db'),secret=randomUUID()+randomUUID();
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,JWT_SECRET:secret};
let server,db,passed=0,log='';
const freePort=()=>new Promise((resolve,reject)=>{
 const s=net.createServer();s.once('error',reject);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
async function req(base,route,method='GET',body,auth){
 const result=await fetch(base+route,{method,headers:{
  ...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})
 },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 const raw=await result.text();
 let data;try{data=JSON.parse(raw);}catch{data={nonJsonResponse:true};}
 return {status:result.status,data};
}
async function ready(base){
 for(let attempt=0;attempt<75;attempt++){
  if(server.exitCode!==null)throw Error('ERP test server terminated: '+log);
  try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)});if(r.ok)return;}
  catch{}await new Promise(resolve=>setTimeout(resolve,200));
 }throw Error('ERP test server timeout: '+log);
}
async function check(name,fn){await fn();passed++;console.log('PASS ERP '+name);}
async function run(){
 const cli=spawnSync(path.join(root,'node_modules','.bin','prisma'),['db','push','--skip-generate'],
  {cwd:root,env,timeout:90000,encoding:'utf8'});
 if(cli.status!==0)throw Error('Unable to build disposable test schema: '+cli.stderr+' '+cli.stdout);
 process.env.DATABASE_URL=url;
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 db=new PrismaClient({datasources:{db:{url}}});
 const owner=await db.user.create({data:{name:'Owner',email:'erpowner@invalid.test',phone:'07800000001',password:'unused',role:'owner'}});
 const sales=await db.user.create({data:{name:'Sales',email:'erpsales@invalid.test',phone:'07800000002',password:'unused',role:'sales'}});
 const token=u=>jwt.sign({userId:u.id},secret,{expiresIn:'1h'});
 const ownerToken=token(owner),salesToken=token(sales);
 const product=await db.product.create({data:{
  name:'مستلزمات أسنان',description:'Test item',price:80000,usdPrice:1,
  category:'طب الأسنان',brand:'Test',icon:'Package',stock:17,sku:'SKU-PO-1'
 }});
 const second=await db.product.create({data:{
  name:'Dental handpiece',description:'Test',price:100000,usdPrice:1,
  category:'Dental',brand:'Test',icon:'Package',stock:20
 }});
 const port=await freePort(),base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['dist/index.js'],{cwd:root,env:{...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>log=(log+b.toString()).slice(-6000));
 server.stderr.on('data',b=>log=(log+b.toString()).slice(-6000));
 try{
  await ready(base);
  const suppliers='/api/procurement/suppliers',drafts='/api/procurement/purchase-drafts';
  await check('anonymous/sales cannot view supplier directory',async()=>{
   for(const t of [undefined,salesToken]){
    const r=await req(base,suppliers,'GET',undefined,t);
    assert.equal(r.status,t?403:401);
    const post=await req(base,suppliers,'POST',{name:'Private',code:'P-1'},t);
    assert.equal(post.status,t?403:401);
    const d=await req(base,drafts,'GET',undefined,t);
    assert.equal(d.status,t?403:401);
   }
  });
  await check('reject malformed supplier inputs and unknown fields',async()=>{
   for(const input of [{name:'S',code:'?'},{name:'S',code:'V-1',stock:99},{code:'V-1'},{name:'Hi',code:'V-1',email:'notanemail'}]){
    const r=await req(base,suppliers,'POST',input,ownerToken);
    assert.equal(r.status,400,JSON.stringify(r));
   }
  });
  const supplier=await req(base,suppliers,'POST',{
   code:'sup-001',name:'المجهز الطبي',phone:'07812345678',city:'Basra'
  },ownerToken);
  await check('supplier created with canonical code, then rejects duplicate',async()=>{
   assert.equal(supplier.status,201,JSON.stringify(supplier));
   assert.equal(supplier.data.code,'SUP-001');
   const dup=await req(base,suppliers,'POST',{code:'SUP-001',name:'Other'},ownerToken);
   assert.equal(dup.status,409);
   assert.equal(await db.supplier.count(),1);
  });
  await check('supplier is searchable, and other user cannot write',async()=>{
   const found=await req(base,suppliers+'?search=SUP','GET',undefined,ownerToken);
   assert.equal(found.status,200);assert.equal(found.data.length,1);
   const bad=await req(base,suppliers+'?admin=true','GET',undefined,ownerToken);
   assert.equal(bad.status,400);
   const blocked=await req(base,suppliers+'/'+supplier.data.id,'PATCH',
    {active:false,expectedRevision:0},salesToken);
   assert.equal(blocked.status,403);
  });
  const payload={
   requestId:randomUUID(),supplierId:supplier.data.id,note:'الطلب تخطيط داخلي فقط',
   lines:[{productId:product.id,quantity:3,unitCostIqd:50000},
    {productId:second.id,quantity:2,unitCostIqd:65000}]
  };
  const first=await req(base,drafts,'POST',payload,ownerToken);
  await check('draft captures immutable product names, quantities, costs',async()=>{
   assert.equal(first.status,201,JSON.stringify(first));
   const list=await req(base,drafts,'GET',undefined,ownerToken);
   assert.equal(list.status,200);assert.equal(list.data.length,1);
   assert.equal(list.data[0].totalIqd,280000);
   assert.equal(list.data[0].status,'draft');
   assert.equal(list.data[0].lines.find(l=>l.productId===product.id).productName,'مستلزمات أسنان');
   assert.equal(list.data[0].lines.find(l=>l.productId===product.id).sku,'SKU-PO-1');
  });
  await check('idempotency: request replay and conflicting reuse',async()=>{
   const again=await req(base,drafts,'POST',payload,ownerToken);
   assert.equal(again.status,200);assert.equal(again.data.alreadyCreated,true);
   const conflict=await req(base,drafts,'POST',{...payload,note:'different'},ownerToken);
   assert.equal(conflict.status,409);
   assert.equal(await db.purchaseOrder.count(),1);
  });
  await check('draft does not alter actual stock or cashflow',async()=>{
   const inventory=await db.product.findUnique({where:{id:product.id}});
   assert.equal(inventory.stock,17);
   assert.equal(await db.inventoryMovement.count(),0);
   assert.equal(await db.orderPaymentEvent.count(),0);
   assert.equal(await db.purchaseOrderLine.count(),2);
  });
  await check('reject duplicate products, unknown products and invalid costs',async()=>{
   for(const item of [
    {...payload,requestId:randomUUID(),lines:[payload.lines[0],payload.lines[0]]},
    {...payload,requestId:randomUUID(),lines:[{productId:'fake-product',quantity:1,unitCostIqd:5000}]},
    {...payload,requestId:randomUUID(),lines:[{productId:product.id,quantity:1,unitCostIqd:0}]},
    {...payload,requestId:randomUUID(),lines:[{productId:product.id,quantity:1.5,unitCostIqd:5000}]}
   ]){
    const r=await req(base,drafts,'POST',item,ownerToken);
    assert.equal([400,409].includes(r.status),true,JSON.stringify(r));
   }
   assert.equal(await db.purchaseOrder.count(),1);
  });
  await check('archive supplier atomically prevents new drafts and preserves old',async()=>{
   const archived=await req(base,suppliers+'/'+supplier.data.id,'PATCH',
    {active:false,expectedRevision:0},ownerToken);
   assert.equal(archived.status,200,JSON.stringify(archived));
   assert.equal(archived.data.active,false);
   const stale=await req(base,suppliers+'/'+supplier.data.id,'PATCH',
    {active:true,expectedRevision:0},ownerToken);
   assert.equal(stale.status,409);
   const denied=await req(base,drafts,'POST',{...payload,requestId:randomUUID()},ownerToken);
   assert.equal(denied.status,409);
   assert.equal(await db.purchaseOrder.count(),1);
   const listed=await req(base,drafts,'GET',undefined,ownerToken);
   assert.equal(listed.data[0].supplier.name,'المجهز الطبي');
  });
  await check('not possible to send, receive or post supplier invoices from this phase',async()=>{
   const r=await req(base,drafts+'/'+first.data.id+'/receive','POST',{},ownerToken);
   assert.equal(r.status,404);
   assert.equal(await db.inventoryMovement.count(),0);
  });
  console.log('THANAYA ERP PHASE 1: '+passed+' integration checks passed on disposable SQLite.');
 }catch(err){console.error('ERP server logs:',log);throw err;}
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 if(server&&server.exitCode===null)server.kill('SIGTERM');
 if(db)await db.$disconnect();
 rmSync(dir,{recursive:true,force:true});
});
