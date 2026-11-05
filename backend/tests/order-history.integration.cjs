// Real API and rollback checks on disposable SQLite only. Never uses dev.db.
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..');
const temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-order-history-'));
const url='file:'+path.join(temp,'isolated.sqlite'),secret=randomUUID()+randomUUID();
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,JWT_SECRET:secret,
 THANAYA_UPLOAD_DIR:path.join(temp,'uploads')};
let db,server,logs='',passed=0;
async function port(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
async function check(name,fn){await fn();passed++;console.log('PASS order history:',name);}
async function main(){
 try{
  const init=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],
   {cwd,env,encoding:'utf8',timeout:90000});
  assert.equal(init.status,0,init.stderr+' '+init.stdout);
  process.env.DATABASE_URL=url;
  const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
  db=new PrismaClient({datasources:{db:{url}}});
  assert.equal(await db.user.count(),0);
  const users={};
  for(const role of ['owner','admin','sales','inventory','customer'])users[role]=await db.user.create({data:{
   name:'Audit '+role,email:role+'@history.invalid',phone:'07811111111',password:'unused',role
  }});
  const token=role=>jwt.sign({userId:users[role].id,role:'owner'},secret,{expiresIn:'1h'});
  const product=await db.product.create({data:{name:'History fixture',description:'Synthetic only',
   price:10000,usdPrice:1,category:'Test',brand:'Test',icon:'Package',stock:30}});
  const p=await port(),base='http://127.0.0.1:'+p;
  server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(p)},stdio:['ignore','pipe','pipe']});
  for(const out of [server.stdout,server.stderr])out.on('data',chunk=>logs=(logs+chunk).slice(-4000));
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error('Isolated API exited: '+logs);
   try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(700)})).ok)break;}catch{}
   if(i===79)throw Error('Isolated API not ready');
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  const call=async(route,method='GET',body,role='owner')=>{
   const response=await fetch(base+route,{method,headers:{
    ...(role?{Authorization:'Bearer '+token(role)}:{}),...(body?{'Content-Type':'application/json'}:{})
   },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
   return {status:response.status,body:await response.json(),headers:response.headers};
  };
  const basket=(quantity=1,requestId=randomUUID())=>({requestId,
   customer:{name:'Synthetic buyer',phone:'07811111111',city:'البصرة',address:'عنوان صناعي لا يخص زبوناً'},
   items:[{productId:product.id,quantity}]});
  let placed;
  await check('checkout atomically records its authenticated actor and keeps evidence private',async()=>{
   const response=await call('/api/orders','POST',basket(3),'customer');
   assert.equal(response.status,201,JSON.stringify(response));placed=response.body;
   assert.equal(Object.hasOwn(placed,'statusEvents'),false);
   const events=await db.orderStatusEvent.findMany({where:{orderId:placed.id}});
   assert.equal(events.length,1);assert.equal(events[0].actorId,users.customer.id);
   assert.equal(events[0].actorRole,'customer');assert.equal(events[0].kind,'placed');
   assert.equal(events[0].fromStatus,null);assert.equal(events[0].toStatus,'pending');
   assert.equal((await db.product.findUnique({where:{id:product.id}})).stock,27);
  });
  const history='/api/orders/'+placed.id+'/history',status='/api/orders/'+placed.id+'/status';
  await check('history is restricted to sales/admin/owner and never leaks contact or cost data',async()=>{
   for(const role of [null,'customer','inventory']){
    const response=await call(history,'GET',undefined,role);
    assert.equal(response.status,role?403:401);assert.equal(response.headers.get('cache-control'),'no-store');
   }
   for(const role of ['owner','admin','sales']){
    const response=await call(history,'GET',undefined,role);assert.equal(response.status,200);
    assert.equal(response.body.completeFromCreation,true);assert.equal(response.body.events.length,1);
    assert.equal(Object.hasOwn(response.body.order,'customerPhone'),false);
    assert.equal(Object.hasOwn(response.body.events[0],'actorId'),false);
   }
   assert.equal((await call(history+'?unexpected=1')).status,400);
  });
  await check('staff evidence is server-owned and preserves the role/name at action time',async()=>{
   const forged=await call(status,'PATCH',{status:'confirmed',actorId:users.owner.id},'sales');
   assert.equal(forged.status,400);
   assert.equal((await call(status,'PATCH',{status:'confirmed',reason:'تأكيد مراجعة الطلب'},'sales')).status,200);
   await db.user.update({where:{id:users.sales.id},data:{name:'Renamed staff',role:'inventory'}});
   const events=(await call(history)).body.events;
   assert.equal(events.at(-1).actorName,'Audit sales');assert.equal(events.at(-1).actorRole,'sales');
   assert.equal((await call(status,'PATCH',{status:'shipped'},'sales')).status,403);
   await db.user.update({where:{id:users.sales.id},data:{role:'sales'}});
   assert.equal((await call(status,'PATCH',{status:'confirmed'},'sales')).status,409);
   assert.equal(await db.orderStatusEvent.count({where:{orderId:placed.id}}),2);
  });
  await check('partial return keeps the state; full item receipt records exactly one final transition',async()=>{
   for(const next of ['shipped','delivered'])assert.equal((await call(status,'PATCH',{status:next},'sales')).status,200);
   const returns='/api/orders/'+placed.id+'/returns';
   const first={requestId:randomUUID(),reason:'استلام قطعة موثقة',items:[{orderItemId:placed.items[0].id,quantity:1}]};
   assert.equal((await call(returns,'POST',first,'sales')).status,403);
   assert.equal((await call(returns,'POST',first)).status,201);
   assert.equal(await db.orderStatusEvent.count({where:{orderId:placed.id}}),4);
   const last={requestId:randomUUID(),reason:'استلام بقية الطلب بالكامل',items:[{orderItemId:placed.items[0].id,quantity:2}]};
   const done=await call(returns,'POST',last);assert.equal(done.status,201,JSON.stringify(done));
   assert.equal((await call(returns,'POST',last)).status,200);
   const events=(await call(history)).body.events;
   assert.equal(events.length,5);assert.equal(events.at(-1).kind,'full_return');
   assert.equal(events.at(-1).fromStatus,'delivered');assert.equal(events.at(-1).toStatus,'returned');
   assert.equal(events.at(-1).referenceId,done.body.returnEvent.id);
   assert.equal(await db.orderPaymentEvent.count({where:{orderId:placed.id}}),0,'state/return do not imply money');
  });
  await check('simultaneous status updates cannot duplicate evidence or notifications',async()=>{
   const order=await call('/api/orders','POST',basket(),'customer');assert.equal(order.status,201);
   const route='/api/orders/'+order.body.id+'/status';
   const results=await Promise.all([call(route,'PATCH',{status:'confirmed'},'sales'),call(route,'PATCH',{status:'confirmed'},'sales')]);
   assert.equal(results.filter(r=>r.status===200).length,1,JSON.stringify(results));
   assert.equal(await db.orderStatusEvent.count({where:{orderId:order.body.id,kind:'status_changed'}}),1);
   assert.equal(await db.notification.count({where:{orderId:order.body.id,kind:'order_status'}}),1);
  });
  await check('checkout retries produce one persisted placement event',async()=>{
   const body=basket();
   const results=await Promise.all([call('/api/orders','POST',body,'customer'),call('/api/orders','POST',body,'customer')]);
   const saved=results.find(r=>r.status===201||r.status===200);assert.ok(saved,JSON.stringify(results));
   assert.equal((await call('/api/orders','POST',body,'customer')).status,200);
   assert.equal(await db.orderStatusEvent.count({where:{orderId:saved.body.id}}),1);
  });
  await check('legacy orders disclose missing history instead of fabricating past actors',async()=>{
   const old=await db.order.create({data:{customerName:'Legacy fixture',customerPhone:'07811111111',
    customerAddress:'Synthetic',customerCity:'Basrah',total:0,status:'pending'}});
   const route='/api/orders/'+old.id;
   const before=await call(route+'/history');assert.equal(before.body.events.length,0);
   assert.equal(before.body.completeFromCreation,false);assert.equal(before.body.recordedOnly,true);
   assert.equal((await call(route+'/status','PATCH',{status:'confirmed'})).status,200);
   const after=await call(route+'/history');assert.equal(after.body.events.length,1);
   assert.equal(after.body.completeFromCreation,false);
  });
  await check('an audit storage failure rolls back cancellation, restored stock and notification together',async()=>{
   const order=await call('/api/orders','POST',basket(),'customer');assert.equal(order.status,201);
   const beforeStock=(await db.product.findUnique({where:{id:product.id}})).stock;
   const beforeMovements=await db.inventoryMovement.count({where:{referenceId:order.body.id}});
   await db.$executeRawUnsafe(`CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON "OrderStatusEvent" BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`);
   try{
    const response=await call('/api/orders/'+order.body.id+'/status','PATCH',{status:'cancelled'});
    assert.notEqual(response.status,200);
   }finally{await db.$executeRawUnsafe('DROP TRIGGER synthetic_audit_failure');}
   assert.equal((await db.order.findUnique({where:{id:order.body.id}})).status,'pending');
   assert.equal((await db.product.findUnique({where:{id:product.id}})).stock,beforeStock);
   assert.equal(await db.inventoryMovement.count({where:{referenceId:order.body.id}}),beforeMovements);
   assert.equal(await db.orderStatusEvent.count({where:{orderId:order.body.id}}),1);
   assert.equal(await db.notification.count({where:{orderId:order.body.id,kind:'order_status'}}),0);
  });
  await check('Prisma-generated schema is compatible with the read-only migration rehearsal',async()=>{
   const before=readFileSync(path.join(temp,'isolated.sqlite'));
   const result=spawnSync('python3',['scripts/rehearse_order_history.py','--source',path.join(temp,'isolated.sqlite')],
    {cwd,env:{...env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:15000});
   assert.equal(result.status,0,result.stderr+' '+result.stdout);
   assert.match(result.stdout,/SOURCE UNCHANGED/);
   assert.deepEqual(readFileSync(path.join(temp,'isolated.sqlite')),before);
  });
  console.log('ORDER HISTORY: '+passed+' isolated checks passed');
 }finally{
  if(server&&server.exitCode===null)server.kill('SIGTERM');
  if(db)await db.$disconnect();
  rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
