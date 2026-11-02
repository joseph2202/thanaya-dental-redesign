// ERP04 supplier payables: dedicated, disposable SQLite only. NEVER user's dev.db.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');

const backend=path.resolve(__dirname,'..');
const scratch=mkdtempSync(path.join(os.tmpdir(),'thanaya-payables-'));
const dbUrl='file:'+path.join(scratch,'private.db');
const secret=randomUUID()+randomUUID();
const env={...process.env,DATABASE_URL:dbUrl,JWT_SECRET:secret,NODE_ENV:'test',
 THANAYA_UPLOAD_DIR:path.join(scratch,'uploads')};
let server,prisma,log='',passed=0;
const freePort=async()=>{
 const socket=net.createServer();
 await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));
 const p=socket.address().port;await new Promise(resolve=>socket.close(resolve));return p;
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(base){
 for(let i=0;i<90;i++){
  if(server.exitCode!==null)throw Error('API exited: '+log);
  try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(900)})).ok)return;}catch{}
  await sleep(200);
 }throw Error('API did not start: '+log);
}
async function request(base,route,method='GET',data,token){
 const result=await fetch(base+route,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(data?{'Content-Type':'application/json'}:{})},
  body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(14000)});
 return {status:result.status,data:await result.json()};
}
async function check(message,fn){
 await fn();passed++;console.log('PASS ERP04 '+message);
}
async function main(){
 const migrate=spawnSync(path.join(backend,'node_modules','.bin','prisma'),
 ['db','push','--skip-generate'],{cwd:backend,env,encoding:'utf8',timeout:90000});
 if(migrate.status!==0)throw Error('Cannot initialize isolated database: '+migrate.stderr+' '+migrate.stdout);
 process.env.DATABASE_URL=dbUrl;
 const {PrismaClient}=require('@prisma/client');
 const jwt=require('jsonwebtoken');
 prisma=new PrismaClient({datasources:{db:{url:dbUrl}}});
 assert.equal(await prisma.user.count(),0);
 const owner=await prisma.user.create({data:{
  name:'Owner',email:'owner@ap.test.invalid',phone:'07800000001',password:'unused',role:'owner'
 }});
 const sales=await prisma.user.create({data:{
  name:'Sales',email:'sales@ap.test.invalid',phone:'07800000002',password:'unused',role:'sales'
 }});
 const customer=await prisma.user.create({data:{
  name:'Customer',email:'customer@ap.test.invalid',phone:'07800000003',password:'unused',role:'customer'
 }});
 const token=user=>jwt.sign({userId:user.id},secret,{expiresIn:'1h'});
 const ownerToken=token(owner),salesToken=token(sales),customerToken=token(customer);
 const supplier=await prisma.supplier.create({data:{code:'AP-TEST',name:'Supplier Accounts Payable'}});
 const product=await prisma.product.create({data:{
  name:'Test dental material',description:'isolated',price:70000,usdPrice:1,
  category:'Dental',brand:'Test',icon:'Package',stock:13
 }});
 const purchase=await prisma.purchaseOrder.create({data:{
  requestId:randomUUID(),supplierId:supplier.id,createdById:owner.id,
  status:'ordered',lines:{create:[{productId:product.id,productName:product.name,quantity:10,unitCostIqd:50000}]}
 },include:{lines:true}});
 const orderLine=purchase.lines[0];
 const receipt=await prisma.purchaseReceipt.create({data:{
  purchaseOrderId:purchase.id,requestId:randomUUID(),actorId:owner.id,
  note:'Test supplier receiving note',
  lines:{create:[{purchaseOrderLineId:orderLine.id,quantity:6,unitCostIqd:50000}]}
 }});
 assert.ok(receipt.id);
 const draft=await prisma.purchaseOrder.create({data:{
  requestId:randomUUID(),supplierId:supplier.id,createdById:owner.id,status:'draft'
 }});
 const base='http://127.0.0.1:'+(await freePort());
 server=spawn(process.execPath,['dist/index.js'],{cwd:backend,
  env:{...env,PORT:base.split(':').at(-1)},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>log=(log+chunk).slice(-6000));
 const invoices='/api/payables/invoices';
 const input=(amount=200000,number='SUP-INV-001')=>({
  requestId:randomUUID(),purchaseOrderId:purchase.id,
  invoiceNumber:number,invoiceDate:'2026-11-02',dueDate:'2026-12-02',
  amountIqd:amount,note:'Supplier original paper invoice 001'
 });
 let createdId;
 try{
  await ready(base);
  await check('non-admin users denied invoice listing and creation',async()=>{
   for(const t of [undefined,salesToken,customerToken]){
    const expected=t?403:401;
    assert.equal((await request(base,invoices,'GET',undefined,t)).status,expected);
    assert.equal((await request(base,invoices,'POST',input(),t)).status,expected);
   }
   assert.equal(await prisma.supplierInvoice.count(),0);
  });
  await check('invoice request validates amount, dates, fields and allowed order',async()=>{
   for(const data of [
    {...input(),requestId:'no'},
    {...input(),amountIqd:0},
    {...input(),amountIqd:5000000000},
    {...input(),dueDate:'2026-10-01'},
    {...input(),invoiceDate:'2026-02-31'},
    {...input(),invoiceNumber:'invalid number !'},
    {...input(),extra:'unexpected'},
    {...input(),note:'short'},
    {...input(),purchaseOrderId:draft.id}
   ]){
    const result=await request(base,invoices,'POST',data,ownerToken);
    assert.ok([400,409].includes(result.status),JSON.stringify(result));
   }
   assert.equal(await prisma.supplierInvoice.count(),0);
  });
  const first=input();
  await check('record invoice only for previously received IQD and do not move stock or cash',async()=>{
   const added=await request(base,invoices,'POST',first,ownerToken);
   assert.equal(added.status,201,JSON.stringify(added));
   createdId=added.data.id;
   assert.equal(await prisma.supplierInvoice.count(),1);
   assert.equal((await prisma.product.findUnique({where:{id:product.id}})).stock,13);
   assert.equal(await prisma.inventoryMovement.count(),0);
   assert.equal(await prisma.orderPaymentEvent.count(),0);
   assert.equal(await prisma.supplierPayment.count(),0);
   const displayed=await request(base,invoices+'/'+createdId,'GET',undefined,ownerToken);
   assert.equal(displayed.status,200);
   assert.equal(displayed.data.remainingIqd,200000);
   assert.equal(displayed.data.status,'unpaid');
  });
  await check('idempotent replay cannot create more debt or change invoice payload',async()=>{
   const replay=await request(base,invoices,'POST',first,ownerToken);
   assert.equal(replay.status,200);
   assert.equal(replay.data.alreadyCreated,true);
   const malicious=await request(base,invoices,'POST',{...first,amountIqd:190000},ownerToken);
   assert.equal(malicious.status,409);
   const duplicateNumber=await request(base,invoices,'POST',input(50000),ownerToken);
   assert.equal(duplicateNumber.status,409);
   assert.equal(await prisma.supplierInvoice.count(),1);
  });
  await check('unbilled receipt value caps later invoices',async()=>{
   const over=await request(base,invoices,'POST',input(100001,'SUP-INV-002'),ownerToken);
   assert.equal(over.status,409);
   const second=await request(base,invoices,'POST',input(100000,'SUP-INV-002'),ownerToken);
   assert.equal(second.status,201,JSON.stringify(second));
   const third=await request(base,invoices,'POST',input(1,'SUP-INV-003'),ownerToken);
   assert.equal(third.status,409);
   assert.equal((await prisma.purchaseOrder.findUnique({where:{id:purchase.id}})).invoiceRevision,2);
   const all=await request(base,invoices,'GET',undefined,ownerToken);
   assert.equal(all.data.totals.invoicedIqd,300000);
   assert.equal(all.data.totals.remainingIqd,300000);
   assert.equal(all.data.invoices.length,2);
   const filtered=await request(base,invoices+'?supplierId='+supplier.id,'GET',undefined,ownerToken);
   assert.equal(filtered.data.invoices.length,2);
  });
  const payment=(amount,reference='SUP-PAID-REC-001')=>({
   requestId:randomUUID(),amountIqd:amount,method:'bank_transfer',reference
  });
  await check('payment input cannot forge currencies, negative amounts or methods',async()=>{
   for(const invalid of [
    {...payment(10000),amountIqd:-1},
    {...payment(10000),method:'credit_card'},
    {...payment(10000),reference:'x'},
    {...payment(10000),currency:'USD'},
    {...payment(10000),requestId:'invalid'}
   ]){
    assert.equal((await request(base,invoices+'/'+createdId+'/payments','POST',invalid,ownerToken)).status,400);
   }
   assert.equal(await prisma.supplierPayment.count(),0);
  });
  const firstPayment=payment(70000);
  await check('manual payment confirmation reduces payable without transferring money',async()=>{
   const written=await request(base,invoices+'/'+createdId+'/payments','POST',firstPayment,ownerToken);
   assert.equal(written.status,201,JSON.stringify(written));
   const ledger=await request(base,invoices+'/'+createdId,'GET',undefined,ownerToken);
   assert.equal(ledger.data.paidIqd,70000);
   assert.equal(ledger.data.remainingIqd,130000);
   assert.equal(ledger.data.status,'partial');
   assert.equal(ledger.data.payments.length,1);
   assert.equal((await prisma.product.findUnique({where:{id:product.id}})).stock,13);
   assert.equal(await prisma.orderPaymentEvent.count(),0);
  });
  await check('payment idempotency and max-balance protection',async()=>{
   assert.equal((await request(base,invoices+'/'+createdId+'/payments','POST',firstPayment,ownerToken)).status,200);
   assert.equal((await request(base,invoices+'/'+createdId+'/payments','POST',
    {...firstPayment,amountIqd:80000},ownerToken)).status,409);
   assert.equal((await request(base,invoices+'/'+createdId+'/payments','POST',
    payment(130001,'SUP-PAID-REC-OVER'),ownerToken)).status,409);
   assert.equal(await prisma.supplierPayment.count(),1);
  });
  await check('full payment closes debt, extra payment refused',async()=>{
   const completed=await request(base,invoices+'/'+createdId+'/payments','POST',
    payment(130000,'SUP-PAID-REC-FINAL'),ownerToken);
   assert.equal(completed.status,201);
   const ledger=await request(base,invoices+'/'+createdId,'GET',undefined,ownerToken);
   assert.equal(ledger.data.paidIqd,200000);
   assert.equal(ledger.data.remainingIqd,0);
   assert.equal(ledger.data.status,'paid');
   assert.equal((await request(base,invoices+'/'+createdId+'/payments','POST',
    payment(1,'SUP-PAID-REC-EXTRA'),ownerToken)).status,409);
  });
  await check('parallel attempts cannot overpay same invoice',async()=>{
   const second=(await prisma.supplierInvoice.findFirst({where:{invoiceNumber:'SUP-INV-002'}}));
   const url=invoices+'/'+second.id+'/payments';
   const results=await Promise.allSettled([
    request(base,url,'POST',payment(70000,'PARALLEL-PAID-001'),ownerToken),
    request(base,url,'POST',payment(70000,'PARALLEL-PAID-002'),ownerToken),
   ]);
   const winners=results.filter(x=>x.status==='fulfilled'&&x.value.status===201).length;
   assert.equal(winners,1,JSON.stringify(results));
   const ledger=await request(base,invoices+'/'+second.id,'GET',undefined,ownerToken);
   assert.equal(ledger.data.paidIqd,70000);
   assert.equal(ledger.data.remainingIqd,30000);
  });
  console.log('THANAYA ERP04 supplier payables: '+passed+' isolated checks PASS');
 }finally{
  if(server&&server.exitCode===null)server.kill('SIGTERM');
  if(prisma)await prisma.$disconnect();
  rmSync(scratch,{recursive:true,force:true,maxRetries:4,retryDelay:100});
 }
}
main().catch(error=>{console.error('ERP04 PAYABLES FAILED',error,log);process.exitCode=1;});
