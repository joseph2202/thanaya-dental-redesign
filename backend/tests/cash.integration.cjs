// ERP06 expense + recorded-cash summary, isolated SQLite only.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process'),{mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..');
const temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-cash-ledger-'));
const url='file:'+path.join(temp,'test.db');
const secret=randomUUID()+randomUUID(),env={...process.env,NODE_ENV:'test',DATABASE_URL:url,
 JWT_SECRET:secret,THANAYA_UPLOAD_DIR:path.join(temp,'uploads')};
let db,server,log='',passed=0;
async function port(){
 const p=net.createServer();
 await new Promise((ok,bad)=>p.once('error',bad).listen(0,'127.0.0.1',ok));
 const n=p.address().port;await new Promise(ok=>p.close(ok));return n;
}
async function req(base,route,token,method='GET',body){
 const r=await fetch(base+route,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(body?{'Content-Type':'application/json'}:{})
 },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(14000)});
 return {status:r.status,data:await r.json()};
}
async function check(name,fn){await fn();passed++;console.log('PASS ERP06 '+name);}
async function main(){
 const schema=spawnSync(path.join(cwd,'node_modules','.bin','prisma'),
  ['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
 if(schema.status!==0)throw Error('Temporary DB init: '+schema.stderr+' '+schema.stdout);
 process.env.DATABASE_URL=url;
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 db=new PrismaClient({datasources:{db:{url}}});
 const makeUser=(role,i)=>db.user.create({data:{
  name:'Test '+role,email:role+i+'@cash.invalid',phone:'0781000000'+i,
  password:'unused',role
 }});
 const owner=await makeUser('owner',1),admin=await makeUser('admin',2),
  sales=await makeUser('sales',3),customer=await makeUser('customer',4);
 const auth=user=>jwt.sign({userId:user.id},secret,{expiresIn:'1h'});
 const product=await db.product.create({data:{
  name:'CI product',description:'Test',price:200000,usdPrice:1,category:'Dental',
  brand:'CI',icon:'Package',stock:2
 }});
 const order=await db.order.create({data:{
  userId:customer.id,customerName:'Customer',customerPhone:'07811111111',
  customerAddress:'Basra CI',customerCity:'البصرة',total:200000,status:'delivered',
  items:{create:[{productId:product.id,price:200000,quantity:1,productName:product.name}]}
 }});
 for(const [kind,amountIqd]of [['collection',150000],['refund',20000]]){
  await db.orderPaymentEvent.create({data:{
   orderId:order.id,requestId:randomUUID(),actorId:owner.id,kind,
   method:'cash',amountIqd,note:'Isolated financial record'
  }});
 }
 const supplier=await db.supplier.create({data:{code:'CASH-CI',name:'CI Supplier'}});
 const po=await db.purchaseOrder.create({data:{
  requestId:randomUUID(),supplierId:supplier.id,createdById:owner.id,status:'ordered'
 }});
 const invoice=await db.supplierInvoice.create({data:{
  requestId:randomUUID(),purchaseOrderId:po.id,supplierId:supplier.id,
  invoiceNumber:'CASH-SUP-001',invoiceDate:'2026-11-02',dueDate:'2026-12-02',
  amountIqd:50000,note:'Isolated supplier cash',createdById:owner.id
 }});
 await db.supplierPayment.create({data:{
  invoiceId:invoice.id,requestId:randomUUID(),actorId:owner.id,method:'cash',
  amountIqd:40000,reference:'CI SUPPLIER PAID CASH'
 }});
 const base='http://127.0.0.1:'+(await port());
 server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:base.split(':').at(-1)},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>log=(log+chunk.toString()).slice(-6000));
 try{
  for(let i=0;i<90;i++){
   if(server.exitCode!==null)throw Error('Cash API exited: '+log);
   try{if((await fetch(base+'/api/health')).ok)break;}catch{}
   await new Promise(ok=>setTimeout(ok,180));
  }
  const expense={requestId:randomUUID(),category:'utilities',method:'cash',
   amountIqd:10000,reference:'CI UTILITIES RECEIPT',note:'Paid electricity for practice'};
  await check('anonymous, customer and sales cannot read or change cash',async()=>{
   for(const u of [undefined,customer,sales]){
    const token=u?auth(u):undefined,expected=u?403:401;
    assert.equal((await req(base,'/api/cash/summary?range=all',token)).status,expected);
    assert.equal((await req(base,'/api/cash/expenses',token,'POST',expense)).status,expected);
   }
  });
  await check('strict expense validation and no supplier purchase double count category',async()=>{
   for(const bad of [{...expense,amountIqd:-1},{...expense,method:'credit_card'},
    {...expense,category:'inventory_purchase'},{...expense,reference:'short'},
    {...expense,requestId:'bad'},{...expense,unexpected:'x'}]){
    assert.equal((await req(base,'/api/cash/expenses',auth(owner),'POST',bad)).status,400);
   }
   assert.equal(await db.storeExpense.count(),0);
  });
  await check('paid expense is append-only and duplicate key cannot double count',async()=>{
   const first=await req(base,'/api/cash/expenses',auth(admin),'POST',expense);
   assert.equal(first.status,201,JSON.stringify(first));
   const replay=await req(base,'/api/cash/expenses',auth(admin),'POST',expense);
   assert.equal(replay.status,200);
   assert.equal(replay.data.alreadyRecorded,true);
   assert.equal((await req(base,'/api/cash/expenses',auth(admin),'POST',
    {...expense,amountIqd:12000})).status,409);
   assert.equal(await db.storeExpense.count(),1);
  });
  await check('bank expenses are counted as expenses but not physical cash outflow',async()=>{
   const second=await req(base,'/api/cash/expenses',auth(admin),'POST',{
    ...expense,requestId:randomUUID(),method:'bank_transfer',
    amountIqd:30000,reference:'CI BANK OPERATING EXPENSE'
   });
   assert.equal(second.status,201);
  });
  const contribution={requestId:randomUUID(),direction:'contribution',
   amountIqd:50000,reference:'CI OWNER ADD CASH',note:'Owner contribution for store'};
  await check('cash drawer adjustments require owner only',async()=>{
   assert.equal((await req(base,'/api/cash/owner-movements',auth(admin),'POST',contribution)).status,403);
   const added=await req(base,'/api/cash/owner-movements',auth(owner),'POST',contribution);
   assert.equal(added.status,201,JSON.stringify(added));
   assert.equal((await req(base,'/api/cash/owner-movements',auth(owner),'POST',contribution)).status,200);
   assert.equal((await req(base,'/api/cash/owner-movements',auth(owner),'POST',
    {...contribution,amountIqd:90000})).status,409);
   const out=await req(base,'/api/cash/owner-movements',auth(owner),'POST',{
    requestId:randomUUID(),direction:'withdrawal',amountIqd:12000,
    reference:'CI OWNER CASH WITHDRAWAL',note:'Owner withdrew documented cash'
   });
   assert.equal(out.status,201);
  });
  await check('cash-in minus cash-out excludes bank while including receipts/refunds/payables',async()=>{
   const result=await req(base,'/api/cash/summary?range=all',auth(owner));
   assert.equal(result.status,200,JSON.stringify(result));
   assert.equal(result.data.recordedExpenseIqd,40000);
   assert.equal(result.data.expenseCount,2);
   assert.equal(result.data.cashInIqd,200000);
   assert.equal(result.data.cashOutIqd,82000);
   assert.equal(result.data.netRecordedCashMovementIqd,118000);
   assert.equal(result.data.components.customerCashCollectedIqd,150000);
   assert.equal(result.data.components.customerCashRefundedIqd,20000);
   assert.equal(result.data.components.supplierCashPaidIqd,40000);
   assert.equal(result.data.components.cashOperatingExpensesIqd,10000);
   assert.match(result.data.warning,/ليس رصيد صندوق/);
  });
  await check('private expense list and strict period parameters',async()=>{
   const entries=await req(base,'/api/cash/expenses',auth(owner));
   assert.equal(entries.status,200);
   assert.equal(entries.data.length,2);
   for(const bad of ['/api/cash/summary?range=banana','/api/cash/summary?extra=1']){
    assert.equal((await req(base,bad,auth(owner))).status,400);
   }
  });
  console.log('ERP06 cash and expense ledger: '+passed+' checks passed');
 }finally{
  if(server&&server.exitCode===null)server.kill('SIGTERM');
  if(db)await db.$disconnect();
  rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
main().catch(err=>{console.error('ERP06 FAILED:',err,log);process.exitCode=1;});
