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
 await eq('customer cannot view users','/api/users','GET',null,toks.customer,403);
 await eq('admin cannot assign roles','/api/users/'+customer.id+'/role','PATCH',{role:'admin'},toks.admin,403);
 await eq('inventory cannot assign roles','/api/users/'+customer.id+'/role','PATCH',{role:'admin'},toks.inventory,403);
 await eq('owner cannot change own role','/api/users/'+owner.id+'/role','PATCH',{role:'customer'},toks.owner,403);
 await eq('owner cannot demote owner','/api/users/'+owner.id+'/role','PATCH',{role:'admin'},toks.admin,403);
 await eq('owner cannot create second owner','/api/users/'+customer.id+'/role','PATCH',{role:'owner'},toks.owner,400);
 await eq('inventory cannot edit product prices','/api/products','POST',{name:'x'},toks.inventory,403);
 await eq('sales cannot edit product prices','/api/products','POST',{name:'x'},toks.sales,403);
 await eq('sales can list orders','/api/orders','GET',null,toks.sales,200);
 await eq('inventory cannot list all orders','/api/orders','GET',null,toks.inventory,403);
 await eq('inventory can view stock via endpoint','/api/products/missing/inventory','GET',null,toks.inventory,404);
 await eq('sales cannot adjust stock','/api/products/missing/stock-adjustment','POST',{delta:1,reason:'test'},toks.sales,403);
 await eq('admin can view users','/api/users','GET',null,toks.admin,200);
 await eq('customer cannot view role history','/api/users/role-history','GET',null,toks.customer,403);
 await eq('owner can assign sales','/api/users/'+customer.id+'/role','PATCH',{role:'sales'},toks.owner,200);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:customer.id}})).role,'sales');
 assert.equal(await prisma.roleChange.count({where:{targetId:customer.id,actorId:owner.id,previousRole:'customer',newRole:'sales'}}),1);
 await eq('previous customer token gets new DB role','/api/orders','GET',null,toks.customer,200);
 console.log('ALL ROLE SECURITY CHECKS PASSED. TEMP DB REMOVED.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server&&server.exitCode===null)server.kill('SIGTERM');if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});});
