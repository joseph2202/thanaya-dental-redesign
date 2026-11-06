const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync,existsSync}=require('node:fs');
const {once}=require('node:events');
const path=require('node:path'),os=require('node:os'),net=require('node:net');
const cwd=path.resolve(__dirname,'..'),temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-return-review-'));
const file=path.join(temp,'review.sqlite'),db='file:'+file,secret=randomUUID()+randomUUID();
const env={...process.env,DATABASE_URL:db,JWT_SECRET:secret,NODE_ENV:'test',THANAYA_UPLOAD_DIR:path.join(temp,'uploads')};
let prisma,server;
async function freePort(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
async function main(){
 const setup=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
 if(setup.status!==0)throw Error(setup.stderr||setup.stdout);
 process.env.DATABASE_URL=db;prisma=new (require('@prisma/client').PrismaClient)({datasources:{db:{url:db}}});
 const users={};for(const role of ['owner','admin','sales','inventory','customer'])users[role]=await prisma.user.create({data:{name:'Private name '+role,email:role+'@review.invalid',phone:'07898765432',password:'not-a-live-account',role}});
 const auth=role=>require('jsonwebtoken').sign({userId:users[role].id,role:'owner'},secret,{expiresIn:'1h'});
 const product=await prisma.product.create({data:{name:'Current renamed product',description:'Synthetic only',price:14000,usdPrice:0,stock:10,category:'Test',brand:'Test',icon:'Package',purchaseCostIqd:999999}});
 const makeOrder=async({quantity=1,price=14000,discount=0,shipping=0,cost=null,status='delivered',createdAt=new Date(),tracked=false}={})=>prisma.order.create({data:{
  userId:users.customer.id,customerName:'CUSTOMER-PII-CANARY',customerPhone:'07898765432',customerAddress:'PRIVATE ADDRESS CANARY',customerCity:'البصرة',status,createdAt,
  subtotal:quantity*price,discountAmount:discount,shippingFee:shipping,total:quantity*price-discount+shipping,
  items:{create:[{productId:product.id,productName:'Original sale name',quantity,price,
   ...(!tracked&&cost!==undefined?{costSnapshots:{create:[{quantity,unitCostIqd:cost,source:'product_reference'}]}}:{})}]}
 },include:{items:true}});
 const returned=async(order,lines,createdAt=new Date(),id)=>prisma.orderReturn.create({data:{...(id?{id}:{}),orderId:order.id,requestId:randomUUID(),actorId:users.owner.id,
  reason:'PRIVATE RETURN NOTE CANARY',createdAt,lines:{create:lines.map(line=>({orderItemId:order.items[0].id,disposition:'restocked',...line}))}}});
 const partial=await makeOrder({quantity:3,discount:1001,shipping:5000,cost:7000,createdAt:new Date('2020-01-01')});
 const partialReturn=await returned(partial,[{quantity:1}]);
 for(const [kind,amountIqd] of [['collection',20000],['refund',1000]])await prisma.orderPaymentEvent.create({data:{orderId:partial.id,requestId:randomUUID(),actorId:users.owner.id,kind,method:'cash',amountIqd,note:'Synthetic manual event'}});
 const tracked=await makeOrder({quantity:4,price:5000,tracked:true});
 const lots=[];for(let i=0;i<2;i++)lots.push(await prisma.productLot.create({data:{productId:product.id,code:'ORIGINAL-'+i,stock:2,expiryDate:'2099-01-01',purchaseCostIqd:999999}}));
 for(let i=0;i<2;i++){
  await prisma.orderItemLot.create({data:{orderItemId:tracked.items[0].id,lotId:lots[i].id,quantity:2}});
  await prisma.orderItemCostSnapshot.create({data:{orderItemId:tracked.items[0].id,lotId:lots[i].id,quantity:2,unitCostIqd:(i+1)*2000,source:'tracked_lot'}});
 }
 const trackedReturn=await returned(tracked,[{quantity:1,lotId:lots[0].id},{quantity:1,lotId:lots[1].id,disposition:'quarantined'}]);
 const unknown=await makeOrder({cost:null});const unknownReturn=await returned(unknown,[{quantity:1}]);
 const ambiguous=await makeOrder({quantity:2,cost:undefined,tracked:true});
 await prisma.orderItemCostSnapshot.createMany({data:[{orderItemId:ambiguous.items[0].id,quantity:1,unitCostIqd:3000,source:'product_reference'},{orderItemId:ambiguous.items[0].id,quantity:1,unitCostIqd:5000,source:'product_reference'}]});
 const ambiguousReturn=await returned(ambiguous,[{quantity:1}]);
 const old=await makeOrder();const oldReturn=await returned(old,[{quantity:1}],new Date('2020-01-01'));
 const future=await makeOrder();await returned(future,[{quantity:1}],new Date(Date.now()+86400000*2));
 await makeOrder({status:'returned'}); // Legacy status without a received-return document.
 const p=await freePort(),base='http://127.0.0.1:'+p;let logs='';
 server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(p)},stdio:['ignore','pipe','pipe']});
 for(const out of [server.stdout,server.stderr])out.on('data',chunk=>{logs=(logs+String(chunk)).slice(-3000)});
 for(let i=0;i<70;i++){
  if(server.exitCode!==null)throw Error('API exited: '+logs);
  try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(800)})).ok)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 const get=async(query='',role='owner')=>{
  const r=await fetch(base+'/api/reports/return-review'+(query?'?'+query:''),{headers:role?{Authorization:'Bearer '+auth(role)}:{},signal:AbortSignal.timeout(15000)});
  return {status:r.status,body:await r.json(),headers:r.headers};
 };
 assert.equal((await get('',null)).status,401);
 for(const role of ['sales','inventory','customer'])assert.equal((await get('',role)).status,403,role);
 const initial=await get('range=7','admin');assert.equal(initial.status,200,JSON.stringify(initial.body));assert.equal(initial.headers.get('cache-control'),'no-store');
 assert.equal(initial.body.total,4);assert.equal(initial.body.legacyWithoutEvidence,1);assert.equal(initial.body.settlementRecorded,false);
 console.log('PASS return review: owner/admin only; DB roles, no-store and legacy evidence gaps are explicit');
 const row=initial.body.rows.find(row=>row.returnId===partialReturn.id);assert.ok(row);
 assert.equal(row.grossSaleValueIqd,14000);assert.equal(row.cost.totalHistoricalSaleCostIqd,7000);
 assert.equal(row.currentOrderLedger.refundableCeilingIqd,13666);assert.equal(row.currentOrderLedger.refundableRemainingIqd,12666);
 assert.equal(row.currentOrderLedger.collectedIqd,20000);assert.equal(row.currentOrderLedger.refundedIqd,1000);assert.equal(row.requiresReview,true);
 const trackedRow=initial.body.rows.find(row=>row.returnId===trackedReturn.id);
 assert.equal(trackedRow.restockedUnits,1);assert.equal(trackedRow.quarantinedUnits,1);assert.equal(trackedRow.cost.totalHistoricalSaleCostIqd,6000);
 assert.equal(initial.body.rows.find(row=>row.returnId===unknownReturn.id).cost.totalHistoricalSaleCostIqd,null);
 assert.equal(initial.body.rows.find(row=>row.returnId===ambiguousReturn.id).cost.totalHistoricalSaleCostIqd,null);
 assert.equal(initial.body.rows.find(row=>row.returnId===unknownReturn.id).cost.unknownUnits,1);
 console.log('PASS return review: original lot/product cost, quarantine, unknown/ambiguous cost and exact discounted order refund ceiling');
 const json=JSON.stringify(initial.body);
 for(const privateText of ['CUSTOMER-PII-CANARY','07898765432','PRIVATE ADDRESS','PRIVATE RETURN NOTE','Private name','password','999999'])assert.equal(json.includes(privateText),false,privateText);
 assert.ok(initial.body.rows.some(row=>row.orderId===partial.id),'old sale with a new return belongs to this return period');
 assert.equal(initial.body.rows.some(row=>row.returnId===oldReturn.id),false);
 assert.equal((await get('range=all')).body.total,5,'all includes old event but still excludes future event');
 console.log('PASS return review: event-date scope, current ledger labeling and minimal private DTO');
 for(const query of ['range=5','range=7&range=30','page=1&page=2','page=0','page=-1','page=1.5','page=1e2','range=all&extra=x'])assert.equal((await get(query)).status,400,query);
 assert.equal((await get('page=99999')).status,409);
 const batch=await makeOrder({quantity:30,price:1000,cost:500});
 const timestamp=new Date(Date.now()-1000);
 for(let i=0;i<21;i++)await returned(batch,[{quantity:1}],timestamp,'page-return-'+String(i).padStart(2,'0'));
 const first=(await get('range=all&page=1')).body,second=(await get('range=all&page=2')).body;
 assert.equal(first.total,26);assert.equal(first.rows.length,20);assert.equal(second.rows.length,6);
 assert.equal(new Set([...first.rows,...second.rows].map(row=>row.returnId)).size,26);
 assert.deepEqual((await get('range=all&page=1')).body.rows.map(row=>row.returnId),first.rows.map(row=>row.returnId));
 assert.equal(first.rows.filter(row=>row.orderId===batch.id).every(row=>row.cost.totalHistoricalSaleCostIqd===500),true);
 console.log('PASS return review: strict query bounds and stable pagination for repeated documents without summing order money');
 const hashes=()=>Object.fromEntries(['','-wal'].filter(suffix=>existsSync(file+suffix)).map(suffix=>[suffix,createHash('sha256').update(readFileSync(file+suffix)).digest('hex')]));
 const before=hashes();assert.equal((await get('range=all')).status,200);assert.deepEqual(hashes(),before);
 assert.equal(await prisma.orderPaymentEvent.count(),2);assert.equal(await prisma.inventoryMovement.count(),0);assert.equal((await prisma.product.findUniqueOrThrow({where:{id:product.id}})).stock,10);
 console.log('PASS return review: byte-identical SQLite/WAL and unchanged money/stock on reads');
 await prisma.orderReturnLine.update({where:{id:(await prisma.orderReturnLine.findFirstOrThrow({where:{orderReturnId:partialReturn.id}})).id},data:{quantity:4}});
 assert.equal((await get('range=7')).status,409,'over-returned item must not produce plausible financial figures');
 await prisma.orderReturnLine.updateMany({where:{orderReturnId:partialReturn.id},data:{quantity:1}});
 await prisma.orderPaymentEvent.updateMany({where:{orderId:partial.id,kind:'refund'},data:{amountIqd:20001}});
 assert.equal((await get('range=7')).status,409,'refund cannot exceed actual collections');
 console.log('PASS return review: corrupt physical/financial ledgers fail closed');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill('SIGTERM');await ended;}
 if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});
});
