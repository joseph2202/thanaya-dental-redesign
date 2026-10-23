import {Prisma} from '@prisma/client';

export type PaymentKind='collection'|'refund';
export type PaymentMethod='cash'|'bank_transfer'|'card'|'other';
export type PaymentIntent={
  requestId:string;kind:PaymentKind;method:PaymentMethod;amountIqd:number;note:string
};
type LedgerOrder=Prisma.OrderGetPayload<{
 include:{
  items:{include:{returnLines:true}},
  paymentEvents:true
 }
}>;

export class PaymentError extends Error{
 constructor(public status:number,message:string){super(message);}
}

const TYPES:PaymentKind[]=['collection','refund'];
const METHODS:PaymentMethod[]=['cash','bank_transfer','card','other'];
const MAX_IQD=2_000_000_000;

export function parsePaymentIntent(value:unknown):PaymentIntent{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new PaymentError(400,'بيانات الحركة المالية مطلوبة');
 const input=value as Record<string,unknown>;
 if(Object.keys(input).some(key=>!['requestId','kind','method','amountIqd','note'].includes(key)))
  throw new PaymentError(400,'حقول مالية غير معروفة');
 const requestId=typeof input.requestId==='string'?input.requestId.trim():'';
 if(!/^[a-f0-9-]{36}$/i.test(requestId)||
   !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))
  throw new PaymentError(400,'معرّف العملية غير صالح');
 if(!TYPES.includes(input.kind as PaymentKind))
  throw new PaymentError(400,'نوع الحركة المالية غير صالح');
 if(!METHODS.includes(input.method as PaymentMethod))
  throw new PaymentError(400,'طريقة التحصيل أو الرد غير صالحة');
 if(!Number.isSafeInteger(input.amountIqd)||Number(input.amountIqd)<1||Number(input.amountIqd)>MAX_IQD)
  throw new PaymentError(400,'المبلغ يجب أن يكون عدداً صحيحاً بالدينار العراقي');
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length<8||note.length>300)
  throw new PaymentError(400,'اكتب مرجعاً أو ملاحظة واضحة من 8 إلى 300 حرف');
 return {requestId,kind:input.kind as PaymentKind,method:input.method as PaymentMethod,
  amountIqd:input.amountIqd as number,note};
}

function sumSafe(nums:number[]):number{
 const total=nums.reduce((sum,value)=>sum+value,0);
 if(!Number.isSafeInteger(total)||total<0)throw new PaymentError(409,'سجل المبالغ غير متناسق؛ راجع الإدارة');
 return total;
}
export function snapshot(order:LedgerOrder){
 const collectedIqd=sumSafe(order.paymentEvents.filter(e=>e.kind==='collection').map(e=>e.amountIqd));
 const refundedIqd=sumSafe(order.paymentEvents.filter(e=>e.kind==='refund').map(e=>e.amountIqd));
 if(refundedIqd>collectedIqd||collectedIqd>order.total)
  throw new PaymentError(409,'هناك تناقض في المبالغ المسجلة؛ راجع سجل الطلب');
 const netIqd=collectedIqd-refundedIqd;
 const grossMerchandiseIqd=sumSafe(order.items.map(item=>item.price*item.quantity));
 const returnedGrossIqd=sumSafe(order.items.map(item=>{
  const returned=sumSafe(item.returnLines.map(line=>line.quantity));
  if(returned>item.quantity)throw new PaymentError(409,'سجل المرتجعات غير متناسق');
  return returned*item.price;
 }));
 // Refunds must not exceed the *actual item receipts* after order-level
 // discount allocation. Shipping is not automatically refundable.
 // This cumulative ceiling is stable for all partial return sequences.
 const discount=order.discountAmount??0;
 if(discount<0||discount>grossMerchandiseIqd)
  throw new PaymentError(409,'تفاصيل الخصم في الطلب غير متناسقة');
 const merchandiseNetIqd=grossMerchandiseIqd-discount;
 const refundableCeilingIqd=grossMerchandiseIqd>0
  ?Math.floor(merchandiseNetIqd*returnedGrossIqd/grossMerchandiseIqd):0;
 const refundableRemainingIqd=Math.max(0,Math.min(collectedIqd-refundedIqd,
  refundableCeilingIqd-refundedIqd));
 return {
  collectedIqd,refundedIqd,netIqd,
  collectionRemainingIqd:Math.max(0,order.total-collectedIqd),
  refundableCeilingIqd,refundableRemainingIqd,
  // Manual cashflow isn't proof of payment provider settlement or profit.
  ledgerOnly:true as const
 };
}
export function enforcePayment(order:LedgerOrder,intent:PaymentIntent){
 const totals=snapshot(order);
 if(intent.kind==='collection'){
  if(!['delivered','returned'].includes(order.status))
   throw new PaymentError(409,'لا يمكن تسجيل التحصيل قبل تسليم الطلب؛ لا يعتبر الشحن قبضاً');
  if(intent.amountIqd>totals.collectionRemainingIqd)
   throw new PaymentError(409,'المبلغ أعلى من المتبقي من إجمالي الطلب');
 }else{
  if(totals.refundableCeilingIqd===0)
   throw new PaymentError(409,'يجب تسجيل استلام مرتجع فعلي قبل رد المال؛ حالة مرتجع القديمة وحدها لا تكفي');
  if(intent.amountIqd>totals.refundableRemainingIqd)
   throw new PaymentError(409,'الاسترداد أعلى من المبلغ المحصّل المسموح رده بعد المرتجع والخصم');
 }
 return totals;
}
export function matchesPayment(existing:LedgerOrder['paymentEvents'][number],intent:PaymentIntent){
 return existing.kind===intent.kind&&existing.method===intent.method&&
  existing.amountIqd===intent.amountIqd&&existing.note===intent.note;
}
