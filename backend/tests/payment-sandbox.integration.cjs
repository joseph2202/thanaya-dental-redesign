// Real restart, replay, rollback and role tests. All shop data AND the separate
// provider journal are synthetic files under an OS temporary preview root.
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {randomUUID,randomBytes,createHash,createHmac}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {paymentSandboxLocation}=require('../dist/lib/paymentSandboxGuard');
const cwd=path.resolve(__dirname,'..');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'thanaya-preview-')));
const shop=path.join(root,'preview.sqlite'),journalPath=path.join(root,'payment-sandbox.sqlite');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:'file:'+shop,THANAYA_PREVIEW_ROOT:root,
 THANAYA_PREVIEW_ONLY:'1',THANAYA_PAYMENT_SANDBOX:'1',THANAYA_PAYMENT_MOCK_SECRET:randomBytes(32).toString('hex'),
 JWT_SECRET:randomBytes(32).toString('hex'),THANAYA_UPLOAD_DIR:path.join(root,'uploads')};
let server,db,base,ownerPassword,logs='',passed=0;
const users={};
const jwt=require('jsonwebtoken');
const token=role=>jwt.sign({userId:users[role].id,role:'owner'},env.JWT_SECRET,{expiresIn:'1h'});
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function check(name,fn){await fn();passed++;console.log('PASS payment sandbox:',name);}
async function stop(){if(!server||server.exitCode!==null)return;const ended=new Promise(ok=>server.once('exit',ok));server.kill();await Promise.race([ended,wait(3000)]);if(server.exitCode===null){server.kill('SIGKILL');await ended;}}
async function start(extra={}){
 const probe=net.createServer();await new Promise((ok,no)=>probe.once('error',no).listen(0,'127.0.0.1',ok));
 const port=probe.address().port;await new Promise(ok=>probe.close(ok));base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,CORS_ALLOWED_ORIGINS:base,...extra,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs=(logs+chunk).slice(-4000));
 for(let i=0;i<90;i++){
  if(server.exitCode!==null)throw Error('API exited: '+logs);
  try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
  await wait(100);
 }
 throw Error('Isolated API did not start: '+logs);
}
async function call(route='',method='GET',body,role='owner',rawHeaders){
 const raw=Buffer.isBuffer(body);
 const response=await fetch(base+'/api/payment-sandbox'+route,{method,headers:{
  ...(role?{Authorization:'Bearer '+token(role)}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...rawHeaders
 },body:body!==undefined?(raw?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(12000)});
 return {status:response.status,body:await response.json(),headers:response.headers};
}
function signed(event){
 const raw=Buffer.isBuffer(event)?event:Buffer.from(JSON.stringify(event)),timestamp=String(Math.floor(Date.now()/1000));
 return {raw,headers:{'x-thanaya-mock-timestamp':timestamp,'x-thanaya-mock-signature':createHmac('sha256',Buffer.from(env.THANAYA_PAYMENT_MOCK_SECRET,'hex')).update(timestamp+'.').update(raw).digest('hex')}};
}
function providerEvent(reference){
 const file=new DatabaseSync(journalPath,{readOnly:true});
 try{
  const {requestId,updatedAt,refundRequests,...payment}=JSON.parse(file.prepare('SELECT record_json FROM provider_records WHERE reference=?').get(reference).record_json);
  return {...payment,eventId:'mock_evt_'+createHash('sha256').update(reference+':'+payment.sequence).digest('hex').slice(0,32),occurredAt:updatedAt};
 }finally{file.close();}
}
function editJournal(sql){const file=new DatabaseSync(journalPath);try{file.exec(sql);}finally{file.close();}}
const shopDigest=()=>{
 const hash=createHash('sha256').update(fs.readFileSync(shop));
 if(fs.existsSync(shop+'-wal'))hash.update(fs.readFileSync(shop+'-wal'));
 return hash.digest('hex');
};
async function main(){
 try{
  const init=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
  assert.equal(init.status,0,init.stderr+' '+init.stdout);
  const seed=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],{cwd,env,encoding:'utf8',timeout:45000});
  assert.equal(seed.status,0,seed.stderr);
  ownerPassword=seed.stdout.match(/^Password: ([^\r\n]+)/m)?.[1];assert.ok(ownerPassword);
  const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
  users.owner=await db.user.findFirst({where:{role:'owner'}});users.customer=await db.user.findFirst({where:{role:'customer'}});
  for(const role of ['admin','sales','inventory'])users[role]=await db.user.create({data:{role,name:'Sandbox '+role,
   email:role+'@sandbox.invalid',phone:'07811111111',password:'unused'}});
  const orders=await db.order.findMany({orderBy:{total:'desc'}}),order=orders[0];
  const baseline=shopDigest();await start();
  await check('guarded synthetic installation is owner-only and sends no-store even on rejection',async()=>{
   assert.equal(fs.existsSync(journalPath),false);
   for(const role of [null,'admin','sales','inventory','customer']){
    const denied=await call('','GET',undefined,role);assert.equal(denied.status,role?403:401);
    assert.equal(denied.headers.get('cache-control'),'no-store');
   }
   assert.equal(fs.existsSync(journalPath),false);
   const config=await call();assert.equal(config.status,200);assert.equal(config.body.enabled,true);
   assert.equal(config.body.realMoney,false);assert.equal(config.body.orders.length,2);
   assert.equal(JSON.stringify(config.body).includes('customerPhone'),false);
   assert.equal(fs.statSync(journalPath).mode&0o077,0);
  });
  const request={orderId:order.id,requestId:randomUUID()};let reference,pending;
  await check('amount comes from the server order; unknown/card/paid fields are rejected',async()=>{
   for(const change of [{amountIqd:1},{cvv:'SYNTHETIC-FORBIDDEN'},{paid:true},{actorId:users.owner.id}])
    assert.equal((await call('/intents','POST',{...request,...change})).status,400);
   const created=await call('/intents','POST',request);assert.equal(created.status,201,JSON.stringify(created.body));
   reference=created.body.payment.reference;pending=providerEvent(reference);
   assert.equal(created.body.payment.amountIqd,order.total);assert.equal(created.body.payment.currency,'IQD');
   assert.equal(created.body.payment.status,'pending');assert.equal(created.body.events.length,1);
   assert.equal(created.body.events[0].actorName,users.owner.name);
  });
  await check('concurrent create/replay persists one reference and rejects changed request contents',async()=>{
   const repeats=await Promise.all(Array.from({length:5},()=>call('/intents','POST',request)));
   assert.ok(repeats.every(r=>r.status===201&&r.body.payment.reference===reference));
   assert.equal((await call()).body.intents.length,1);
   assert.equal((await call('/intents','POST',{...request,orderId:orders[1].id})).status,409);
  });
  const route=()=>'/intents/'+reference;
  await check('authorization stays distinct; a missed payment webhook leaves local evidence unchanged',async()=>{
   const authorized=await call(route()+'/simulate','POST',{status:'authorized'});
   assert.equal(authorized.status,200,JSON.stringify(authorized.body));assert.equal(authorized.body.payment.status,'authorized');
   const missed=await call(route()+'/simulate','POST',{status:'paid',deliverWebhook:false});
   assert.equal(missed.status,200);assert.equal(missed.body.payment.status,'authorized');
   assert.equal(providerEvent(reference).status,'paid');assert.equal((await call(route())).body.events.length,2);
  });
  await check('provider and application evidence survive a real API restart; query recovers the missed webhook',async()=>{
   await stop();await start();
   assert.equal((await call(route())).body.payment.status,'authorized');
   const reconciled=await call(route()+'/reconcile','POST',{});
   assert.equal(reconciled.status,200,JSON.stringify(reconciled.body));assert.equal(reconciled.body.payment.status,'paid');
   assert.equal(reconciled.body.events.length,3);assert.equal(reconciled.body.events[2].source,'reconciliation');
  });
  await check('public webhook needs an exact fresh signature, with bounded body and no sensitive fields',async()=>{
   const event=providerEvent(reference),proof=signed(event),before=(await call(route())).body.events.length;
   assert.equal((await call('/webhook','POST',proof.raw,null,proof.headers)).status,200);
   const reordered=signed(Object.fromEntries(Object.entries(event).reverse()));
   assert.equal((await call('/webhook','POST',reordered.raw,null,reordered.headers)).status,200);
   const conflict=signed({...event,occurredAt:'2026-11-01T00:00:00.000Z'});
   assert.equal((await call('/webhook','POST',conflict.raw,null,conflict.headers)).status,409);
   assert.equal((await call('/webhook','POST',Buffer.concat([proof.raw,Buffer.from(' ')]),null,proof.headers)).status,401);
   assert.equal((await call('/webhook','POST',proof.raw,null)).status,401);
   const old={...proof.headers,'x-thanaya-mock-timestamp':String(Math.floor(Date.now()/1000)-301)};
   assert.equal((await call('/webhook','POST',proof.raw,null,old)).status,401);
   const forbidden=signed({...event,cvv:'SYNTHETIC-FORBIDDEN'});
   assert.equal((await call('/webhook','POST',forbidden.raw,null,forbidden.headers)).status,400);
   assert.equal((await call('/webhook','POST',Buffer.alloc(8193,32),null,proof.headers)).status,413);
   const fake=signed({...event,eventId:'fake_event',sequence:event.sequence+1,status:'refunded',refundedIqd:1});
   assert.equal((await call('/webhook','POST',fake.raw,null,fake.headers)).status,409);
   assert.equal((await call(route())).body.events.length,before);
  });
  await check('durable event receipts deduplicate replays and late callbacks, even after a restart',async()=>{
   const before=(await call(route())).body.events.length,proof=signed(pending);
   const late=await call('/webhook','POST',proof.raw,null,proof.headers);assert.equal(late.status,200);
   await stop();await start();
   const replay=await call('/webhook','POST',proof.raw,null,proof.headers);assert.equal(replay.status,200);
   const current=await call(route());assert.equal(current.body.payment.status,'paid');assert.equal(current.body.events.length,before);
  });
  const refundKey=randomUUID();
  await check('refund keys and cumulative amount remain stable across restart and reject excess',async()=>{
   const first=await call(route()+'/refunds','POST',{requestId:refundKey,amountIqd:20000});
   assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.payment.refundedIqd,20000);
   await stop();await start();
   const replay=await call(route()+'/refunds','POST',{requestId:refundKey,amountIqd:20000});
   assert.equal(replay.status,200);assert.equal(replay.body.payment.refundedIqd,20000);
   assert.equal(replay.body.events.length,first.body.events.length);
   assert.equal((await call(route()+'/refunds','POST',{requestId:refundKey,amountIqd:20001})).status,409);
   assert.equal((await call(route()+'/refunds','POST',{requestId:randomUUID(),amountIqd:order.total})).status,409);
  });
  await check('concurrent refund attempts cannot over-refund the simulated paid amount',async()=>{
   const attempts=await Promise.all([1,2].map(()=>call(route()+'/refunds','POST',{requestId:randomUUID(),amountIqd:80000})));
   assert.equal(attempts.filter(r=>r.status===200).length,1,JSON.stringify(attempts));
   assert.equal((await call(route())).body.payment.refundedIqd,100000);
   assert.equal((await call(route()+'/refunds','POST',{requestId:randomUUID(),amountIqd:60000})).status,200);
   assert.equal((await call(route()+'/refunds','POST',{requestId:randomUUID(),amountIqd:1})).status,409);
  });
  await check('receipt-storage failure rolls back local state and can be recovered by reconciliation',async()=>{
   const created=await call('/intents','POST',{orderId:orders[1].id,requestId:randomUUID()});assert.equal(created.status,201);
   const ref=created.body.payment.reference,url='/intents/'+ref;
   editJournal("CREATE TRIGGER reject_synthetic_receipt BEFORE INSERT ON event_receipts WHEN NEW.status='paid' BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END");
   const failed=await call(url+'/simulate','POST',{status:'paid'});assert.equal(failed.status,503);
   assert.equal((await call(url)).body.payment.status,'pending');assert.equal((await call(url)).body.events.length,1);
   assert.equal(providerEvent(ref).status,'paid');
   editJournal('DROP TRIGGER reject_synthetic_receipt');
   assert.equal((await call(url+'/reconcile','POST',{})).body.payment.status,'paid');
  });
  await check('owner controls still require real cookie CSRF; only the signed webhook has a separate trust path',async()=>{
   const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',
    Origin:base,'X-Thanaya-Auth-Mode':'cookie'},body:JSON.stringify({email:users.owner.email,password:ownerPassword})});
   assert.equal(login.status,200);
   const cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]);
   const proof=cookies.find(value=>value.startsWith('thanaya_csrf=')).slice('thanaya_csrf='.length);
   const requestBody=JSON.stringify(request);
   const post=headers=>fetch(base+'/api/payment-sandbox/intents',{method:'POST',headers:{'Content-Type':'application/json',
    Cookie:cookies.join('; '),Origin:base,...headers},body:requestBody});
   assert.equal((await post({})).status,403);
   assert.equal((await post({'X-Thanaya-CSRF':proof,Origin:'https://untrusted.invalid'})).status,403);
   assert.equal((await post({'X-Thanaya-CSRF':proof})).status,201);
  });
  await check('sandbox operations never modify the shop database, stock, cash or order status',async()=>{
   assert.equal(shopDigest(),baseline,'entire shop SQLite file is byte-identical');
   assert.equal(await db.orderPaymentEvent.count(),1);assert.equal(await db.storeExpense.count(),1);
   assert.equal((await db.order.findUnique({where:{id:order.id}})).status,order.status);
   assert.equal(fs.readFileSync(journalPath).includes(Buffer.from('SYNTHETIC-FORBIDDEN')),false);
  });
  await check('disabled and production environments cannot open or mutate the journal',async()=>{
   await stop();const before=createHash('sha256').update(fs.readFileSync(journalPath)).digest('hex');
   for(const extra of [{THANAYA_PAYMENT_SANDBOX:'0'},{NODE_ENV:'production'}]){
    await start(extra);assert.equal((await call()).body.enabled,false);
    assert.equal((await call('/intents','POST',request)).status,404);
    const proof=signed(pending);assert.equal((await call('/webhook','POST',proof.raw,null,proof.headers)).status,404);
    await stop();
   }
   assert.equal(createHash('sha256').update(fs.readFileSync(journalPath)).digest('hex'),before);
  });
  await check('guard rejects missing markers, public permissions, symlinks and non-preview DB locations',async()=>{
   for(const extra of [{DATABASE_URL:'file:'+path.join(cwd,'prisma/dev.db')},{THANAYA_PREVIEW_ONLY:'0'},
    {THANAYA_PAYMENT_MOCK_SECRET:'short'},{THANAYA_PREVIEW_ROOT:path.dirname(root)}])
    assert.throws(()=>paymentSandboxLocation({...env,...extra}),error=>error.code==='sandbox_disabled');
   const marker=path.join(root,'payment-sandbox.json'),saved=fs.readFileSync(marker);
   fs.unlinkSync(marker);assert.throws(()=>paymentSandboxLocation(env));fs.writeFileSync(marker,saved,{mode:0o600});
   fs.chmodSync(marker,0o644);assert.throws(()=>paymentSandboxLocation(env));fs.chmodSync(marker,0o600);
   fs.renameSync(journalPath,journalPath+'.saved');fs.symlinkSync(shop,journalPath);
   assert.throws(()=>paymentSandboxLocation(env));fs.unlinkSync(journalPath);fs.renameSync(journalPath+'.saved',journalPath);
   assert.equal(shopDigest(),baseline);
  });
  await check('an existing unknown SQLite file is never adopted or modified as a sandbox journal',async()=>{
   const {PaymentSandboxJournal}=require('../dist/lib/paymentSandboxJournal');
   const file=path.join(root,'unrelated.sqlite'),unknown=new DatabaseSync(file);
   unknown.exec("CREATE TABLE witness(value TEXT);INSERT INTO witness VALUES('preserve synthetic row')");unknown.close();
   const before=fs.readFileSync(file);
   await assert.rejects(PaymentSandboxJournal.open(file),error=>error.code==='unknown_journal');
   assert.deepEqual(fs.readFileSync(file),before);
  });
  console.log(`PAYMENT SANDBOX PASSED: ${passed} checks, no real database or payments`);
 }finally{await stop();if(db)await db.$disconnect();fs.rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});}
}
main().catch(error=>{console.error('PAYMENT SANDBOX FAILED',error);process.exitCode=1;});
