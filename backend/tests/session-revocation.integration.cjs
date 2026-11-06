// Real auth/logout/replay, restart and storage-failure behavior on temp SQLite.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {once}=require('node:events');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..'),temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-session-'));
const db='file:'+path.join(temp,'sessions.sqlite'),secret=randomUUID()+randomUUID();
const env={...process.env,DATABASE_URL:db,JWT_SECRET:secret,NODE_ENV:'test',THANAYA_UPLOAD_DIR:path.join(temp,'uploads')};
let server,prisma;
async function port(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
async function stop(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill('SIGTERM');await ended;}}
async function start(p){
 let logs='';server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(p),CORS_ALLOWED_ORIGINS:'http://127.0.0.1:'+p},stdio:['ignore','pipe','pipe']});
 for(const s of [server.stdout,server.stderr])s.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-3000)});
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error('API exited: '+logs);
  try{if((await fetch('http://127.0.0.1:'+p+'/api/health',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,120));
 }
 throw Error('API did not start: '+logs);
}
async function main(){
 const setup=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
 if(setup.status!==0)throw Error(setup.stderr||setup.stdout);
 process.env.DATABASE_URL=db;prisma=new (require('@prisma/client').PrismaClient)({datasources:{db:{url:db}}});
 const p=await port(),base='http://127.0.0.1:'+p;await start(p);
 const call=async(route,{method='GET',data,token,headers={}}={})=>{
  const r=await fetch(base+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},
   body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(12000)});
  const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null,headers:r.headers};
 };
 const credentials={email:'session-'+randomUUID()+'@test.invalid',password:'SyntheticSession#2026'};
 const registration=await call('/api/auth/register',{method:'POST',data:{...credentials,name:'Synthetic session buyer',phone:'07812345678'}});
 assert.equal(registration.status,200);const token=registration.body.token;
 assert.equal((await call('/api/auth/me',{token})).status,200);
 const upper=await call('/API/AUTH/me',{token});assert.equal(upper.status,200,'case-insensitive Express route is real');
 assert.equal(upper.headers.get('cache-control'),'no-store','path casing cannot bypass private cache headers');
 assert.equal((await call('/api/auth/logout',{method:'POST',token,headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await call('/api/auth/me',{token})).status,200,'foreign-origin logout cannot revoke');
 const logout=await call('/api/auth/logout',{method:'POST',token,headers:{Origin:base}});assert.equal(logout.status,204);
 assert.equal((await call('/api/auth/me',{token})).status,401,'replayed token must be rejected after logout');
 assert.equal((await call('/API/AUTH/me',{token})).status,401,'path casing must not bypass revocation');
 assert.equal((await call('/api/orders/mine',{token})).status,401);
 assert.equal((await call('/api/products/manage',{token})).status,401);
 assert.equal((await call('/api/addresses',{token})).status,401);
 assert.equal((await call('/api/products')).status,200,'anonymous public catalog remains available');
 console.log('PASS: bearer logout rejects replay across customer/staff/API paths and preserves public access');

 const login=async(cookie=false)=>call('/api/auth/login',{method:'POST',data:credentials,headers:cookie?{Origin:base,'X-Thanaya-Auth-Mode':'cookie'}:{}});
 const a=await login(),b=await login();assert.equal(a.status,200);assert.equal(b.status,200);
 assert.notEqual(a.body.token,b.body.token,'each login has a unique session even in the same second');
 assert.equal(typeof require('jsonwebtoken').decode(a.body.token).jti,'string');
 await call('/api/auth/logout',{method:'POST',token:a.body.token,headers:{Origin:base}});
 assert.equal((await call('/api/auth/me',{token:a.body.token})).status,401);
 assert.equal((await call('/api/auth/me',{token:b.body.token})).status,200,'one logout must not revoke another device');
 await stop();await start(p);
 assert.equal((await call('/api/auth/me',{token:a.body.token})).status,401);
 assert.equal((await call('/api/auth/me',{token:b.body.token})).status,200);
 assert.equal((await call('/api/auth/logout',{method:'POST',token:a.body.token,headers:{Origin:base}})).status,204,'repeat logout is idempotent');
 console.log('PASS: unique independent sessions and persisted revocation across API restart');

 const cookieLogin=await login(true);assert.equal(cookieLogin.status,200);assert.equal(Object.hasOwn(cookieLogin.body,'token'),false);
 const set=cookieLogin.headers.getSetCookie(),cookie=set.map(v=>v.split(';')[0]).join('; ');
 const csrf=set.find(v=>v.startsWith('thanaya_csrf=')).split(';')[0].slice('thanaya_csrf='.length);
 const stolen=set.find(v=>v.startsWith('thanaya_session=')).split(';')[0].slice('thanaya_session='.length);
 assert.equal((await call('/api/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:base}})).status,403);
 assert.equal((await call('/api/auth/me',{headers:{Cookie:cookie}})).status,200);
 const cookieOut=await call('/api/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-Thanaya-CSRF':csrf}});
 assert.equal(cookieOut.status,204);assert.equal(cookieOut.headers.getSetCookie().length,2);
 assert.equal((await call('/api/auth/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await call('/api/auth/me',{token:stolen})).status,401,'cookie cannot be replayed as bearer after logout');
 console.log('PASS: Cookie/CSRF logout persists revocation for both cookie and bearer replay');

 // Tokens issued before this feature have no jti. Revoke the exact credential
 // by hash too, instead of silently exempting all legacy credentials.
 const legacy=require('jsonwebtoken').sign({userId:registration.body.user.id,role:'customer'},secret,{expiresIn:'1h'});
 assert.equal((await call('/api/auth/me',{token:legacy})).status,200);
 assert.equal((await call('/api/auth/logout',{method:'POST',token:legacy,headers:{Origin:base}})).status,204);
 assert.equal((await call('/api/auth/me',{token:legacy})).status,401);
 const future=require('jsonwebtoken').sign({userId:registration.body.user.id,nbf:Math.floor(Date.now()/1000)+60},secret,{expiresIn:'1h'});
 assert.equal((await call('/API/AUTH/logout/',{method:'POST',token:future,headers:{Origin:base}})).status,204);
 assert.ok(await prisma.revokedSession.findUnique({where:{tokenHash:createHash('sha256').update(future).digest('hex')}}),'signed future credential is also recorded, so it cannot reactivate at nbf');
 const noExpiry=require('jsonwebtoken').sign({userId:registration.body.user.id},secret);
 assert.equal((await call('/api/auth/logout',{method:'POST',token:noExpiry,headers:{Origin:base}})).status,204);
 assert.equal((await call('/api/auth/me',{token:noExpiry})).status,401);
 const hashes=await prisma.revokedSession.findMany();
 assert.ok(hashes.some(row=>row.tokenHash===createHash('sha256').update(stolen).digest('hex')));
 assert.ok(hashes.every(row=>/^[a-f0-9]{64}$/.test(row.tokenHash)&&!JSON.stringify(row).includes(stolen)));
 console.log('PASS: old credentials are revocable and only one-way digests are stored');

 // A broken/missing journal must deny access and must not falsely claim that
 // logout succeeded. Cookie clearing happens only after durable revocation.
 await prisma.$executeRawUnsafe('ALTER TABLE "RevokedSession" RENAME TO "RevokedSessionUnavailable"');
 assert.equal((await call('/api/auth/me',{token:b.body.token})).status,503);
 const unavailable=await call('/api/auth/logout',{method:'POST',token:b.body.token,headers:{Origin:base}});
 assert.equal(unavailable.status,503);assert.equal(unavailable.headers.getSetCookie().length,0);
 const count=await prisma.user.count();
 assert.equal((await login()).status,503);
 const deniedSignup=await call('/api/auth/register',{method:'POST',data:{...credentials,email:'blocked-'+randomUUID()+'@test.invalid',name:'No partial signup',phone:'07812345678'}});
 assert.equal(deniedSignup.status,503);assert.equal(await prisma.user.count(),count);
 assert.equal((await call('/api/products')).status,200);
 await prisma.$executeRawUnsafe('ALTER TABLE "RevokedSessionUnavailable" RENAME TO "RevokedSession"');
 assert.equal((await call('/api/auth/me',{token:b.body.token})).status,200);
 console.log('PASS: unavailable journal fails closed without issuing cookies or creating a partial account');

 await prisma.revokedSession.create({data:{tokenHash:'0'.repeat(64),userId:registration.body.user.id,expiresAt:new Date('2000-01-01')}});
 assert.equal((await call('/api/auth/logout',{method:'POST',token:b.body.token,headers:{Origin:base}})).status,204);
 assert.equal(await prisma.revokedSession.count({where:{tokenHash:'0'.repeat(64)}}),0);
 assert.equal((await call('/api/auth/logout',{method:'POST',headers:{Origin:base}})).status,204,'anonymous clear remains safe');
 console.log('PASS: expired digests are pruned and anonymous logout remains compatible');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 await stop();if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});
});
