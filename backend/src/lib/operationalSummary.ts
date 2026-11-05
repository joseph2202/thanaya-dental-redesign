import {Prisma} from '@prisma/client';
export class OperationsError extends Error{}
const DAY=86400000;
const safe=(value:number|bigint|null|undefined)=>{
 const number=Number(value??0);
 if(!Number.isSafeInteger(number))throw new OperationsError('مجموع مالي يتجاوز نطاق الحساب الدقيق');
 return number;
};
function iraqDate(date:Date){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const at=(key:string)=>parts.find(part=>part.type===key)!.value;
 return at('year')+'-'+at('month')+'-'+at('day');
}
type Receivables={dueIqd:bigint;dueOrders:bigint;excludedReturnOrders:bigint;returnedOrders:bigint;invalidOrders:bigint};
type Payables={dueIqd:bigint;dueInvoices:bigint;overdueIqd:bigint;overdueInvoices:bigint;invalidInvoices:bigint};

// Called inside one read transaction. Period figures use the event date;
// current receivables/payables/expiry are deliberately not period-filtered.
export async function operationalSummary(tx:Prisma.TransactionClient,range:string,now:Date){
 const since=range==='all'?undefined:new Date(now.getTime()-Number(range)*DAY);
 const dates=since?{createdAt:{gte:since,lte:now}}:{createdAt:{lte:now}};
 const today=iraqDate(now),soon=iraqDate(new Date(now.getTime()+30*DAY));
 const lotWhere={stock:{gt:0},expiryDate:{lte:soon}};
 const [events,expenses,supplierPayments,adjustments,receivableRows,payableRows,expiringLots,
  expired,nearExpiry,invalidExpenses,invalidAdjustments]=await Promise.all([
  tx.orderPaymentEvent.groupBy({by:['kind','method'],where:dates,_sum:{amountIqd:true},_count:{_all:true}}),
  tx.storeExpense.groupBy({by:['method'],where:dates,_sum:{amountIqd:true},_count:{_all:true}}),
  tx.supplierPayment.groupBy({by:['method'],where:dates,_sum:{amountIqd:true}}),
  tx.cashAdjustment.groupBy({by:['direction'],where:dates,_sum:{amountIqd:true}}),
  tx.$queryRaw<Receivables[]>(Prisma.sql`
   WITH payments AS (
    SELECT "orderId",SUM(CASE WHEN kind='collection' THEN "amountIqd" ELSE 0 END) collected,
     SUM(CASE WHEN kind='refund' THEN "amountIqd" ELSE 0 END) refunded,
     SUM(CASE WHEN kind NOT IN ('collection','refund') OR method NOT IN ('cash','bank_transfer','card','other') OR "amountIqd"<1 THEN 1 ELSE 0 END) bad
    FROM "OrderPaymentEvent" GROUP BY "orderId"
   ), orders AS (
    SELECT o.*,COALESCE(p.collected,0) collected,COALESCE(p.refunded,0) refunded,COALESCE(p.bad,0) bad,
     EXISTS(SELECT 1 FROM "OrderReturn" r WHERE r."orderId"=o.id) hasReturn
    FROM "Order" o LEFT JOIN payments p ON p."orderId"=o.id
   ) SELECT
    COALESCE(SUM(CASE WHEN status='delivered' AND hasReturn=0 THEN total-collected ELSE 0 END),0) AS "dueIqd",
    COALESCE(SUM(CASE WHEN status='delivered' AND hasReturn=0 AND total>collected THEN 1 ELSE 0 END),0) AS "dueOrders",
    COALESCE(SUM(CASE WHEN status='delivered' AND hasReturn=1 THEN 1 ELSE 0 END),0) AS "excludedReturnOrders",
    COALESCE(SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END),0) AS "returnedOrders",
    COALESCE(SUM(CASE WHEN total<0 OR collected>total OR refunded>collected OR bad>0 THEN 1 ELSE 0 END),0) AS "invalidOrders"
   FROM orders`),
  tx.$queryRaw<Payables[]>(Prisma.sql`
   WITH paid AS (SELECT "invoiceId",SUM("amountIqd") total,
     SUM(CASE WHEN "amountIqd"<1 OR method NOT IN ('cash','bank_transfer','other') THEN 1 ELSE 0 END) bad
     FROM "SupplierPayment" GROUP BY "invoiceId"),
    invoices AS (SELECT i.*,COALESCE(p.total,0) paid,COALESCE(p.bad,0) bad FROM "SupplierInvoice" i LEFT JOIN paid p ON p."invoiceId"=i.id)
   SELECT COALESCE(SUM("amountIqd"-paid),0) AS "dueIqd",
    COALESCE(SUM(CASE WHEN "amountIqd">paid THEN 1 ELSE 0 END),0) AS "dueInvoices",
    COALESCE(SUM(CASE WHEN "dueDate"<${today} AND "amountIqd">paid THEN "amountIqd"-paid ELSE 0 END),0) AS "overdueIqd",
    COALESCE(SUM(CASE WHEN "dueDate"<${today} AND "amountIqd">paid THEN 1 ELSE 0 END),0) AS "overdueInvoices",
    COALESCE(SUM(CASE WHEN "amountIqd"<0 OR paid<0 OR paid>"amountIqd" OR bad>0 THEN 1 ELSE 0 END),0) AS "invalidInvoices"
   FROM invoices`),
  tx.productLot.findMany({where:lotWhere,orderBy:[{expiryDate:'asc'},{id:'asc'}],take:8,
   select:{id:true,code:true,expiryDate:true,stock:true,product:{select:{id:true,name:true}}}}),
  tx.productLot.aggregate({where:{stock:{gt:0},expiryDate:{lt:today}},_count:{_all:true},_sum:{stock:true}}),
  tx.productLot.aggregate({where:{stock:{gt:0},expiryDate:{gte:today,lte:soon}},_count:{_all:true},_sum:{stock:true}}),
  tx.storeExpense.count({where:{...dates,amountIqd:{lte:0}}}),
  tx.cashAdjustment.count({where:{...dates,amountIqd:{lte:0}}})
 ]);
 const receivables=receivableRows[0],payables=payableRows[0];
 if(safe(receivables.invalidOrders)||safe(payables.invalidInvoices)||invalidExpenses||invalidAdjustments)
  throw new OperationsError('هناك سجل تحصيل أو ذمم غير متناسق؛ راجع السجلات قبل اعتماد المؤشرات');
 let collectedIqd=0,refundedIqd=0,cashCollected=0,cashRefunded=0,expenseIqd=0,cashExpense=0,
  cashSupplierPaid=0,contributions=0,withdrawals=0;
 for(const event of events){
  if(!['collection','refund'].includes(event.kind)||!['cash','bank_transfer','card','other'].includes(event.method))
   throw new OperationsError('هناك نوع حركة مالية يحتاج مراجعة');
  const amount=safe(event._sum.amountIqd);
  if(event.kind==='collection'){collectedIqd=safe(collectedIqd+amount);if(event.method==='cash')cashCollected=amount;}
  else{refundedIqd=safe(refundedIqd+amount);if(event.method==='cash')cashRefunded=amount;}
 }
 for(const row of expenses){
  if(!['cash','bank_transfer','other'].includes(row.method))throw new OperationsError('طريقة مصروف غير معروفة');
  expenseIqd=safe(expenseIqd+safe(row._sum.amountIqd));if(row.method==='cash')cashExpense=safe(row._sum.amountIqd);
 }
 for(const row of supplierPayments){
  if(!['cash','bank_transfer','other'].includes(row.method))throw new OperationsError('طريقة تسديد مورد غير معروفة');
  if(row.method==='cash')cashSupplierPaid=safe(row._sum.amountIqd);
 }
 for(const row of adjustments){
  if(!['contribution','withdrawal'].includes(row.direction))throw new OperationsError('نوع حركة مالك غير معروف');
  if(row.direction==='contribution')contributions=safe(row._sum.amountIqd);else withdrawals=safe(row._sum.amountIqd);
 }
 return {range,generatedAt:now.toISOString(),
  period:{collectedIqd,refundedIqd,netCollectionsIqd:safe(collectedIqd-refundedIqd),expenseIqd,
   netRecordedCashMovementIqd:safe(cashCollected+contributions-cashRefunded-cashSupplierPaid-cashExpense-withdrawals)},
  receivables:{dueIqd:safe(receivables.dueIqd),orders:safe(receivables.dueOrders),
   excludedReturnOrders:safe(receivables.excludedReturnOrders),returnedOrders:safe(receivables.returnedOrders),scope:'current_unreturned_delivered'},
  payables:{dueIqd:safe(payables.dueIqd),invoices:safe(payables.dueInvoices),overdueIqd:safe(payables.overdueIqd),
   overdueInvoices:safe(payables.overdueInvoices),scope:'current_recorded_invoices'},
  expiry:{today,through:soon,expiredLots:expired._count._all,expiredUnits:safe(expired._sum.stock),
   soonLots:nearExpiry._count._all,soonUnits:safe(nearExpiry._sum.stock),lots:expiringLots,
   limit:8,hasMore:expired._count._all+nearExpiry._count._all>expiringLots.length},
  netProfitIqd:null,actualCashBalanceIqd:null,
  explanations:{period:'التحصيل والاسترداد والمصاريف حسب تاريخ الحركة المسجلة، لا تاريخ إنشاء الطلب.',
   receivables:'المتبقي من طلبات مسلّمة بلا مرتجعات، لكل الفترات. لا يزيده الاسترداد. الطلبات ذات مرتجع تحتاج تسوية مستقلة.',
   payables:'فواتير الموردين المسجلة ناقص تسديداتها لكل الفترات؛ لا نستنتج ديناً من أمر الشراء أو الاستلام وحده.',
   cash:'صافي حركة النقد الموثقة فقط؛ ليس رصيد صندوق فعلياً أو صافي ربح.'}
 };
}
