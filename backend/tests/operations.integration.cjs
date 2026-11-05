// Operational dashboard accuracy against a disposable, fully synthetic shop.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {spawn,spawnSync}=require('node:child_process');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'thanaya-preview-'));
const file=path.join(root,'operations.sqlite'),url='file:'+file,secret=randomBytes(32).toString('hex');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,THANAYA_PREVIEW_ONLY:'1',
 THANAYA_PREVIEW_ROOT:root,THANAYA_PAYMENT_SANDBOX:'0',JWT_SECRET:secret,THANAYA_UPLOAD_DIR:path.join(root,'uploads')};
let db,server,base,passed=0,logs='';const users={};
async function check(name,fn){await fn();passed++;console.log('PASS operations:',name);}
const date=offset=>new Date(Date.now()+3*3600000+offset*86400000).toISOString().slice(0,10);
async function main(){
 try{
  const init=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
  assert.equal(init.status,0,init.stderr);
  const seed=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],{cwd,env,encoding:'utf8',timeout:45000});assert.equal(seed.status,0,seed.stderr);
  const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
  db=new PrismaClient({datasources:{db:{url}}});
  users.owner=await db.user.findFirst({where:{role:'owner'}});users.customer=await db.user.findFirst({where:{role:'customer'}});
  for(const role of ['admin','sales','inventory'])users[role]=await db.user.create({data:{name:'Operations '+role,role,
   email:role+'@operations.invalid',phone:'07811111111',password:'unused'}});
  const invoice=await db.supplierInvoice.findFirst();await db.supplierInvoice.update({where:{id:invoice.id},data:{dueDate:date(-1)}});
  const probe=net.createServer();await new Promise((ok,no)=>probe.once('error',no).listen(0,'127.0.0.1',ok));
  const port=probe.address().port;await new Promise(ok=>probe.close(ok));base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  for(const out of [server.stdout,server.stderr])out.on('data',chunk=>logs=(logs+chunk).slice(-2500));
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error('API exited: '+logs);
   try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(700)})).ok)break;}catch{}
   if(i===79)throw Error('API not ready');await new Promise(ok=>setTimeout(ok,100));
  }
  const call=async(query='range=all',role='owner')=>{
   const r=await fetch(base+'/api/reports/operations?'+query,{headers:role?{Authorization:'Bearer '+jwt.sign({userId:users[role].id,role:'owner'},secret,{expiresIn:'1h'})}:{},signal:AbortSignal.timeout(20000)});
   return {status:r.status,body:await r.json(),headers:r.headers};
  };
  await check('owner/admin only, private headers and strict period/query validation',async()=>{
   for(const role of [null,'customer','sales','inventory']){
    const r=await call('range=all',role);assert.equal(r.status,role?403:401);assert.equal(r.headers.get('cache-control'),'no-store');
   }
   assert.equal((await call('range=all','admin')).status,200);
   for(const query of ['range=0','range[]=7','range=7&range=90','range=all&actorId=forged'])assert.equal((await call(query)).status,400);
  });
  await check('staff-recorded collections, expenses and cash movement are separate from debt and profit',async()=>{
   const response=await call();assert.equal(response.status,200,JSON.stringify(response.body));const r=response.body;
   assert.deepEqual(r.period,{collectedIqd:60000,refundedIqd:0,netCollectionsIqd:60000,expenseIqd:25000,netRecordedCashMovementIqd:85000});
   assert.equal(r.receivables.dueIqd,145000);assert.equal(r.receivables.orders,2);
   assert.equal(r.payables.dueIqd,348000);assert.equal(r.payables.invoices,1);
   assert.equal(r.payables.overdueIqd,348000);assert.equal(r.payables.overdueInvoices,1);
   assert.equal(r.netProfitIqd,null);assert.equal(r.actualCashBalanceIqd,null);
   assert.equal(JSON.stringify(r).includes('customerPhone'),false);assert.equal(JSON.stringify(r).includes('purchaseCostIqd'),false);
  });
  await check('periods use event time, while outstanding balances include older collections',async()=>{
   const event=await db.orderPaymentEvent.findFirst();await db.orderPaymentEvent.update({where:{id:event.id},data:{createdAt:new Date(Date.now()-40*86400000)}});
   const recent=(await call('range=7')).body,older=(await call('range=90')).body;
   assert.equal(recent.period.collectedIqd,0);assert.equal(recent.period.expenseIqd,25000);
   assert.equal(recent.period.netRecordedCashMovementIqd,25000);assert.equal(older.period.collectedIqd,60000);
   assert.equal(recent.receivables.dueIqd,145000);assert.deepEqual(recent.receivables,older.receivables);
   assert.deepEqual(recent.payables,older.payables);
  });
  await check('partial-return orders are disclosed and excluded from unadjusted receivables',async()=>{
   const order=await db.order.findFirst({where:{total:160000},include:{items:true}}),line=order.items.find(item=>item.quantity===2);
   const returned=await fetch(base+'/api/orders/'+order.id+'/returns',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({userId:users.owner.id},secret)},
    body:JSON.stringify({requestId:randomUUID(),reason:'استلام مرتجع صناعي للقياس',items:[{orderItemId:line.id,quantity:1}]})});
   assert.equal(returned.status,201,await returned.text());
   const r=(await call()).body;assert.equal(r.receivables.dueIqd,45000);assert.equal(r.receivables.orders,1);
   assert.equal(r.receivables.excludedReturnOrders,1);assert.equal(r.receivables.returnedOrders,0);
   assert.equal((await db.order.findUnique({where:{id:order.id}})).status,'delivered');
   const costs=await fetch(base+'/api/reports/costs?range=all',{headers:{Authorization:'Bearer '+jwt.sign({userId:users.owner.id},secret)}});
   assert.equal((await costs.json()).returnedDeliveredOrders,1);
  });
  await check('a real partial-return refund reduces recorded cash without reviving collection due',async()=>{
   const order=await db.order.findFirst({where:{total:160000}});
   const refund=await fetch(base+'/api/finance/orders/'+order.id+'/events',{method:'POST',headers:{'Content-Type':'application/json',
    Authorization:'Bearer '+jwt.sign({userId:users.owner.id},secret)},body:JSON.stringify({requestId:randomUUID(),kind:'refund',method:'cash',amountIqd:10000,note:'رد مبلغ تجريبي بعد استلام المرتجع'})});
   assert.equal(refund.status,201,await refund.text());
   const r=(await call('range=7')).body;
   assert.equal(r.period.refundedIqd,10000);assert.equal(r.period.netCollectionsIqd,-10000);
   assert.equal(r.period.netRecordedCashMovementIqd,15000);assert.equal(r.receivables.dueIqd,45000);
  });
  await check('expiry counts include all positive stock; today is valid, zero and >30 days are excluded',async()=>{
   const product=await db.product.create({data:{name:'Expiry synthetic',description:'Synthetic only',price:10000,usdPrice:1,
    category:'Dental',brand:'Test',icon:'Package',stock:18,lotTracking:true}});
   const rows=[[-1,1],[0,2],[30,3],[31,4],[-1,0],...Array.from({length:8},()=>[-2,1])];
   for(const [i,[offset,stock]] of rows.entries())await db.productLot.create({data:{productId:product.id,code:'SYN-'+i,expiryDate:date(offset),stock}});
   const response=await call();assert.equal(response.status,200,JSON.stringify(response.body));const r=response.body.expiry;
   assert.equal(r.today,date(0));assert.equal(r.through,date(30));assert.equal(r.expiredLots,9);assert.equal(r.expiredUnits,9);
   assert.equal(r.soonLots,2);assert.equal(r.soonUnits,5);assert.equal(r.lots.length,8);assert.equal(r.hasMore,true);
  });
  await check('inconsistent customer ledgers fail closed instead of showing plausible balances',async()=>{
   const order=await db.order.findFirst({where:{total:45000}});
   const invalid=await db.orderPaymentEvent.create({data:{orderId:order.id,requestId:randomUUID(),actorId:users.owner.id,
    kind:'collection',method:'cash',amountIqd:50000,note:'Synthetic inconsistent fixture'}});
   const response=await call();assert.equal(response.status,409);assert.equal(Object.hasOwn(response.body,'period'),false);
   await db.orderPaymentEvent.delete({where:{id:invalid.id}});assert.equal((await call()).status,200);
  });
  await check('overpaid supplier ledger fails closed instead of reducing unrelated outstanding invoices',async()=>{
   const invalid=await db.supplierPayment.create({data:{invoiceId:invoice.id,requestId:randomUUID(),actorId:users.owner.id,
    method:'bank_transfer',amountIqd:400000,reference:'Synthetic inconsistent supplier'}});
   assert.equal((await call()).status,409);await db.supplierPayment.delete({where:{id:invalid.id}});
   assert.equal((await call()).body.payables.dueIqd,348000);
   const negative=await db.supplierPayment.create({data:{invoiceId:invoice.id,requestId:randomUUID(),actorId:users.owner.id,
    method:'cash',amountIqd:-1,reference:'Synthetic damaged supplier row'}});
   assert.equal((await call()).status,409);await db.supplierPayment.delete({where:{id:negative.id}});
  });
  await check('summary reads leave all shop DB and WAL bytes unchanged',async()=>{
   const fingerprint=()=>{
    const hash=createHash('sha256').update(fs.readFileSync(file));if(fs.existsSync(file+'-wal'))hash.update(fs.readFileSync(file+'-wal'));return hash.digest('hex');
   };
   const before=fingerprint();for(const range of ['7','30','90','all'])assert.equal((await call('range='+range)).status,200);
   assert.equal(fingerprint(),before);
  });
  console.log('OPERATIONS PASSED:',passed,'isolated checks');
 }finally{
  if(server&&server.exitCode===null){const ended=new Promise(ok=>server.once('exit',ok));server.kill();await ended;}
  if(db)await db.$disconnect();fs.rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 }
}
main().catch(error=>{console.error('OPERATIONS FAILED',error);process.exitCode=1;});
