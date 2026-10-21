import {Prisma} from '@prisma/client';

export class ReturnError extends Error {
  constructor(public status:number,message:string){super(message);}
}
export type ReturnSelection={orderItemId:string;quantity:number};
type OrderWithReturnLines=Prisma.OrderGetPayload<{
  include:{items:{include:{lotAllocations:true,returnLines:true}}}
}>;
type ReturnLine={orderItemId:string;lotId:string|null;quantity:number};

export function parseReturnSelection(raw:unknown):ReturnSelection[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>50)
    throw new ReturnError(400,'اختر من 1 إلى 50 بنداً للإرجاع');
  const seen=new Set<string>();
  return raw.map((value:unknown)=>{
    if(!value||typeof value!=='object')throw new ReturnError(400,'بيانات بند المرتجع غير صحيحة');
    const v=value as Record<string,unknown>;
    if(typeof v.orderItemId!=='string'||!v.orderItemId||seen.has(v.orderItemId))
      throw new ReturnError(400,'بند المرتجع غير موجود أو مكرر');
    if(!Number.isSafeInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>100)
      throw new ReturnError(400,'كمية المرتجع يجب أن تكون بين 1 و100');
    seen.add(v.orderItemId);
    return {orderItemId:v.orderItemId,quantity:v.quantity as number};
  });
}
export function returnedCount(item:OrderWithReturnLines['items'][number]){
  return item.returnLines.reduce((sum,l)=>sum+l.quantity,0);
}
function planReturnLines(order:OrderWithReturnLines,selection:ReturnSelection[]):ReturnLine[]{
  const byItem=new Map(order.items.map(i=>[i.id,i]));
  const plan:ReturnLine[]=[];
  for(const {orderItemId,quantity} of selection){
    const item=byItem.get(orderItemId);
    if(!item)throw new ReturnError(400,'بند المرتجع لا يتبع هذا الطلب');
    const used=returnedCount(item);
    if(used<0||used>item.quantity||quantity>item.quantity-used)
      throw new ReturnError(409,'الكمية المطلوبة أكبر من الكمية غير المرجعة لهذا المنتج');
    if(item.lotAllocations.length===0){
      if(item.returnLines.some(line=>line.lotId!==null))
        throw new ReturnError(409,'سجل تشغيلات المرتجع غير متطابق');
      plan.push({orderItemId,lotId:null,quantity});
    }else{
      if(item.returnLines.some(line=>line.lotId===null)||
        item.lotAllocations.reduce((sum,l)=>sum+l.quantity,0)!==item.quantity)
        throw new ReturnError(409,'سجل تشغيلات المنتج غير مكتمل؛ راجع المخزون');
      let left=quantity;
      for(const allocation of item.lotAllocations){
        const already=item.returnLines.filter(line=>line.lotId===allocation.lotId)
          .reduce((sum,line)=>sum+line.quantity,0);
        const available=allocation.quantity-already;
        if(available<0)throw new ReturnError(409,'رصيد المرتجع في التشغيلة غير صحيح');
        const take=Math.min(available,left);
        if(take>0){plan.push({orderItemId,lotId:allocation.lotId,quantity:take});left-=take;}
      }
      if(left!==0)throw new ReturnError(409,'لا توجد كمية كافية للإرجاع إلى التشغيلات الأصلية');
    }
  }
  return plan;
}

/** One transaction: CAS order revision, append return ledger, restore exact lots and product stock. */
export async function applyOrderReturn(
  tx:Prisma.TransactionClient,order:OrderWithReturnLines,selection:ReturnSelection[],
  requestId:string,reason:string,actorId:string
){
  const old=await tx.orderReturn.findUnique({
    where:{orderId_requestId:{orderId:order.id,requestId}},include:{lines:true}
  });
  if(old){
    const saved=new Map<string,number>();
    for(const line of old.lines)saved.set(line.orderItemId,(saved.get(line.orderItemId)||0)+line.quantity);
    if(old.reason!==reason||saved.size!==selection.length||
      selection.some(line=>saved.get(line.orderItemId)!==line.quantity))
      throw new ReturnError(409,'معرّف المرتجع سبق استخدامه لعملية مختلفة');
    return {returnEvent:old,orderStatus:order.status,alreadyProcessed:true};
  }
  if(order.status!=='delivered')throw new ReturnError(409,'لا يمكن إرجاع البضاعة إلا من طلب مُسلّم');
  const planned=planReturnLines(order,selection);
  const justReturned=new Map<string,number>();
  for(const line of planned)justReturned.set(line.orderItemId,(justReturned.get(line.orderItemId)||0)+line.quantity);
  const complete=order.items.every(item=>returnedCount(item)+(justReturned.get(item.id)||0)===item.quantity);
  const changed=await tx.order.updateMany({
    where:{id:order.id,status:'delivered',returnRevision:order.returnRevision},
    data:{returnRevision:{increment:1},...(complete?{status:'returned'}:{})}
  });
  if(changed.count!==1)throw new ReturnError(409,'تغيّر المرتجع من جهاز آخر؛ حدّث الطلب');
  const saved=await tx.orderReturn.create({data:{
    orderId:order.id,requestId,actorId,reason,
    lines:{create:planned.map(line=>({
      orderItemId:line.orderItemId,lotId:line.lotId,quantity:line.quantity
    }))}
  },include:{lines:true}});
  for(const {orderItemId,quantity} of selection){
    const item=order.items.find(i=>i.id===orderItemId)!;
    for(const row of planned.filter(row=>row.orderItemId===orderItemId&&row.lotId!==null)){
      await tx.productLot.update({where:{id:row.lotId!},data:{stock:{increment:row.quantity}}});
    }
    const restored=await tx.product.update({where:{id:item.productId},
      data:{stock:{increment:quantity}},select:{stock:true}});
    await tx.inventoryMovement.create({data:{
      productId:item.productId,delta:quantity,before:restored.stock-quantity,after:restored.stock,
      reason:complete?'order_returned':'order_returned_partial',referenceId:saved.id,actorId
    }});
  }
  if(order.userId)await tx.notification.create({data:{
    recipientId:order.userId,kind:'order_status',title:'تحديث مرتجع طلبك',
    message:complete?'تم تسجيل استلام كامل المرتجع':'تم تسجيل استلام بعض منتجات طلبك',
    orderId:order.id
  }});
  return {returnEvent:saved,orderStatus:complete?'returned':'delivered',alreadyProcessed:false};
}
