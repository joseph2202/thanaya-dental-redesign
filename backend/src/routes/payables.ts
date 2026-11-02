import {Router} from 'express';
import {Prisma,PrismaClient} from '@prisma/client';
import {requireAdmin} from '../middleware/requireAdmin';

const router=Router();
const prisma=new PrismaClient();
class PayableError extends Error {
 constructor(public status:number,message:string){super(message);}
}
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>=3&&value.length<=120;
const uuid=(value:unknown):value is string=>typeof value==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const body=(raw:unknown):Record<string,unknown>=>{
 if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new PayableError(400,'بيانات الفاتورة غير صالحة');
 return raw as Record<string,unknown>;
};
const only=(raw:Record<string,unknown>,fields:string[])=>{
 if(Object.keys(raw).some(key=>!fields.includes(key)))
  throw new PayableError(400,'هناك حقول غير مسموحة');
};
const name=(value:unknown,max:number,label:string)=>{
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)
  throw new PayableError(400,label+' مطلوب أو طويل جداً');
 return value.trim();
};
const money=(value:unknown,label:string)=>{
 if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>2000000000)
  throw new PayableError(400,label+' يجب أن يكون مبلغاً صحيحاً بالدينار');
 return value as number;
};
const day=(value:unknown)=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))
  throw new PayableError(400,'صيغة التاريخ يجب أن تكون YYYY-MM-DD');
 const parsed=new Date(value+'T00:00:00Z');
 if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value)
  throw new PayableError(400,'تاريخ الفاتورة أو الاستحقاق غير صالح');
 return value;
};
const snapshot=(invoice:{
 id:string;requestId:string;supplierId:string;purchaseOrderId:string;
 invoiceNumber:string;invoiceDate:string;dueDate:string;amountIqd:number;
 note:string;createdById:string;createdAt:Date;paymentRevision:number;
 supplier:{id:string;name:string;code:string};
 payments:{id:string;requestId:string;actorId:string;method:string;amountIqd:number;reference:string;createdAt:Date}[];
})=>{
 const paidIqd=invoice.payments.reduce((sum,event)=>sum+event.amountIqd,0);
 return {
  id:invoice.id,supplier:invoice.supplier,supplierId:invoice.supplierId,
  purchaseOrderId:invoice.purchaseOrderId,invoiceNumber:invoice.invoiceNumber,
  invoiceDate:invoice.invoiceDate,dueDate:invoice.dueDate,amountIqd:invoice.amountIqd,
  note:invoice.note,createdById:invoice.createdById,createdAt:invoice.createdAt,
  paymentRevision:invoice.paymentRevision,
  paidIqd,remainingIqd:invoice.amountIqd-paidIqd,
  status:paidIqd>=invoice.amountIqd?'paid':paidIqd?'partial':'unpaid',
  payments:invoice.payments
 };
};
function fail(res:import('express').Response,error:unknown,place:string){
 if(error instanceof PayableError){res.status(error.status).json({error:error.message});return;}
 if(error instanceof Prisma.PrismaClientKnownRequestError){
  if(error.code==='P2002'){res.status(409).json({error:'رقم الفاتورة أو معرّف العملية مستخدم مسبقاً'});return;}
  if(['P2034','P1008','P2028','P2010','P2025'].includes(error.code)){
   res.status(409).json({error:'تغيّرت الذمم أو قاعدة البيانات مشغولة؛ حدّث البيانات وتحقق قبل الإعادة'});return;
  }
 }
 console.error('supplier payables',place,error);
 res.status(500).json({error:'تعذر إكمال عملية المورد؛ راجع الإدارة'});
}
const selectInvoice={
 supplier:{select:{id:true,name:true,code:true}},
 payments:{orderBy:[{createdAt:'asc' as const},{id:'asc' as const}]}
};

router.use(requireAdmin);

// Accounts payable overview: purely recorded invoices, NOT automatic
// supplier debt inferred from orders or goods receipts.
router.get('/invoices',async(req,res)=>{
 try{
  if(Object.keys(req.query).some(k=>k!=='supplierId')||
   (req.query.supplierId!==undefined&&!validId(req.query.supplierId)))
   throw new PayableError(400,'معرّف فلتر المورد غير صالح');
  const supplierId=req.query.supplierId as string|undefined;
  const where:Prisma.SupplierInvoiceWhereInput=supplierId?{supplierId}:{};
  const [invoices,totalInvoices,invoiced,payments]=await Promise.all([
   prisma.supplierInvoice.findMany({
    where,include:selectInvoice,orderBy:[{createdAt:'desc'},{id:'desc'}],take:200
   }),
   prisma.supplierInvoice.count({where}),
   prisma.supplierInvoice.aggregate({where,_sum:{amountIqd:true}}),
   prisma.supplierPayment.aggregate({
    where:supplierId?{invoice:{supplierId}}:{},_sum:{amountIqd:true}
   })
  ]);
  const rows=invoices.map(snapshot);
  const invoicedIqd=invoiced._sum.amountIqd||0;
  const paidIqd=payments._sum.amountIqd||0;
  if(!Number.isSafeInteger(invoicedIqd)||!Number.isSafeInteger(paidIqd))
   throw new PayableError(409,'مجموع الذمم يتجاوز نطاق الأرقام المدعوم');
  res.setHeader('Cache-Control','no-store');
  return res.json({
   invoices:rows,limit:200,totalInvoices,hasMore:totalInvoices>rows.length,
   totals:{invoicedIqd,paidIqd,remainingIqd:invoicedIqd-paidIqd},
   explanation:'المجاميع تشمل كل الفواتير المسجلة؛ القائمة تعرض أحدث 200 فاتورة فقط'
  });
 }catch(e){return fail(res,e,'list invoices');}
});
router.get('/invoices/:id',async(req,res)=>{
 try{
  if(!validId(req.params.id))throw new PayableError(400,'معرّف الفاتورة غير صالح');
  const invoice=await prisma.supplierInvoice.findUnique({
   where:{id:req.params.id},include:selectInvoice
  });
  if(!invoice)throw new PayableError(404,'فاتورة المورد غير موجودة');
  res.setHeader('Cache-Control','no-store');
  return res.json(snapshot(invoice));
 }catch(e){return fail(res,e,'get invoice');}
});

router.post('/invoices',async(req,res)=>{
 try{
  const input=body(req.body);
  only(input,['requestId','purchaseOrderId','invoiceNumber','invoiceDate','dueDate','amountIqd','note']);
  if(!uuid(input.requestId))throw new PayableError(400,'معرّف إنشاء الفاتورة غير صالح');
  if(!validId(input.purchaseOrderId))throw new PayableError(400,'أمر الشراء مطلوب');
  const invoiceNumber=name(input.invoiceNumber,70,'رقم فاتورة المورد').toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9.\/_-]{0,69}$/.test(invoiceNumber))
   throw new PayableError(400,'رقم الفاتورة يجب أن يكون أحرفاً لاتينية أو أرقاماً أو شرطات');
  const invoiceDate=day(input.invoiceDate),dueDate=day(input.dueDate);
  if(dueDate<invoiceDate)throw new PayableError(400,'تاريخ الاستحقاق يسبق تاريخ الفاتورة');
  const amountIqd=money(input.amountIqd,'قيمة الفاتورة');
  const note=name(input.note,300,'مرجع الفاتورة أو سبب إدخالها');
  if(note.length<8)throw new PayableError(400,'ملاحظة الفاتورة يجب ألا تقل عن 8 أحرف');
  const actorId=res.locals.adminUserId as string;
  const result=await prisma.$transaction(async(tx)=>{
   const previous=await tx.supplierInvoice.findUnique({where:{requestId:input.requestId as string}});
   if(previous){
    const identical=previous.createdById===actorId&&previous.purchaseOrderId===input.purchaseOrderId&&
     previous.invoiceNumber===invoiceNumber&&previous.invoiceDate===invoiceDate&&
     previous.dueDate===dueDate&&previous.amountIqd===amountIqd&&previous.note===note;
    if(!identical)throw new PayableError(409,'معرّف العملية مسجّل لفاتورة مختلفة');
    return {invoice:previous,alreadyCreated:true};
   }
   const purchase=await tx.purchaseOrder.findUnique({
    where:{id:input.purchaseOrderId as string},
    include:{receipts:{include:{lines:true}},invoices:true}
   });
   if(!purchase)throw new PayableError(404,'أمر الشراء غير موجود');
   if(purchase.status!=='ordered')throw new PayableError(409,'لا تسجّل فاتورة قبل إرسال أمر الشراء');
   const receivedIqd=purchase.receipts.reduce((n,receipt)=>
    n+receipt.lines.reduce((sum,line)=>sum+line.quantity*line.unitCostIqd,0),0);
   const billedIqd=purchase.invoices.reduce((sum,invoice)=>sum+invoice.amountIqd,0);
   if(!Number.isSafeInteger(receivedIqd)||!Number.isSafeInteger(billedIqd)||
      receivedIqd>2000000000||billedIqd>2000000000)
    throw new PayableError(409,'قيمة البضاعة المستلمة تتجاوز نطاق المحاسبة المدعوم');
   if(amountIqd>receivedIqd-billedIqd)
    throw new PayableError(409,'الفاتورة تتجاوز قيمة البضاعة المستلمة غير المفوترة');
   const updated=await tx.purchaseOrder.updateMany({
    where:{id:purchase.id,invoiceRevision:purchase.invoiceRevision},
    data:{invoiceRevision:{increment:1}}
   });
   if(updated.count!==1)throw new PayableError(409,'تغيرت فواتير أمر الشراء؛ حدّث البيانات');
   const invoice=await tx.supplierInvoice.create({data:{
    requestId:input.requestId as string,purchaseOrderId:purchase.id,
    supplierId:purchase.supplierId,invoiceNumber,invoiceDate,dueDate,amountIqd,note,createdById:actorId
   }});
   return {invoice,alreadyCreated:false};
  });
  res.setHeader('Cache-Control','no-store');
  return res.status(result.alreadyCreated?200:201).json({
   id:result.invoice.id,alreadyCreated:result.alreadyCreated,
   message:'تم تسجيل فاتورة المورد فقط؛ لم يتم دفع أموال أو تغيير المخزون'
  });
 }catch(e){return fail(res,e,'record invoice');}
});

router.post('/invoices/:id/payments',async(req,res)=>{
 try{
  if(!validId(req.params.id))throw new PayableError(400,'معرّف الفاتورة غير صالح');
  const input=body(req.body);
  only(input,['requestId','amountIqd','method','reference']);
  if(!uuid(input.requestId))throw new PayableError(400,'معرّف تأكيد الدفع غير صالح');
  const amountIqd=money(input.amountIqd,'قيمة الدفعة');
  if(!['cash','bank_transfer','other'].includes(input.method as string))
   throw new PayableError(400,'طريقة الدفع غير مسموحة');
  const method=input.method as string;
  const reference=name(input.reference,200,'رقم الوصل أو مرجع التحويل');
  if(reference.length<8)throw new PayableError(400,'سجّل دليل الدفع أو رقم الوصل من 8 أحرف');
  const actorId=res.locals.adminUserId as string;
  const result=await prisma.$transaction(async(tx)=>{
   const invoice=await tx.supplierInvoice.findUnique({
    where:{id:req.params.id},include:{payments:true}
   });
   if(!invoice)throw new PayableError(404,'فاتورة المورد غير موجودة');
   const old=invoice.payments.find(event=>event.requestId===input.requestId);
   if(old){
    if(old.actorId!==actorId||old.amountIqd!==amountIqd||
       old.method!==method||old.reference!==reference)
     throw new PayableError(409,'معرّف الدفع مستخدم لمعلومات مختلفة');
    return {payment:old,alreadyProcessed:true};
   }
   const paid=invoice.payments.reduce((sum,event)=>sum+event.amountIqd,0);
   if(amountIqd>invoice.amountIqd-paid)
    throw new PayableError(409,'الدفعة تتجاوز المبلغ المتبقي على الفاتورة');
   const updated=await tx.supplierInvoice.updateMany({
    where:{id:invoice.id,paymentRevision:invoice.paymentRevision},
    data:{paymentRevision:{increment:1}}
   });
   if(updated.count!==1)throw new PayableError(409,'سجل دفع المورد تغيّر من جهاز آخر');
   const payment=await tx.supplierPayment.create({data:{
    invoiceId:invoice.id,requestId:input.requestId as string,actorId,
    amountIqd,method,reference
   }});
   return {payment,alreadyProcessed:false};
  });
  res.setHeader('Cache-Control','no-store');
  return res.status(result.alreadyProcessed?200:201).json({
   id:result.payment.id,alreadyProcessed:result.alreadyProcessed,
   message:'تم توثيق دفعة مسددة مسبقاً؛ لا يجري النظام تحويلاً مصرفياً'
  });
 }catch(e){return fail(res,e,'record supplier payment');}
});

export default router;
