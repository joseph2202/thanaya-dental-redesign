import {Prisma} from '@prisma/client';
import {snapshot} from './paymentLedger';

export class ReturnReviewError extends Error{}
const PAGE_SIZE=20;
const safe=(value:number)=>{
  if(!Number.isSafeInteger(value)||value<0)throw new ReturnReviewError('بيانات المرتجعات أو تكلفتها غير متناسقة؛ راجع السجلات الأصلية.');
  return value;
};
const sum=(values:number[])=>values.reduce((total,value)=>safe(total+safe(value)),0);
type ReviewOrder=Prisma.OrderGetPayload<{include:{items:{include:{costSnapshots:true;returnLines:true;lotAllocations:true}};paymentEvents:true}}>;
type Item=ReviewOrder['items'][number];
type ReturnLine=Item['returnLines'][number];

function historicalCost(item:Item,line:ReturnLine):number|null{
  const allocation=line.lotId?item.lotAllocations.find(row=>row.lotId===line.lotId):undefined;
  if(line.lotId&&!allocation)return null;
  if(!line.lotId&&item.lotAllocations.length)return null;
  const originalQuantity=allocation?allocation.quantity:item.quantity;
  safe(originalQuantity);
  const received=sum(item.returnLines.filter(row=>row.lotId===line.lotId).map(row=>row.quantity));
  if(received>originalQuantity)throw new ReturnReviewError('كمية المرتجع تتجاوز تخصيص البيع الأصلي للتشغيلة.');
  const captures=item.costSnapshots.filter(row=>row.lotId===line.lotId);
  if(!captures.length||sum(captures.map(row=>row.quantity))!==originalQuantity)return null;
  if(captures.some(row=>row.quantity<1||row.unitCostIqd===null||
    !Number.isSafeInteger(row.unitCostIqd)||row.unitCostIqd<0||
    row.source!==(line.lotId?'tracked_lot':'product_reference')))return null;
  // Different costs within one unallocated cohort cannot be assigned to a
  // particular returned piece without evidence. Never use today's cost or average.
  const costs=new Set(captures.map(row=>row.unitCostIqd!));
  if(costs.size!==1)return null;
  return safe(captures[0].unitCostIqd!*line.quantity);
}

// One row per RECEIVED RETURN DOCUMENT. Current order money may repeat across
// rows for the same order; deliberately provide no sum of those order figures.
export async function returnReview(tx:Prisma.TransactionClient,range:string,page:number,now:Date){
  const since=range==='all'?undefined:new Date(now.getTime()-Number(range)*86400000);
  const where:Prisma.OrderReturnWhereInput={createdAt:{...(since?{gte:since}:{}),lte:now}};
  const total=await tx.orderReturn.count({where});
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(page>totalPages)throw new ReturnReviewError('صفحة مراجعة المرتجعات لم تعد متاحة؛ ارجع إلى الصفحة الأولى.');
  const records=await tx.orderReturn.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],
    skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE,include:{lines:true}});
  const orderIds=[...new Set(records.map(row=>row.orderId))];
  const orders=await tx.order.findMany({where:{id:{in:orderIds}},include:{
    items:{include:{costSnapshots:true,returnLines:true,lotAllocations:true}},
    paymentEvents:{take:5001}
  }});
  const byOrder=new Map(orders.map(order=>[order.id,order]));
  const financial=new Map<string,ReturnType<typeof snapshot>>();
  for(const order of orders){
    if(order.paymentEvents.length>5000)throw new ReturnReviewError('دفتر الطلب أكبر من حد المراجعة؛ راجعه من السجلات المالية قبل استخراج هذا التقرير.');
    safe(order.total);
    for(const event of order.paymentEvents)if(!['collection','refund'].includes(event.kind)||safe(event.amountIqd)<1)
      throw new ReturnReviewError('نوع الحركة المالية أو مبلغها غير متناسق.');
    for(const item of order.items){
      if(safe(item.quantity)<1)throw new ReturnReviewError('كمية البيع الأصلية غير صالحة.');
      safe(item.price);
      for(const line of item.returnLines)if(safe(line.quantity)<1||!['restocked','quarantined'].includes(line.disposition))
        throw new ReturnReviewError('تفاصيل المرتجع غير متناسقة.');
    }
    financial.set(order.id,snapshot(order));
  }
  const rows=records.map(record=>{
    const order=byOrder.get(record.orderId),ledger=financial.get(record.orderId);
    if(!order||!ledger||!record.lines.length)throw new ReturnReviewError('سند إرجاع بلا طلب أو بنود موثقة.');
    const lines=record.lines.map(line=>{
      const item=order.items.find(item=>item.id===line.orderItemId);
      if(!item||safe(line.quantity)<1)throw new ReturnReviewError('سند الإرجاع مرتبط ببند من طلب مختلف.');
      const cost=historicalCost(item,line);
      return {productId:item.productId,productName:item.productName,quantity:line.quantity,
        disposition:line.disposition as 'restocked'|'quarantined',lotId:line.lotId,
        grossSaleValueIqd:safe(item.price*line.quantity),historicalSaleCostIqd:cost};
    });
    const unknownCostUnits=sum(lines.filter(line=>line.historicalSaleCostIqd===null).map(line=>line.quantity));
    const documentedCostIqd=sum(lines.map(line=>line.historicalSaleCostIqd??0));
    return {returnId:record.id,orderId:record.orderId,receivedAt:record.createdAt,currentOrderStatus:order.status,
      requiresReview:true as const,units:sum(lines.map(line=>line.quantity)),
      restockedUnits:sum(lines.filter(line=>line.disposition==='restocked').map(line=>line.quantity)),
      quarantinedUnits:sum(lines.filter(line=>line.disposition==='quarantined').map(line=>line.quantity)),
      grossSaleValueIqd:sum(lines.map(line=>line.grossSaleValueIqd)),
      cost:{documentedPartIqd:documentedCostIqd,unknownUnits:unknownCostUnits,
        totalHistoricalSaleCostIqd:unknownCostUnits?null:documentedCostIqd},
      currentOrderLedger:{collectedIqd:ledger.collectedIqd,refundedIqd:ledger.refundedIqd,
        refundableCeilingIqd:ledger.refundableCeilingIqd,refundableRemainingIqd:ledger.refundableRemainingIqd,
        refundAboveMerchandiseCeiling:ledger.refundedIqd>ledger.refundableCeilingIqd},lines};
  });
  const legacyWithoutEvidence=await tx.order.count({where:{status:'returned',returns:{none:{}}}});
  return {range,page,pageSize:PAGE_SIZE,total,totalPages,generatedAt:now.toISOString(),legacyWithoutEvidence,rows,
    reviewScope:'received_return_documents' as const,settlementRecorded:false as const,
    explanations:{
      period:'الفترة حسب تاريخ سند استلام المرتجع؛ أرقام دفتر الطلب حالية ولكل سنداته، ولا تجمع بين الصفوف المتكررة لنفس الطلب.',
      cost:'التكلفة من لقطة البيع الأصلية فقط؛ ليست قيمة بضاعة مستعادة أو عكس COGS. الحجر لا يعني مخزوناً صالحاً للبيع.',
      money:'سقف الرد ليس مبلغاً مستحقاً أو تسوية معتمدة. استلام البضاعة لا يرد المال تلقائياً، والشحن لا يرد تلقائياً.',
      review:'كل سند هنا يحتاج مراجعة مستقلة؛ وجود استرداد مسجل وحده لا يثبت اكتمال التسوية. التقرير للقراءة فقط.'}};
}
