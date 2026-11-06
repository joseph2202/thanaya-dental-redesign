// Public catalog behavior against a new disposable SQLite database only.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {once}=require('node:events');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..'),temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-catalog-'));
const db='file:'+path.join(temp,'catalog.sqlite');
const env={...process.env,DATABASE_URL:db,JWT_SECRET:randomUUID()+randomUUID(),NODE_ENV:'test',THANAYA_UPLOAD_DIR:path.join(temp,'uploads')};
let server,prisma,failed=0;
async function freePort(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
async function check(name,action){try{await action();console.log('PASS:',name)}catch(e){failed++;console.error('FAIL:',name,e.message)}}
async function main(){
 const setup=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
 if(setup.status!==0)throw Error(setup.stderr||setup.stdout);
 process.env.DATABASE_URL=db;
 prisma=new (require('@prisma/client').PrismaClient)();
 const create=data=>prisma.product.create({data:{description:'Synthetic catalog fixture',usdPrice:0,icon:'Package',purchaseCostIqd:1000,...data}});
 const a=await create({name:'Composite shade A2',category:'حشوات تجريبية',brand:'Care Test',sku:'CI-REST-100',model:'A2-2026',price:15000,stock:3});
 const b=await create({name:'Composite shade B1',category:a.category,brand:a.brand,sku:'CI-REST-200',price:25000,stock:0});
 const c=await create({name:'Mirror',category:'فحص تجريبي',brand:'Exam Test',price:5000,stock:4,lotTracking:true,
  lots:{create:[{code:'EXPIRED-CATALOG',expiryDate:'2000-01-01',stock:4}]}});
 await create({name:'Hidden Composite',category:a.category,brand:a.brand,price:10000,stock:99,published:false});
 const port=await freePort(),base='http://127.0.0.1:'+port;
 let logs='';server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 for(const out of [server.stdout,server.stderr])out.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-5000)});
 for(let i=0;i<70;i++){
  if(server.exitCode!==null)throw Error('API exited: '+logs);
  try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(800)})).ok)break}catch{}
  if(i===69)throw Error('API not ready: '+logs);
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 const get=async query=>{const r=await fetch(base+'/api/products'+(query?'?'+query:''),{signal:AbortSignal.timeout(8000)});return{status:r.status,body:await r.json()}};
 const list=async params=>{const r=await get(new URLSearchParams(params).toString());assert.equal(r.status,200,JSON.stringify(r));return r.body};
 await check('category text search finds only published products',async()=>{
  assert.deepEqual((await list({search:'حشوات'})).map(p=>p.id).sort(),[a.id,b.id].sort());
 });
 await check('SKU, model, brand and description searches are preserved',async()=>{
  assert.deepEqual((await list({search:'ci-rest-100'})).map(p=>p.id),[a.id]);
  assert.deepEqual((await list({search:'A2-2026'})).map(p=>p.id),[a.id]);
  assert.equal((await list({search:'Care Test'})).length,2);
  assert.equal((await list({search:'Synthetic catalog fixture'})).length,3);
 });
 await check('combined category/brand/prices and both sort orders work',async()=>{
  assert.deepEqual((await list({category:a.category,brand:a.brand,minPrice:'15000',maxPrice:'25000',sort:'price-asc'})).map(p=>p.id),[a.id,b.id]);
  assert.deepEqual((await list({category:a.category,sort:'price-desc'})).map(p=>p.id),[b.id,a.id]);
  assert.deepEqual((await list({category:a.category,minPrice:'25000',maxPrice:'25000'})).map(p=>p.id),[b.id]);
  assert.equal((await list({minPrice:'0',maxPrice:'1000000000'})).length,3);
 });
 await check('public results keep expired-stock availability and supplier costs private',async()=>{
  const rows=await list({}),expired=rows.find(p=>p.id===c.id);
  assert.equal(rows.length,3);assert.equal(expired.stock,4);assert.equal(expired.availableStock,0);
  for(const row of rows)for(const key of ['purchaseCostIqd','costRevision','lots'])assert.equal(Object.hasOwn(row,key),false,key);
 });
 for(const field of ['search','category','brand','sort','minPrice','maxPrice'])await check('duplicate '+field+' is rejected instead of ignored/coerced',async()=>{
  const value={search:'Composite',category:a.category,brand:a.brand,sort:'price-asc',minPrice:'15000',maxPrice:'25000'}[field];
  const query=new URLSearchParams([[field,value],[field,value]]);
  assert.equal((await get(query.toString())).status,400);
 });
 for(const query of ['minPrice=1e3','minPrice=0x10','minPrice=-1','maxPrice=1.5','minPrice=1000000001',
  'minPrice=30000&maxPrice=10000','sort=__proto__','sort=price-up',
  new URLSearchParams({search:'ا'.repeat(101)}).toString(),
  new URLSearchParams({category:'ا'.repeat(91)}).toString(),
  new URLSearchParams({brand:'ا'.repeat(121)}).toString()])await check('invalid filter rejected: '+query.slice(0,65),async()=>{
  const r=await get(query);assert.equal(r.status,400);assert.equal(typeof r.body.error,'string');
 });
 await check('blank filters behave like the unfiltered catalog',async()=>{
  assert.equal((await list({search:'  ',category:' ',minPrice:'',maxPrice:'',sort:''})).length,3);
 });
 assert.equal(failed,0,failed+' catalog checks failed');
 console.log('ALL CATALOG CHECKS PASSED; disposable database removed.');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
 if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});
});
