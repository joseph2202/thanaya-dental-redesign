// Sanity checks for the *actual* preview seed used to show the shop on a Mac.
// All operations happen under a unique OS temp directory; never real dev.db.
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const {randomBytes}=require('node:crypto');
const cwd=path.resolve(__dirname,'..');
const root=mkdtempSync(path.join(os.tmpdir(),'thanaya-preview-'));
const url='file:'+path.join(root,'preview.sqlite');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,
 THANAYA_PREVIEW_ROOT:root,THANAYA_PREVIEW_ONLY:'1'};
let db,api;
async function openPort(){
 const server=net.createServer();
 await new Promise((done,fail)=>server.once('error',fail).listen(0,'127.0.0.1',done));
 const number=server.address().port;
 await new Promise(done=>server.close(done));
 return number;
}

async function main(){
 try{
  const check=spawnSync('bash',['-n',path.join(cwd,'../scripts/preview-local.sh')],
    {cwd,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  const install=spawnSync(path.join(cwd,'node_modules','.bin','prisma'),['db','push','--skip-generate'],
    {cwd,env,encoding:'utf8',timeout:90000});
  assert.equal(install.status,0,install.stderr+' '+install.stdout);
  const seed=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],
    {cwd,env,encoding:'utf8',timeout:45000});
  assert.equal(seed.status,0,seed.stderr+' '+seed.stdout);
  assert.match(seed.stdout,/THANAYA PRIVATE PREVIEW — DEMO ONLY/);
  process.env.DATABASE_URL=url;
  const {PrismaClient}=require('@prisma/client');
  db=new PrismaClient({datasources:{db:{url}}});
  assert.equal(await db.user.count(),2);
  assert.equal(await db.product.count(),3);
  assert.equal(await db.order.count(),2);
  assert.equal(await db.supplierInvoice.count(),1);
  assert.equal(await db.supplierPayment.count(),1);
  assert.equal(await db.orderItemCostSnapshot.count(),2);
  assert.equal(await db.storeExpense.count(),1);
  assert.equal(await db.cashAdjustment.count(),1);
  assert.equal(await db.orderPaymentEvent.count(),1);
  const bad=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],
    {cwd,env:{...env,THANAYA_PREVIEW_ONLY:'0'},encoding:'utf8',timeout:15000});
  assert.notEqual(bad.status,0,'must reject non-preview execution');
  const rerun=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],
    {cwd,env,encoding:'utf8',timeout:15000});
  assert.notEqual(rerun.status,0,'never overwrite an existing preview DB');
  // Regression for the exact Mac preview 3108 login failure. The preview
  // wrapper MUST explicitly allow the real browser origin, never a wildcard.
  const shell=readFileSync(path.join(cwd,'../scripts/preview-local.sh'),'utf8');
  const line=shell.match(/^export CORS_ALLOWED_ORIGINS=(.+)$/m);
  assert.ok(line,'preview wrapper must export trusted browser origins');
  const allowed=line[1].trim();
  assert.ok(allowed.split(',').includes('http://127.0.0.1:3108'));
  assert.ok(allowed.split(',').includes('http://localhost:3108'));
  assert.ok(!allowed.includes('*'));
  const password=seed.stdout.match(/^Password: ([^\\r\\n]+)$/m)?.[1];
  assert.ok(password,'seed must emit temporary owner password');
  const port=await openPort();
  const started={...env,PORT:String(port),JWT_SECRET:randomBytes(32).toString('hex'),
   CORS_ALLOWED_ORIGINS:allowed,THANAYA_UPLOAD_DIR:path.join(root,'uploads')};
  api=spawn(process.execPath,['dist/index.js'],{
   cwd,env:started,stdio:['ignore','pipe','pipe']
  });
  let diagnostic='';
  for(const stream of [api.stdout,api.stderr])
   stream.on('data',part=>diagnostic=(diagnostic+String(part)).slice(-2500));
  const base='http://127.0.0.1:'+port;
  let healthy=false;
  for(let i=0;i<80;i++){
   if(api.exitCode!==null)throw Error('isolated preview API died: '+diagnostic);
   try{
    const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)});
    if(response.ok){healthy=true;break;}
   }catch{}
   await new Promise(done=>setTimeout(done,180));
  }
  assert.ok(healthy,'isolated preview backend starts: '+diagnostic);
  const login=async origin=>fetch(base+'/api/auth/login',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Thanaya-Auth-Mode':'cookie',Origin:origin},
   body:JSON.stringify({email:'preview-owner@thanaya.local',password}),
   signal:AbortSignal.timeout(8000)
  });
  const refused=await login('http://127.0.0.1:3109');
  assert.equal(refused.status,403,'other ports must remain forbidden');
  assert.match((await refused.json()).error,/مصدر طلب/);
  for(const origin of ['http://127.0.0.1:3108','http://localhost:3108']){
   const accepted=await login(origin);
   assert.equal(accepted.status,200,
    'preview login from '+origin+' should succeed, not 403');
   const payload=await accepted.json();
   assert.equal(payload.user.role,'owner');
   assert.equal(Object.hasOwn(payload,'token'),false,'never return JWT to JS');
   const cookies=accepted.headers.getSetCookie();
   assert.equal(cookies.length,2,'issue session and CSRF cookies on preview');
   const cookieHeader=cookies.map(x=>x.split(';')[0]).join('; ');
   const who=await fetch(base+'/api/auth/me',{headers:{Cookie:cookieHeader}});
   assert.equal(who.status,200,'protected session must be usable on preview');
   assert.equal((await who.json()).role,'owner');
  }
  console.log('PASS preview: 3108 owner cookie login works; other ports denied; no real DB modified');
 }finally{
  if(api&&api.exitCode===null)api.kill('SIGTERM');
  if(db)await db.$disconnect();
  rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 }
}
main().catch(e=>{console.error('PREVIEW SMOKE FAILED',e);process.exitCode=1;});
