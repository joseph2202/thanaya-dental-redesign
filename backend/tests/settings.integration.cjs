// Security integration tests use a throwaway SQLite database; NEVER your dev.db.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const cwd=path.resolve(__dirname,'..'),temp=mkdtempSync(path.join(os.tmpdir(),'thanaya-roles-'));
const db='file:'+path.join(temp,'isolated.db'),secret=randomUUID()+randomUUID();
const env={...process.env,DATABASE_URL:db,JWT_SECRET:secret,NODE_ENV:'test'};
let server,prisma;
async function port(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
async function call(base,route,method='GET',body,token){let x=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});return {status:x.status,body:await x.json()};}
async function main(){
 const cmd=spawnSync(path.join(cwd,'node_modules/.bin/prisma'),['db','push','--skip-generate'],{cwd,env,encoding:'utf8',timeout:90000});
 if(cmd.status!==0)throw Error(cmd.stderr||cmd.stdout);
 process.env.DATABASE_URL=db;
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 prisma=new PrismaClient();
 const mk=async(role,email)=>prisma.user.create({data:{name:role,email,phone:'07812345678',password:'unused',role}});
 const owner=await mk('owner','owner@roles.invalid'),admin=await mk('admin','admin@roles.invalid'),inventory=await mk('inventory','inventory@roles.invalid'),sales=await mk('sales','sales@roles.invalid'),customer=await mk('customer','customer@roles.invalid');
 const token=u=>jwt.sign({userId:u.id,role:'admin'},secret,{expiresIn:'1h'}); // forged role MUST NOT elevate.
 const toks={owner:token(owner),admin:token(admin),inventory:token(inventory),sales:token(sales),customer:token(customer)};
 const p=await port(),base='http://127.0.0.1:'+p;
 let logs='';
 server=spawn(process.execPath,['dist/index.js'],{cwd,env:{...env,PORT:String(p)},stdio:['ignore','pipe','pipe']});
 for(const out of [server.stdout,server.stderr])out.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-5000)});
 for(let k=0;k<70;k++){if(server.exitCode!==null)throw Error('Server died '+logs);try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(800)})).ok)break}catch{}await new Promise(r=>setTimeout(r,200));if(k===69)throw Error('Server not ready '+logs);}
 const eq=async(desc,route,method,body,t,expected)=>{const r=await call(base,route,method,body,t);assert.equal(r.status,expected,desc+': '+JSON.stringify(r));console.log('PASS:',desc);return r;};
 const url='/api/settings',original=await call(base,url+'/public');
 assert.equal(original.status,200);assert.equal(original.body.usdToIqdRate,null);
 console.log('PASS: public settings have no implied FX rate');
 await eq('customer cannot save store settings',url,'PUT',{siteName:'hacked'},toks.customer,403);
 await eq('admin cannot save store settings',url,'PUT',{siteName:'hacked'},toks.admin,403);
 await eq('inventory cannot save store settings',url,'PUT',{siteName:'hacked'},toks.inventory,403);
 await eq('sales cannot save store settings',url,'PUT',{siteName:'hacked'},toks.sales,403);
 const values={...original.body,siteName:'ثنايا الطبي',siteDescription:'أدوات الأسنان',phone:'07822088894',email:'info@thanaya.iq',address:'البصرة',workingHours:'السبت - الخميس',usdToIqdRate:1500,showUsdApprox:true,revision:0};
 await eq('owner input validation prevents invalid exchange rate',url,'PUT',{...values,usdToIqdRate:0},toks.owner,400);
 await eq('negative exchange rate rejected',url,'PUT',{...values,usdToIqdRate:-1},toks.owner,400);
 await eq('owner cannot enable USD with no exchange rate',url,'PUT',{...values,usdToIqdRate:null},toks.owner,400);
 await eq('owner saves central settings',url,'PUT',{...values,usdToIqdRate:150},toks.owner,200);
 const after=await eq('public settings reflect saved data',url+'/public','GET',null,null,200);
 assert.equal(after.body.siteName,'ثنايا الطبي');assert.equal(after.body.usdToIqdRate,150);
 assert.equal(await prisma.storeSettingsChange.count(),1);
 await eq('stale settings revision is rejected',url,'PUT',values,toks.owner,409);
 assert.equal(await prisma.storeSettingsChange.count(),1);
 const saved=await prisma.storeSettings.findUniqueOrThrow({where:{id:'main'}});
 assert.equal(saved.revision,1);
 console.log('PASS: setting changes audited; IQD products and orders not modified');
 console.log('ALL SETTINGS CHECKS PASSED. TEMP DB REMOVED.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server&&server.exitCode===null)server.kill('SIGTERM');if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});});
