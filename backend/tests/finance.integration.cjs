// Financial workflow tests use a fresh temporary SQLite database only.
// DO NOT point DATABASE_URL to backend/prisma/dev.db.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');

const cwd=path.resolve(__dirname,'..');
const directory=mkdtempSync(path.join(os.tmpdir(),'thanaya-finance-isolated-'));
const url='file:'+path.join(directory,'test.db');
const secret=randomUUID()+randomUUID();
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,JWT_SECRET:secret};
let server,prisma;
let logs='';
let passed=0;

async function freePort(){
 const probe=net.createServer();
 await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;
 await new Promise(resolve=>probe.close(resolve));
 return port;
}
async function ready(base){
 for(let attempt=0;attempt<75;attempt++){
  if(server.exitCode!==null)throw Error('isolated finance API terminated');
  try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)});if(r.ok)return;}
  catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error('isolated finance API did not start');
}
async function request(base,route,method='GET',body,token){
 const r=await fetch(base+route,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(body?{'Content-Type':'application/json'}:{})
 },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json()};
}
async function test(name,fn){await fn();passed++;console.log('  PASS '+name);}
async function main(){
 console.log('THANAYA FINANCIAL LEDGER — isolated integration; NEVER touches dev.db');
 const schema=spawnSync(path.join(cwd,'node_modules','.bin','prisma'),['db','push','--skip-generate'],
  {cwd,env,timeout:90000,encoding:'utf8'});
 if(schema.status!==0)throw Error('Cannot create private test database: '+schema.stderr+' '+schema.stdout);
 process.env.DATABASE_URL=url;
 const {PrismaClient}=require('@prisma/client');
 const jwt=require('jsonwebtoken');
 prisma=new PrismaClient({datasources:{db:{url}}});
 assert.equal(await prisma.user.count(),0);
 const [admin,staff]=await Promise.all([
  prisma.user.create({data:{name:'Owner',email:'owner@finance.invalid',phone:'07811111111',password:'unused',role:'admin'}}),
  prisma.user.create({data:{name:'Sales',email:'sales@finance.invalid',phone:'07822222222',password:'unused',role:'sales'}})
 ]);
 const token=(u)=>jwt.sign({userId:u.id},secret,{expiresIn:'1h'});
 const auth=token(admin),sales=token(staff);
 const product=await prisma.product.create({data:{
  name:'Dental fixture',description:'Sample',price:50000,usdPrice:1,
  category:'Sample',brand:'Test',icon:'Package',stock:10
 }});
 async function order(status='delivered',opts={}){
  return prisma.order.create({data:{
   customerName:'Sample patient',customerPhone:'07811111111',
   customerAddress:'Basrah',customerCity:'Basrah',
   subtotal:100000,shippingFee:5000,discountAmount:20000,total:85000,
   status,...opts,
   items:{create:[{productId:product.id,quantity:2,price:50000,productName:'Dental fixture'}]}
  },include:{items:true}});
 }
 const port=await freePort(),base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-10000)});
 server.stderr.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-10000)});
 try{
  await ready(base);
  const first=await order();
  const endpoint='/api/finance/orders/'+first.id;
  const intent=(kind,amountIqd)=>({
   requestId:randomUUID(),kind,method:'cash',amountIqd,note:'موثق بوصل ورقي رقم 123'
  });
  await test('customer/sales and anonymous cannot access private finance',async()=>{
   for(const credential of [undefined,sales]){
    const r=await request(base,endpoint,'GET',undefined,credential);
    assert.equal(r.status,credential?403:401);
    const w=await request(base,endpoint+'/events','POST',intent('collection',1000),credential);
    assert.equal(w.status,credential?403:401);
   }
  });
  await test('delivered value does not auto-create cashflow',async()=>{
   const r=await request(base,endpoint,'GET',undefined,auth);
   assert.equal(r.status,200);
   assert.equal(r.body.totals.collectedIqd,0);
   assert.equal(r.body.totals.refundableCeilingIqd,0);
  });
  await test('invalid, negative, decimal and over-total amounts are blocked',async()=>{
   const bad=[-1,1.5,0,85001,NaN];
   for(const amount of bad.slice(0,-1)){
    const r=await request(base,endpoint+'/events','POST',intent('collection',amount),auth);
    assert.equal([400,409].includes(r.status),true,JSON.stringify(r));
   }
   assert.equal(await prisma.orderPaymentEvent.count(),0);
  });
  const receipt=intent('collection',85000);
  await test('record a real manual collection with original actor ID',async()=>{
   const r=await request(base,endpoint+'/events','POST',receipt,auth);
   assert.equal(r.status,201,JSON.stringify(r));
   const rows=await prisma.orderPaymentEvent.findMany({where:{orderId:first.id}});
   assert.equal(rows.length,1);
   assert.equal(rows[0].actorId,admin.id);
   assert.equal(rows[0].amountIqd,85000);
  });
  await test('replay same request ID never collects twice',async()=>{
   const repeated=await request(base,endpoint+'/events','POST',receipt,auth);
   assert.equal(repeated.status,200);
   assert.equal(repeated.body.alreadyProcessed,true);
   const changed=await request(base,endpoint+'/events','POST',{...receipt,amountIqd:80000},auth);
   assert.equal(changed.status,409);
   assert.equal(await prisma.orderPaymentEvent.count({where:{orderId:first.id}}),1);
  });
  await test('refund without a physical receipt is forbidden',async()=>{
   const r=await request(base,endpoint+'/events','POST',intent('refund',10000),auth);
   assert.equal(r.status,409,JSON.stringify(r));
  });
  await prisma.orderReturn.create({data:{
   orderId:first.id,requestId:randomUUID(),actorId:admin.id,reason:'Sample item returned',
   lines:{create:[{orderItemId:first.items[0].id,quantity:1,disposition:'quarantined'}]}
  }});
  await test('discounted partial item refund capped at 40,000 IQD, no shipping',async()=>{
   const ledger=await request(base,endpoint,'GET',undefined,auth);
   assert.equal(ledger.status,200);
   assert.equal(ledger.body.totals.refundableCeilingIqd,40000);
   const forbidden=await request(base,endpoint+'/events','POST',intent('refund',40001),auth);
   assert.equal(forbidden.status,409);
   const accepted=await request(base,endpoint+'/events','POST',intent('refund',40000),auth);
   assert.equal(accepted.status,201,JSON.stringify(accepted));
   const snapshot=await request(base,endpoint,'GET',undefined,auth);
   assert.equal(snapshot.body.totals.refundedIqd,40000);
   assert.equal(snapshot.body.totals.refundableRemainingIqd,0);
  });
  await test('a second refund never exceeds collected or returned goods',async()=>{
   const r=await request(base,endpoint+'/events','POST',intent('refund',1),auth);
   assert.equal(r.status,409);
  });
  await test('cannot record collection before delivery or on cancelled order',async()=>{
   const pending=await order('pending');
   const cancelled=await order('cancelled');
   for(const row of [pending,cancelled]){
    const r=await request(base,'/api/finance/orders/'+row.id+'/events','POST',intent('collection',1000),auth);
    assert.equal(r.status,409);
   }
  });
  await test('concurrent full collection cannot be over-counted',async()=>{
   const concurrent=await order();
   const url='/api/finance/orders/'+concurrent.id+'/events';
   const [a,b]=await Promise.all([
    request(base,url,'POST',intent('collection',85000),auth),
    request(base,url,'POST',intent('collection',85000),auth)
   ]);
   assert.equal([a.status,b.status].filter(s=>s===201).length,1,JSON.stringify([a,b]));
   assert.equal(await prisma.orderPaymentEvent.count({where:{orderId:concurrent.id}}),1);
   const snap=await request(base,'/api/finance/orders/'+concurrent.id,'GET',undefined,auth);
   assert.equal(snap.body.totals.collectedIqd,85000);
  });
  await test('summary counts actual ledger events, not delivered order totals',async()=>{
   const r=await request(base,'/api/finance/summary?range=30','GET',undefined,auth);
   assert.equal(r.status,200,JSON.stringify(r));
   assert.equal(r.body.receivedIqd,170000);
   assert.equal(r.body.refundedIqd,40000);
   assert.equal(r.body.netRecordedIqd,130000);
   assert.equal(r.body.receipts,2);
   assert.equal(r.body.refunds,1);
  });
  console.log('THANAYA FINANCE — ALL '+passed+' ISOLATED CHECKS PASSED.');
 }catch(e){console.error('Finance test server output:',logs);throw e;}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 if(server&&server.exitCode===null)server.kill('SIGTERM');
 if(prisma)await prisma.$disconnect();
 rmSync(directory,{recursive:true,force:true});
});
