import {Router} from 'express';
import {Prisma,PrismaClient} from '@prisma/client';
import {requireAdmin} from '../middleware/requireAdmin';

const router=Router();
const prisma=new PrismaClient();
class ReceiptError extends Error {
 constructor(public status:number,message:string){super(message);}
}
const validId=(raw:unknown):raw is string=>typeof raw==='string'&&raw.length>0&&raw.length<=120;
const validUuid=(raw:unknown):raw is string=>typeof raw==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw);
const isoDay=(raw:unknown):raw is string=>{
 if(typeof raw!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw))return false;
 const date=new Date(raw+'T00:00:00Z');
 return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===raw;
};
function localDay(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=(key:string)=>parts.find(p=>p.type===key)?.value||'';
 return value('year')+'-'+value('month')+'-'+value('day');
}
type ReceiveInput={purchaseOrderLineId:string;quantity:number;lotCode:string|null;expiryDate:string|null};
function parseRequest(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new ReceiptError(400,'بيانات الاستلام غير صالحة');
 const body=raw as Record<string,unknown>;
 if(Object.keys(body).some(k=>!['requestId','expectedRevision','note','lines'].includes(k)))
  throw new ReceiptError(400,'حقول استلام غير مسموحة');
 if(!validUuid(body.requestId))throw new ReceiptError(400,'معرّف محاولة الاستلام غير صالح');
 if(!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0)
  throw new ReceiptError(400,'رقم مراجعة الاستلام مطلوب');
 if(typeof body.note!=='string'||body.note.trim().length<8||body.note.trim().length>300)
  throw new ReceiptError(400,'اكتب مرجع سند الاستلام أو ملاحظته من 8 إلى 300 حرف');
 if(!Array.isArray(body.lines)||body.lines.length===0||body.lines.length>30)
  throw new ReceiptError(400,'أضف بين منتج واحد وثلاثين منتجاً');
 const lines=body.lines.map((rawLine:unknown):ReceiveInput=>{
  if(!rawLine||typeof rawLine!=='object'||Array.isArray(rawLine))
   throw new ReceiptError(400,'سطر الاستلام غير صالح');
  const item=rawLine as Record<string,unknown>;
  if(Object.keys(item).some(k=>!['purchaseOrderLineId','quantity','lotCode','expiryDate'].includes(k)))
   throw new ReceiptError(400,'حقول الاستلام الفرعية غير صالحة');
  if(!validId(item.purchaseOrderLineId))
   throw new ReceiptError(400,'معرّف منتج أمر الشراء غير صالح');
  if(!Number.isSafeInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>100000)
   throw new ReceiptError(400,'الكمية المستلمة يجب أن تكون صحيحة وموجبة');
  const code=item.lotCode===undefined||item.lotCode===null||item.lotCode===''?null:
   typeof item.lotCode==='string'?item.lotCode.trim().toUpperCase():null;
  if(item.lotCode!==undefined&&item.lotCode!==null&&item.lotCode!==''&&!code)
   throw new ReceiptError(400,'رمز التشغيلة غير صالح');
  if(code&&!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(code))
   throw new ReceiptError(400,'صيغة التشغيلة غير صالحة');
  const expiry=item.expiryDate===undefined||item.expiryDate===null||item.expiryDate===''?null:item.expiryDate;
  if(expiry!==null&&!isoDay(expiry))
   throw new ReceiptError(400,'تاريخ الصلاحية غير صالح');
  return {purchaseOrderLineId:item.purchaseOrderLineId as string,
    quantity:item.quantity as number,lotCode:code,expiryDate:expiry as string|null};
 });
 if(new Set(lines.map(l=>l.purchaseOrderLineId)).size!==lines.length)
  throw new ReceiptError(400,'لا تستلم نفس سطر أمر الشراء مرتين في سند واحد');
 return {requestId:body.requestId as string,
  expectedRevision:body.expectedRevision as number,note:body.note.trim(),lines};
}
function fail(res:import('express').Response,error:unknown){
 if(error instanceof ReceiptError)return res.status(error.status).json({error:error.message});
 if(error instanceof Prisma.PrismaClientKnownRequestError&&
  ['P2002','P2034','P1008','P2028','P2010'].includes(error.code))
  return res.status(409).json({error:'تغيّر الاستلام أو انشغلت قاعدة البيانات؛ حدّث السجل قبل إعادة المحاولة'});
 console.error('supplier goods receipt failed',error);
 return res.status(500).json({error:'تعذر توثيق استلام البضاعة؛ لم يتم تأكيد الحفظ'});
}
const snapshot=(order:{
 id:string;status:string;receiptRevision:number;
 lines:{id:string;productId:string;productName:string;quantity:number;unitCostIqd:number}[];
 receipts:{id:string;createdAt:Date;actorId:string;note:string;lines:{purchaseOrderLineId:string;quantity:number;unitCostIqd:number;lotCode:string|null;expiryDate:string|null}[]}[]
})=>{
 const received=new Map<string,number>();
 for(const receipt of order.receipts){
  for(const line of receipt.lines)
   received.set(line.purchaseOrderLineId,(received.get(line.purchaseOrderLineId)||0)+line.quantity);
 }
 const lines=order.lines.map(l=>({...l,receivedQuantity:received.get(l.id)||0,
  remainingQuantity:l.quantity-(received.get(l.id)||0)}));
 return {id:order.id,status:order.status,receiptRevision:order.receiptRevision,
  lines,receipts:order.receipts.map(r=>({...r})),
  complete:lines.length>0&&lines.every(l=>l.remainingQuantity===0)};
};

router.use(requireAdmin);
router.get('/purchase-orders/:id',async(req,res)=>{
 try{
  const id=req.params.id;
  if(!validId(id))throw new ReceiptError(400,'رقم أمر الشراء غير صالح');
  const order=await prisma.purchaseOrder.findUnique({
   where:{id},select:{id:true,status:true,receiptRevision:true,
    lines:{select:{id:true,productId:true,productName:true,quantity:true,unitCostIqd:true}},
    receipts:{orderBy:[{createdAt:'asc'},{id:'asc'}],
     select:{id:true,createdAt:true,actorId:true,note:true,
      lines:{select:{purchaseOrderLineId:true,quantity:true,unitCostIqd:true,lotCode:true,expiryDate:true}}}}}
  });
  if(!order)throw new ReceiptError(404,'أمر الشراء غير موجود');
  res.setHeader('Cache-Control','no-store');
  return res.json(snapshot(order));
 }catch(e){return fail(res,e);}
});

router.post('/purchase-orders/:id/receipts',async(req,res)=>{
 try{
  const id=req.params.id;
  if(!validId(id))throw new ReceiptError(400,'أمر الشراء غير صالح');
  const input=parseRequest(req.body);
  const actorId=res.locals.adminUserId as string;
  const result=await prisma.$transaction(async(tx)=>{
   // An exact replay can be safely returned even after revision advances.
   const old=await tx.purchaseReceipt.findUnique({
    where:{purchaseOrderId_requestId:{purchaseOrderId:id,requestId:input.requestId}},
    include:{lines:true}
   });
   if(old){
    const same=old.actorId===actorId&&old.note===input.note&&old.lines.length===input.lines.length&&
     input.lines.every(line=>old.lines.some(x=>
      x.purchaseOrderLineId===line.purchaseOrderLineId&&x.quantity===line.quantity&&
      x.lotCode===line.lotCode&&x.expiryDate===line.expiryDate));
    if(!same)throw new ReceiptError(409,'هذا معرّف استلام مستخدم لمحتوى مختلف');
    return {id:old.id,alreadyProcessed:true};
   }
   const order=await tx.purchaseOrder.findUnique({
    where:{id},include:{lines:{include:{product:true}},receipts:{include:{lines:true}}}
   });
   if(!order)throw new ReceiptError(404,'أمر الشراء غير موجود');
   if(order.status!=='ordered')throw new ReceiptError(409,'استلام البضاعة متاح فقط بعد توثيق إرسال أمر الشراء');
   if(order.receiptRevision!==input.expectedRevision)
    throw new ReceiptError(409,'تغيّرت الكميات المستلمة من جهاز آخر؛ حدّث الأمر');
   const lineMap=new Map(order.lines.map(line=>[line.id,line]));
   const received=new Map<string,number>();
   for(const receipt of order.receipts)
    for(const line of receipt.lines)
     received.set(line.purchaseOrderLineId,(received.get(line.purchaseOrderLineId)||0)+line.quantity);
   for(const row of input.lines){
    const line=lineMap.get(row.purchaseOrderLineId);
    if(!line)throw new ReceiptError(409,'المنتج غير موجود في أمر الشراء');
    const remaining=line.quantity-(received.get(line.id)||0);
    if(row.quantity>remaining)throw new ReceiptError(409,'كمية الاستلام تتجاوز الكمية المتبقية بأمر الشراء');
    if(line.product.lotTracking){
     if(!row.lotCode||!row.expiryDate)
      throw new ReceiptError(400,'هذا المنتج يتطلب رقم تشغيلة وتاريخ صلاحية');
     if(row.expiryDate<localDay())
      throw new ReceiptError(409,'لا يجوز استلام تشغيلة منتهية الصلاحية كمخزون قابل للبيع');
    }else if(row.lotCode||row.expiryDate)
     throw new ReceiptError(400,'هذا المنتج لا يتتبع التشغيلات؛ احذف رقم التشغيلة والتاريخ');
    if(!Number.isSafeInteger(line.unitCostIqd)||line.unitCostIqd<1)
     throw new ReceiptError(409,'تكلفة شراء المنتج غير صالحة');
   }
   const changed=await tx.purchaseOrder.updateMany({
    where:{id,status:'ordered',receiptRevision:order.receiptRevision},
    data:{receiptRevision:{increment:1}}
   });
   if(changed.count!==1)throw new ReceiptError(409,'تغيّر سند الاستلام من جهاز آخر');
   const receipt=await tx.purchaseReceipt.create({
    data:{purchaseOrderId:id,requestId:input.requestId,actorId,note:input.note}
   });
   for(const row of input.lines){
    const line=lineMap.get(row.purchaseOrderLineId)!;
    let lotId:string|null=null;
    if(line.product.lotTracking){
     const current=await tx.productLot.findUnique({
      where:{productId_code:{productId:line.productId,code:row.lotCode!}}
     });
     if(current){
      if(current.expiryDate!==row.expiryDate||
         current.purchaseCostIqd!==line.unitCostIqd)
       throw new ReceiptError(409,'التشغيلة موجودة بتاريخ أو تكلفة مختلفة؛ لا يمكن دمج دفعتين مختلفتين');
      const lotWrite=await tx.productLot.updateMany({
       where:{id:current.id,stock:current.stock},
       data:{stock:{increment:row.quantity}}
      });
      if(lotWrite.count!==1)throw new ReceiptError(409,'تغيّرت كمية التشغيلة');
      lotId=current.id;
     }else{
      const created=await tx.productLot.create({
       data:{productId:line.productId,code:row.lotCode!,expiryDate:row.expiryDate!,
        purchaseCostIqd:line.unitCostIqd,stock:row.quantity}
      });
      lotId=created.id;
     }
    }
    const product=await tx.product.findUnique({where:{id:line.productId},select:{stock:true}});
    if(!product||product.stock+row.quantity>1000000)
     throw new ReceiptError(409,'المخزون قد يتجاوز الحد المسموح');
    const stockWrite=await tx.product.updateMany({
     where:{id:line.productId,stock:product.stock},
     data:{stock:{increment:row.quantity}}
    });
    if(stockWrite.count!==1)throw new ReceiptError(409,'المخزون تغيّر؛ حدّث الصفحة');
    const savedLine=await tx.purchaseReceiptLine.create({
     data:{receiptId:receipt.id,purchaseOrderLineId:line.id,
      quantity:row.quantity,unitCostIqd:line.unitCostIqd,lotId,
      lotCode:row.lotCode,expiryDate:row.expiryDate}
    });
    await tx.inventoryMovement.create({
     data:{productId:line.productId,before:product.stock,after:product.stock+row.quantity,
      delta:row.quantity,reason:'supplier_goods_receipt',referenceId:savedLine.id,actorId}
    });
   }
   return {id:receipt.id,alreadyProcessed:false};
  },{maxWait:3000,timeout:12000});
  res.setHeader('Cache-Control','no-store');
  return res.status(result.alreadyProcessed?200:201).json({
   ...result,message:'تم توثيق استلام البضاعة وتحديث المخزون، بدون تسجيل فاتورة أو دفعة مالية للمورد'
  });
 }catch(e){return fail(res,e);}
});

export default router;
