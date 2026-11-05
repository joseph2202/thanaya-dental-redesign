// Provider evidence is separate from COD/manual cash and supplier ledgers.
// Implementations accept server-owned order snapshots, never card fields.
export type ProviderPaymentStatus='pending'|'authorized'|'paid'|'failed'|'cancelled'|'refunded';
export type ProviderEnvironment='sandbox'|'live';
export type ProviderOrder={orderId:string;amountIqd:number;currency:'IQD'};
export type ProviderSnapshot=ProviderOrder&{
 provider:string;environment:ProviderEnvironment;reference:string;
 status:ProviderPaymentStatus;refundedIqd:number;sequence:number;
};
export type ProviderObservation=ProviderSnapshot&{eventId:string;occurredAt:string};
export type ProviderSession={payment:ProviderSnapshot;hostedCheckoutUrl:string|null};

export interface PaymentProviderAdapter{
 readonly id:string;
 readonly environment:ProviderEnvironment;
 readonly capabilities:{hostedCheckout:boolean;refunds:boolean;signedWebhooks:boolean};
 createPayment(order:ProviderOrder,idempotencyKey:string):Promise<ProviderSession>;
 queryPayment(reference:string):Promise<ProviderObservation>;
 refund(reference:string,amountIqd:number,idempotencyKey:string):Promise<ProviderObservation>;
 verifyWebhook(rawBody:Buffer,headers:Record<string,string|undefined>):ProviderObservation;
}
export class ProviderError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const statuses:ProviderPaymentStatus[]=['pending','authorized','paid','failed','cancelled','refunded'];
const identifiers=/^[a-zA-Z0-9_-]{1,120}$/;
export function requireProviderKey(value:unknown):asserts value is string{
 if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))
  throw new ProviderError(400,'invalid_request_id','معرّف محاولة الدفع غير صالح');
}
export function requireIqd(value:unknown):asserts value is number{
 if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>2_000_000_000)
  throw new ProviderError(400,'invalid_amount','المبلغ يجب أن يكون ديناراً عراقياً صحيحاً وموجباً');
}
export function requireProviderOrder(order:ProviderOrder){
 if(!order||Object.keys(order).some(key=>!['orderId','amountIqd','currency'].includes(key))||
  typeof order.orderId!=='string'||!identifiers.test(order.orderId)||order.currency!=='IQD')
  throw new ProviderError(400,'invalid_order','بيانات الطلب أو العملة غير صالحة');
 requireIqd(order.amountIqd);
}
export function parseProviderObservation(value:unknown):ProviderObservation{
 const keys=['orderId','amountIqd','currency','provider','environment','reference','status',
  'refundedIqd','sequence','eventId','occurredAt'];
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new ProviderError(400,'invalid_event','إشعار الدفع غير صالح');
 const event=value as Record<string,unknown>;
 if(Object.keys(event).some(key=>!keys.includes(key))||keys.some(key=>!Object.prototype.hasOwnProperty.call(event,key))||
  !['orderId','provider','reference','eventId'].every(key=>typeof event[key]==='string'&&identifiers.test(event[key] as string))||
  !['sandbox','live'].includes(event.environment as string)||!statuses.includes(event.status as ProviderPaymentStatus)||
  !Number.isSafeInteger(event.sequence)||Number(event.sequence)<1||
  typeof event.occurredAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.occurredAt)||
  !Number.isFinite(Date.parse(event.occurredAt)))
  throw new ProviderError(400,'invalid_event','حقول إشعار الدفع غير صالحة');
 requireProviderOrder({orderId:event.orderId as string,amountIqd:event.amountIqd as number,currency:event.currency as 'IQD'});
 if(!Number.isSafeInteger(event.refundedIqd)||Number(event.refundedIqd)<0||Number(event.refundedIqd)>Number(event.amountIqd)||
  (event.status==='refunded'?Number(event.refundedIqd)===0:Number(event.refundedIqd)!==0))
  throw new ProviderError(400,'invalid_refund','مجموع الاسترداد غير متناسق');
 return event as ProviderObservation;
}

// Monotonic provider sequence belongs to the adapter, not to a browser or an
// assumed vendor timestamp. Real adapters must normalize authenticated queries.
export function reconcileProviderObservation(current:ProviderSnapshot,value:unknown){
 const event=parseProviderObservation(value);
 for(const key of ['provider','environment','reference','orderId','amountIqd','currency'] as const){
  if(current[key]!==event[key])
   throw new ProviderError(409,'payment_mismatch','مرجع الدفع أو مبلغه أو عملته لا يطابق الطلب');
 }
 if(event.sequence<current.sequence)return {outcome:'stale' as const,payment:current};
 if(event.sequence===current.sequence){
  if(event.status!==current.status||event.refundedIqd!==current.refundedIqd)
   throw new ProviderError(409,'conflicting_evidence','أدلة دفع متعارضة؛ يلزم التحقق من المزود');
  return {outcome:'duplicate' as const,payment:current};
 }
 const transitions:Record<ProviderPaymentStatus,ProviderPaymentStatus[]>={
  pending:['authorized','paid','failed','cancelled'],authorized:['paid','failed','cancelled'],
  paid:['refunded'],refunded:['refunded'],failed:[],cancelled:[]
 };
 if(!transitions[current.status].includes(event.status)||event.refundedIqd<current.refundedIqd||
  (event.status==='refunded'&&event.refundedIqd===current.refundedIqd))
  throw new ProviderError(409,'review_required','تسلسل الدفع يحتاج مراجعة؛ لم يتغير التحصيل أو تنفيذ الطلب');
 const {eventId:_eventId,occurredAt:_occurredAt,...payment}=event;
 return {outcome:'updated' as const,payment};
}
