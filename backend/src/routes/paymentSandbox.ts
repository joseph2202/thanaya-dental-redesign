import express,{RequestHandler,ErrorRequestHandler} from 'express';
import {PrismaClient} from '@prisma/client';
import {requireOwner} from '../middleware/requireAdmin';
import {paymentSandboxLocation} from '../lib/paymentSandboxGuard';
import {PaymentSandboxJournal,SandboxActor} from '../lib/paymentSandboxJournal';
import {MockPaymentProvider} from '../lib/mockPaymentProvider';
import {ProviderError,ProviderObservation,requireProviderKey} from '../lib/paymentProvider';

const prisma=new PrismaClient(),router=express.Router(),webhookRouter=express.Router();
let instance:Promise<{journal:PaymentSandboxJournal;provider:MockPaymentProvider}>|undefined;
let instancePath='';
async function lab(){
 const config=paymentSandboxLocation(); // repeat guard for every operation
 if(instancePath&&instancePath!==config.journal)throw new ProviderError(503,'sandbox_changed','تغير مسار المحاكي؛ أعد تشغيل المعاينة');
 if(!instance){
  instancePath=config.journal;
  instance=PaymentSandboxJournal.open(config.journal).then(journal=>({journal,provider:new MockPaymentProvider(journal,config.secret)}));
  instance.catch(()=>{instance=undefined;instancePath='';});
 }
 return instance;
}
const run=(handler:RequestHandler):RequestHandler=>async(req,res,next)=>{
 try{await handler(req,res,next);}
 catch(error){
  if(error instanceof ProviderError){res.status(error.status).json({error:error.message,code:error.code});return;}
  console.error('Payment sandbox operation failed');
  res.status(503).json({error:'تعذر إكمال عملية المحاكي؛ لم يتغير التحصيل الحقيقي.'});
 }
};
function input(value:unknown,keys:string[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))
  throw new ProviderError(400,'invalid_input','حقول المحاكي غير صالحة؛ لا ترسل بيانات بطاقة أو مبلغ طلب');
 return value as Record<string,unknown>;
}
async function actor(id:string):Promise<SandboxActor>{
 const user=await prisma.user.findUnique({where:{id},select:{id:true,name:true,role:true}});
 if(!user||user.role!=='owner')throw new ProviderError(403,'owner_required','محاكي الدفع للمالك فقط');
 return {id:user.id,name:user.name};
}
function result(journal:PaymentSandboxJournal,reference:string){
 return {payment:journal.intent(reference),events:journal.history(reference),sandbox:true,realMoney:false};
}
function sameEvidence(a:ProviderObservation,b:ProviderObservation){
 return ['provider','environment','reference','orderId','amountIqd','currency','sequence','status','refundedIqd']
  .every(key=>a[key as keyof ProviderObservation]===b[key as keyof ProviderObservation]);
}
async function receive(raw:Buffer,headers:Record<string,string|undefined>,who?:SandboxActor){
 const {journal,provider}=await lab();
 const event=provider.verifyWebhook(raw,headers),queried=await provider.queryPayment(event.reference);
 // A signed callback alone cannot invent provider state. Older genuine
 // callbacks may arrive late; normalize them then catch up with a query.
 if(event.sequence>queried.sequence||(event.sequence===queried.sequence&&!sameEvidence(event,queried)))
  throw new ProviderError(409,'unconfirmed_provider_state','الإشعار لا يطابق استعلام المزود؛ يلزم التحقق');
 const outcomes=journal.accept(event.sequence===queried.sequence?[event]:[event,queried],'webhook',who);
 return {...result(journal,event.reference),outcomes:outcomes.map(item=>item.outcome)};
}

// Mounted before JSON/cookie CSRF parsing. The raw signature is the only
// authentication here; never bypass cookie CSRF for owner control endpoints.
webhookRouter.post('/webhook',run(async(_req,_res,next)=>{paymentSandboxLocation();next();}),
 express.raw({type:'application/json',limit:'8kb'}),run(async(req,res)=>{
  const headers:Record<string,string|undefined>={};
  for(const key of ['x-thanaya-mock-timestamp','x-thanaya-mock-signature']){
   if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
  }
  const receipt=await receive(req.body,headers);
  res.json({received:true,outcomes:receipt.outcomes,sandbox:true,realMoney:false});
 }));
webhookRouter.use(((error,_req,res,_next)=>{
 res.status(error?.type==='entity.too.large'?413:400).json({error:'إشعار المحاكي غير صالح أو أكبر من الحد المسموح'});
}) as ErrorRequestHandler);
export {webhookRouter as paymentSandboxWebhook};

router.use(requireOwner);
router.get('/',run(async(_req,res)=>{
 try{paymentSandboxLocation();}catch(error){
  if(error instanceof ProviderError&&error.code==='sandbox_disabled'){res.json({enabled:false,sandbox:true,realMoney:false});return;}
  throw error;
 }
 const {journal}=await lab();
 const orders=await prisma.order.findMany({orderBy:{createdAt:'desc'},take:20,select:{id:true,total:true,status:true}});
 res.json({enabled:true,sandbox:true,realMoney:false,intents:journal.list(),orders});
}));
router.post('/intents',run(async(req,res)=>{
 const {journal,provider}=await lab(),value=input(req.body,['orderId','requestId']);
 requireProviderKey(value.requestId);
 if(typeof value.orderId!=='string'||value.orderId.length>120)throw new ProviderError(400,'invalid_order','رقم الطلب غير صالح');
 const who=await actor(res.locals.adminUserId);
 const order=await prisma.order.findUnique({where:{id:value.orderId},select:{id:true,total:true}});
 if(!order)throw new ProviderError(404,'order_not_found','طلب المعاينة غير موجود');
 const session=await provider.createPayment({orderId:order.id,amountIqd:order.total,currency:'IQD'},value.requestId);
 journal.createIntent(session.payment,who);
 journal.accept([await provider.queryPayment(session.payment.reference)],session.payment.sequence===1?'created':'reconciliation',who);
 res.status(201).json(result(journal,session.payment.reference));
}));
router.get('/intents/:reference',run(async(req,res)=>{
 const {journal}=await lab();res.json(result(journal,String(req.params.reference)));
}));
router.post('/intents/:reference/simulate',run(async(req,res)=>{
 const {journal,provider}=await lab(),reference=String(req.params.reference);
 const value=input(req.body,['status','deliverWebhook']);
 if(!['authorized','paid','failed','cancelled'].includes(value.status as string)||
  (value.deliverWebhook!==undefined&&typeof value.deliverWebhook!=='boolean'))
  throw new ProviderError(400,'invalid_status','حالة المحاكاة غير صالحة');
 journal.intent(reference);const who=await actor(res.locals.adminUserId);
 const event=await provider.simulate(reference,value.status as 'authorized'|'paid'|'failed'|'cancelled');
 if(value.deliverWebhook===false){res.json({...result(journal,reference),webhookDelivered:false});return;}
 const signed=provider.signWebhook(event);
 res.json({...await receive(signed.rawBody,signed.headers,who),webhookDelivered:true});
}));
router.post('/intents/:reference/reconcile',run(async(req,res)=>{
 const {journal,provider}=await lab(),reference=String(req.params.reference);input(req.body,[]);
 const who=await actor(res.locals.adminUserId);
 journal.accept([await provider.queryPayment(reference)],'reconciliation',who);
 res.json(result(journal,reference));
}));
router.post('/intents/:reference/refunds',run(async(req,res)=>{
 const {journal,provider}=await lab(),reference=String(req.params.reference),value=input(req.body,['requestId','amountIqd']);
 const who=await actor(res.locals.adminUserId);journal.intent(reference);
 const event=await provider.refund(reference,value.amountIqd as number,value.requestId as string);
 const signed=provider.signWebhook(event);
 res.json(await receive(signed.rawBody,signed.headers,who));
}));
export default router;
