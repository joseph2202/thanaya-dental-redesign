// ERP05 private cost-snapshot coverage. Synthetic, disposable SQLite ONLY.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..');
const temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-cogs-'));
const url='file:'+path.join(temp,'costs.db');
const secret=randomUUID()+randomUUID();
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,JWT_SECRET:secret,
 THANAYA_UPLOAD_DIR:path.join(temp,'uploads')};
let db,server,logs='',passed=0;
async function freePort(){
 const sock=net.createServer();
 await new Promise((resolve,reject)=>sock.once('error',reject).listen(0,'127.0.0.1',resolve));
 const p=sock.address().port;await new Promise(resolve=>sock.close(resolve));return p;
}
async function request(base,route,token,method='GET',data){
 const response=await fetch(base+route,{method,headers:{
 ...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})
 },body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
 return {status:response.status,body:await response.json()};
}
async function check(name,fn){await fn();passed++;console.log('PASS ERP05 '+name);}
async function main(){
 const migration=spawnSync(path.join(cwd,'node_modules','.bin','prisma'),
  ['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
 if(migration.status!==0)throw Error('Private DB init failed: '+migration.stderr+' '+migration.stdout);
 process.env.DATABASE_URL=url;
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 db=new PrismaClient({datasources:{db:{url}}});
 const owner=await db.user.create({data:{name:'Test owner',email:'owner@cost.invalid',phone:'07812345678',password:'unused',role:'owner'}});
 const sales=await db.user.create({data:{name:'Sales',email:'sales@cost.invalid',phone:'07810000100',password:'unused',role:'sales'}});
 const buyer=await db.user.create({data:{name:'Customer',email:'customer@cost.invalid',phone:'07810000101',password:'unused',role:'customer'}});
 const auth=u=>jwt.sign({userId:u.id},secret,{expiresIn:'1h'});
 const product=await db.product.create({data:{
  name:'Cost known product',description:'CI',price:50000,usdPrice:1,category:'Dental',
  brand:'CI',icon:'Package',stock:50,purchaseCostIqd:20000
 }});
 const legacy=await db.product.create({data:{
  name:'Legacy unknown product',description:'CI',price:50000,usdPrice:1,category:'Dental',
  brand:'CI',icon:'Package',stock:10
 }});
 // Fully costed delivered order: 2 * 20,000 cost, 90,000 merchandise revenue.
 const covered=await db.order.create({data:{
  customerName:'Known',customerPhone:'07810000000',customerAddress:'Basra',
  customerCity:'البصرة',userId:buyer.id,status:'delivered',total:95000,
  subtotal:100000,discountAmount:10000,shippingFee:5000,
  items:{create:[{productId:product.id,productName:product.name,quantity:2,
   price:50000,costSnapshots:{create:[{quantity:2,unitCostIqd:20000,source:'product_reference'}]}}]}
 }});
 const old=await db.order.create({data:{
  customerName:'Historical',customerPhone:'07810000002',customerAddress:'Basra',
  customerCity:'البصرة',userId:buyer.id,status:'delivered',total:50000,
  items:{create:[{productId:legacy.id,productName:legacy.name,quantity:1,price:50000}]}
 }});
 const returned=await db.order.create({data:{
  customerName:'Partial return',customerPhone:'07810000003',customerAddress:'Basra',
  customerCity:'البصرة',userId:buyer.id,status:'delivered',total:50000,
  items:{create:[{productId:product.id,productName:product.name,quantity:1,
   price:50000,costSnapshots:{create:[{quantity:1,unitCostIqd:20000,source:'product_reference'}]}}]}
 },include:{items:true}});
 await db.orderReturn.create({data:{
  orderId:returned.id,requestId:randomUUID(),actorId:owner.id,
  reason:'Synthetic returned goods',lines:{create:[{
   orderItemId:returned.items[0].id,quantity:1,disposition:'quarantined'
  }]}
 }});
 const base='http://127.0.0.1:'+(await freePort());
 server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:base.split(':').at(-1)},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs=(logs+chunk.toString()).slice(-8000));
 try{
  for(let n=0;n<80;n++){
   if(server.exitCode!==null)throw Error('Cost API exited: '+logs);
   try{if((await fetch(base+'/api/health')).ok)break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  await check('anonymous and customer/sales cannot access confidential cost report',async()=>{
   for(const u of [undefined,buyer,sales]){
    const r=await request(base,'/api/reports/costs?range=all',u?auth(u):undefined);
    assert.equal(r.status,u?403:401);
   }
  });
  await check('qualified margin excludes unknown historical costs and partial merchandise returns',async()=>{
   const r=await request(base,'/api/reports/costs?range=all',auth(owner));
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.eligibleDelivered,3);
   assert.equal(r.body.completeCostOrders,1);
   assert.equal(r.body.missingCostOrders,1);
   assert.equal(r.body.returnedDeliveredOrders,1);
   assert.equal(r.body.coveredSalesIqd,90000);
   assert.equal(r.body.knownCostIqd,40000);
   assert.equal(r.body.knownMerchandiseMarginIqd,50000);
   assert.equal(r.body.coveragePercent,50);
   assert.equal(r.body.complete,false);
  });
  await check('editing current product costs cannot rewrite checkout COGS evidence',async()=>{
   await db.product.update({where:{id:product.id},data:{purchaseCostIqd:99999}});
   const r=await request(base,'/api/reports/costs?range=all',auth(owner));
   assert.equal(r.body.knownCostIqd,40000);
   assert.equal(r.body.knownMerchandiseMarginIqd,50000);
  });
  await check('legacy customer order response never reveals cost snapshots',async()=>{
   const r=await request(base,'/api/orders/'+covered.id,auth(buyer));
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(JSON.stringify(r.body).includes('unitCostIqd'),false);
   assert.equal(JSON.stringify(r.body).includes('costSnapshots'),false);
  });
  await check('invalid report ranges rejected without cost disclosure',async()=>{
   for(const q of ['?range=wrong','?range=7&extra=1']){
    const r=await request(base,'/api/reports/costs'+q,auth(owner));
    assert.equal(r.status,400);
   }
  });
  console.log('THANAYA ERP05 private COGS coverage: '+passed+' tests passed');
 }finally{
  if(server&&server.exitCode===null)server.kill('SIGTERM');
  if(db)await db.$disconnect();
  rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:120});
 }
}
main().catch(e=>{console.error('ERP05 COGS FAILURE',e,logs);process.exitCode=1;});
