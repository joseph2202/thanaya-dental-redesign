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
 const created=await eq('admin creates percent coupon','/api/coupons','POST',{code:'DENTAL10',kind:'percent',discount:10,minSubtotal:10000,maxUses:1,expiresAt:null},toks.admin,201);
 const code=created.body.code;
 const item=await prisma.product.create({data:{name:'Coupon item',description:'test',price:25000,usdPrice:1,category:'test',brand:'test',icon:'Box',stock:4}});
 const lines=[{productId:item.id,quantity:1}],customerData={name:'Test Customer',phone:'07812345678',address:'Basrah street 123',city:'البصرة'};
 const preview=await eq('public coupon quote from server','/api/coupons/preview','POST',{code,items:lines},null,200);
 assert.equal(preview.body.discount,2500);
 await eq('expired coupon rejected on quote','/api/coupons/preview','POST',{code:'NOTFOUND',items:lines},null,409);
 await eq('customer cannot create coupon','/api/coupons','POST',{code:'HACK',kind:'percent',discount:90,minSubtotal:0,maxUses:null,expiresAt:null},toks.customer,403);
 const reqId=randomUUID(),data={requestId:reqId,items:lines,customer:customerData,couponCode:code,total:1,discountAmount:24999};
 const ordered=await eq('server calculates coupon total','/api/orders','POST',data,toks.customer,201);
 assert.equal(ordered.body.total,22500);assert.equal(ordered.body.discountAmount,2500);
 assert.equal(ordered.body.couponCode,code);
 assert.equal(await prisma.coupon.count({where:{code,usedCount:1}}),1);
 const retried=await eq('repeated request id returns original order','/api/orders','POST',data,toks.customer,200);
 assert.equal(retried.body.id,ordered.body.id);
 assert.equal(await prisma.coupon.count({where:{code,usedCount:1}}),1);
 assert.equal((await prisma.product.findUniqueOrThrow({where:{id:item.id}})).stock,3);
 await eq('coupon limit blocks second checkout','/api/orders','POST',{...data,requestId:randomUUID()},toks.customer,409);
 assert.equal((await prisma.product.findUniqueOrThrow({where:{id:item.id}})).stock,3);
 await eq('discounted used coupon cannot be deleted','/api/coupons/'+created.body.id,'DELETE',null,toks.admin,409);
 const fixed=await eq('admin creates fixed coupon','/api/coupons','POST',{code:'FIXED5000',kind:'fixed',discount:5000,minSubtotal:0,maxUses:null,expiresAt:null},toks.admin,201);
 const fixedQuote=await eq('fixed discount preview','/api/coupons/preview','POST',{code:fixed.body.code,items:lines},null,200);
 assert.equal(fixedQuote.body.discount,5000);
 const capped=await eq('fixed discount cannot exceed product subtotal','/api/coupons','POST',{code:'ALLFREE',kind:'fixed',discount:500000,minSubtotal:0,maxUses:null,expiresAt:null},toks.admin,201);
 const capPreview=await eq('fixed discount capped by subtotal','/api/coupons/preview','POST',{code:capped.body.code,items:lines},null,200);
 assert.equal(capPreview.body.discount,25000);
 const min=await eq('minimum subtotal coupon created','/api/coupons','POST',{code:'MINLIMIT',kind:'percent',discount:20,minSubtotal:90000,maxUses:null,expiresAt:null},toks.admin,201);
 await eq('minimum subtotal enforced','/api/coupons/preview','POST',{code:min.body.code,items:lines},null,409);
 console.log('ALL COUPON CHECKS PASSED. TEMP DB REMOVED.');

}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server&&server.exitCode===null)server.kill('SIGTERM');if(prisma)await prisma.$disconnect();rmSync(temp,{recursive:true,force:true});});
