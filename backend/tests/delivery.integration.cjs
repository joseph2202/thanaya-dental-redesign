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
 const publicBefore=await eq('public can load disabled delivery','/api/delivery/public','GET',null,null,200);
 assert.equal(publicBefore.body.enabled,false);
 await eq('customer cannot change delivery','/api/delivery','PUT',{},toks.customer,403);
 await eq('admin cannot change delivery','/api/delivery','PUT',{},toks.admin,403);
 const rates=publicBefore.body.rates.map(r=>({...r,fee:r.province==='البصرة'?5000:0,available:r.province==='البصرة'}));
 await eq('invalid delivery fees rejected','/api/delivery','PUT',{enabled:true,revision:0,rates:rates.map(r=>r.province==='البصرة'?{...r,fee:-1}:r)},toks.owner,400);
 await eq('owner saves delivery settings','/api/delivery','PUT',{enabled:true,revision:0,rates},toks.owner,200);
 await eq('stale delivery settings rejected','/api/delivery','PUT',{enabled:true,revision:0,rates},toks.owner,409);
 const prod=await prisma.product.create({data:{name:'Delivery item',description:'test',price:20000,usdPrice:1,stock:3,category:'Test',brand:'Test',icon:'Box'}});
 const mkbody=city=>({requestId:randomUUID(),items:[{productId:prod.id,quantity:1}],customer:{name:'مشتري تجريبي',phone:'07812345678',address:'شارع تجريبي رقم 11',city}});
 await eq('unavailable governorate cannot checkout','/api/orders','POST',mkbody('بغداد'),toks.customer,400);
 const order=await eq('server computes delivery in order','/api/orders','POST',{...mkbody('البصرة'),total:1,shippingFee:0},toks.customer,201);
 assert.equal(order.body.total,25000);assert.equal(order.body.subtotal,20000);assert.equal(order.body.shippingFee,5000);
 assert.equal((await prisma.product.findUniqueOrThrow({where:{id:prod.id}})).stock,2);
 assert.equal(await prisma.deliverySettingsChange.count(),1);
 console.log('PASS: server owns delivery price and order snapshot');
 console.log('ALL DELIVERY CHECKS PASSED. TEMP DB REMOVED.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server&&server.exitCode===null)server.kill('SIGTERM');if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});});
