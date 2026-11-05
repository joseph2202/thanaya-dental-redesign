import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {PaymentProviderAdapter,ProviderError,ProviderObservation,ProviderOrder,ProviderPaymentStatus,
 ProviderSnapshot,parseProviderObservation,reconcileProviderObservation,requireIqd,requireProviderKey,requireProviderOrder} from './paymentProvider';

export type MockProviderRecord=ProviderSnapshot&{
 requestId:string;updatedAt:string;refundRequests:Record<string,number>;
};
// The application must supply a durable repository. createIfAbsent is unique
// by requestId; compareAndSwap must atomically reject a stale sequence.
export interface MockProviderRepository{
 createIfAbsent(record:MockProviderRecord):Promise<MockProviderRecord>;
 get(reference:string):Promise<MockProviderRecord|null>;
 compareAndSwap(next:MockProviderRecord,expectedSequence:number):Promise<boolean>;
}
export class MockPaymentProvider implements PaymentProviderAdapter{
 readonly id='mock';readonly environment='sandbox' as const;
 readonly capabilities={hostedCheckout:false,refunds:true,signedWebhooks:true};
 constructor(private repository:MockProviderRepository,private secret:Buffer,private clock:()=>number=Date.now){
  if(secret.length<32)throw new ProviderError(503,'sandbox_unconfigured','مفتاح المحاكي غير مهيأ');
 }
 private observation(record:MockProviderRecord):ProviderObservation{
  const {requestId:_request,updatedAt,refundRequests:_refunds,...snapshot}=record;
  return {...snapshot,eventId:'mock_evt_'+createHash('sha256').update(record.reference+':'+record.sequence).digest('hex').slice(0,32),occurredAt:updatedAt};
 }
 private async load(reference:string){
  const record=await this.repository.get(reference);
  if(!record)throw new ProviderError(404,'payment_not_found','محاولة الدفع التجريبية غير موجودة');
  return record;
 }
 async createPayment(order:ProviderOrder,idempotencyKey:string){
  requireProviderOrder(order);requireProviderKey(idempotencyKey);
  const saved=await this.repository.createIfAbsent({...order,provider:this.id,environment:this.environment,
   reference:'mock_'+randomBytes(16).toString('hex'),status:'pending',refundedIqd:0,sequence:1,
   requestId:idempotencyKey,updatedAt:new Date(this.clock()).toISOString(),refundRequests:{}});
  if(saved.orderId!==order.orderId||saved.amountIqd!==order.amountIqd||saved.currency!==order.currency)
   throw new ProviderError(409,'request_reused','استُخدم معرّف المحاولة لطلب مختلف');
  const {eventId:_id,occurredAt:_time,...payment}=this.observation(saved);
  return {payment,hostedCheckoutUrl:null};
 }
 async queryPayment(reference:string){return this.observation(await this.load(reference));}
 // Only a guarded, owner-only disposable preview may expose this control.
 async simulate(reference:string,status:Exclude<ProviderPaymentStatus,'pending'|'refunded'>){
  const current=await this.load(reference);
  const next={...current,status,sequence:current.sequence+1,updatedAt:new Date(this.clock()).toISOString()};
  reconcileProviderObservation(current,this.observation(next));
  if(!await this.repository.compareAndSwap(next,current.sequence))
   throw new ProviderError(409,'retry_query','تغيرت المحاولة بالتزامن؛ أعد الاستعلام');
  return this.observation(next);
 }
 async refund(reference:string,amountIqd:number,idempotencyKey:string){
  requireIqd(amountIqd);requireProviderKey(idempotencyKey);
  const current=await this.load(reference);
  if(Object.prototype.hasOwnProperty.call(current.refundRequests,idempotencyKey)){
   if(current.refundRequests[idempotencyKey]!==amountIqd)
    throw new ProviderError(409,'request_reused','استُخدم معرّف الاسترداد لمبلغ مختلف');
   return this.observation(current);
  }
  if(!['paid','refunded'].includes(current.status)||amountIqd>current.amountIqd-current.refundedIqd)
   throw new ProviderError(409,'refund_exceeded','الاسترداد يتجاوز المبلغ المدفوع التجريبي المتبقي');
  if(Object.keys(current.refundRequests).length>=200)
   throw new ProviderError(409,'sandbox_limit','وصلت المحاولة إلى حد إجراءات المحاكي');
  const next:MockProviderRecord={...current,status:'refunded',refundedIqd:current.refundedIqd+amountIqd,
   sequence:current.sequence+1,updatedAt:new Date(this.clock()).toISOString(),
   refundRequests:{...current.refundRequests,[idempotencyKey]:amountIqd}};
  reconcileProviderObservation(current,this.observation(next));
  if(!await this.repository.compareAndSwap(next,current.sequence))
   throw new ProviderError(409,'retry_query','تغير الاسترداد بالتزامن؛ أعد الاستعلام والمحاولة بنفس المعرّف');
  return this.observation(next);
 }
 signWebhook(event:ProviderObservation){
  const rawBody=Buffer.from(JSON.stringify(parseProviderObservation(event)));
  const timestamp=String(Math.floor(this.clock()/1000));
  const signature=createHmac('sha256',this.secret).update(timestamp+'.').update(rawBody).digest('hex');
  return {rawBody,headers:{'x-thanaya-mock-timestamp':timestamp,'x-thanaya-mock-signature':signature}};
 }
 verifyWebhook(rawBody:Buffer,headers:Record<string,string|undefined>){
  const timestamp=headers['x-thanaya-mock-timestamp']||'',signature=headers['x-thanaya-mock-signature']||'';
  if(!Buffer.isBuffer(rawBody)||rawBody.length>8192||!/^\d{10}$/.test(timestamp)||!/^[a-f0-9]{64}$/.test(signature)||
   Math.abs(Math.floor(this.clock()/1000)-Number(timestamp))>300)
   throw new ProviderError(401,'invalid_signature','تعذر التحقق من توقيع إشعار الدفع');
  const expected=createHmac('sha256',this.secret).update(timestamp+'.').update(rawBody).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))
   throw new ProviderError(401,'invalid_signature','تعذر التحقق من توقيع إشعار الدفع');
  let body:unknown;try{body=JSON.parse(rawBody.toString('utf8'));}
  catch{throw new ProviderError(400,'invalid_event','إشعار الدفع ليس JSON صالحاً');}
  const event=parseProviderObservation(body);
  if(event.provider!=='mock'||event.environment!=='sandbox')
   throw new ProviderError(409,'wrong_environment','المحاكي يقبل إشعارات sandbox فقط');
  return event;
 }
}
