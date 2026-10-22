import {Prisma} from '@prisma/client';

export class ReturnError extends Error {
  constructor(public status:number,message:string){super(message);}
}

// Damaged, open, contaminated, expired or otherwise unsellable merchandise
// enters quarantine: it is recorded as received, never restored to sellable stock.
// A refund is a SEPARATE accounting event, not implied by either disposition.
export type ReturnDisposition='restocked'|'quarantined';
export type ReturnLotSelection={lotId:string;quantity:number;quarantinedQuantity?:number};
export type ReturnSelection={orderItemId:string;quantity:number;quarantinedQuantity?:number;lots?:ReturnLotSelection[]};
type OrderWithReturnLines=Prisma.OrderGetPayload<{
  include:{items:{include:{lotAllocations:true,returnLines:true}}}
}>;
type ReturnLine={orderItemId:string;lotId:string|null;quantity:number;disposition:ReturnDisposition};

function checkQuarantine(raw:unknown,quantity:number):number{
  if(raw===undefined)return 0;
  if(!Number.isSafeInteger(raw)||Number(raw)<0||Number(raw)>quantity)
    throw new ReturnError(400,'الكمية التالفة يجب أن تكون رقماً صحيحاً بين الصفر وكمية المرتجع');
  return raw as number;
}

export function parseReturnSelection(raw:unknown):ReturnSelection[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>50)
    throw new ReturnError(400,'اختر من 1 إلى 50 بنداً للإرجاع');
  const seen=new Set<string>();
  return raw.map((value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw new ReturnError(400,'بيانات بند المرتجع غير صحيحة');
    const v=value as Record<string,unknown>;
    if(typeof v.orderItemId!=='string'||!v.orderItemId||seen.has(v.orderItemId))
      throw new ReturnError(400,'بند المرتجع غير موجود أو مكرر');
    if(!Number.isSafeInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>100)
      throw new ReturnError(400,'كمية المرتجع يجب أن تكون بين 1 و100');
    const quantity=v.quantity as number;
    let lots:ReturnLotSelection[]|undefined;
    if(v.lots!==undefined){
      if(!Array.isArray(v.lots)||v.lots.length<1||v.lots.length>50)
        throw new ReturnError(400,'اختر تشغيلات المرتجع');
      if(v.quarantinedQuantity!==undefined)
        throw new ReturnError(400,'حدد التالف لكل تشغيلة بشكل منفصل');
      const seenLots=new Set<string>();
      lots=v.lots.map((input:unknown)=>{
        if(!input||typeof input!=='object'||Array.isArray(input))
          throw new ReturnError(400,'بيانات تشغيلة المرتجع غير صحيحة');
        const lot=input as Record<string,unknown>;
        if(typeof lot.lotId!=='string'||!lot.lotId||seenLots.has(lot.lotId)||
          !Number.isSafeInteger(lot.quantity)||Number(lot.quantity)<1||Number(lot.quantity)>100)
          throw new ReturnError(400,'تشغيلة مرتجع غير صحيحة أو مكررة');
        seenLots.add(lot.lotId);
        const quarantinedQuantity=checkQuarantine(lot.quarantinedQuantity,lot.quantity as number);
        return {lotId:lot.lotId,quantity:lot.quantity as number,
          ...(quarantinedQuantity?{quarantinedQuantity}:{})};
      });
      if(lots.reduce((sum,l)=>sum+l.quantity,0)!==quantity)
        throw new ReturnError(400,'مجموع كميات التشغيلات يجب أن يساوي كمية المرتجع');
    }
    const quarantinedQuantity=lots?0:checkQuarantine(v.quarantinedQuantity,quantity);
    seen.add(v.orderItemId);
    return {orderItemId:v.orderItemId,quantity,
      ...(quarantinedQuantity?{quarantinedQuantity}:{}),...(lots?{lots}:{})};
  });
}

export function returnedCount(item:OrderWithReturnLines['items'][number]){
  // Count both sellable and quarantined pieces, preventing double returns.
  return item.returnLines.reduce((sum,l)=>sum+l.quantity,0);
}

function splitLines(selection:ReturnSelection[]):ReturnLine[]{
  const result:ReturnLine[]=[];
  const add=(orderItemId:string,lotId:string|null,quantity:number,quarantined:number)=>{
    if(quantity-quarantined>0)
      result.push({orderItemId,lotId,quantity:quantity-quarantined,disposition:'restocked'});
    if(quarantined>0)
      result.push({orderItemId,lotId,quantity:quarantined,disposition:'quarantined'});
  };
  for(const selectionLine of selection){
    if(selectionLine.lots?.length){
      for(const lot of selectionLine.lots)
        add(selectionLine.orderItemId,lot.lotId,lot.quantity,lot.quarantinedQuantity||0);
    }else{
      add(selectionLine.orderItemId,null,selectionLine.quantity,selectionLine.quarantinedQuantity||0);
    }
  }
  return result;
}

function fingerprint(lines:ReturnLine[]):string{
  return lines.map(line=>[
    line.orderItemId,line.lotId||'',line.disposition,line.quantity
  ].join(':')).sort().join('|');
}

function planReturnLines(order:OrderWithReturnLines,selection:ReturnSelection[]):ReturnLine[]{
  const byItem=new Map(order.items.map(i=>[i.id,i]));
  for(const {orderItemId,quantity,lots} of selection){
    const item=byItem.get(orderItemId);
    if(!item)throw new ReturnError(400,'بند المرتجع لا يتبع هذا الطلب');
    const used=returnedCount(item);
    if(used<0||used>item.quantity||quantity>item.quantity-used)
      throw new ReturnError(409,'الكمية المطلوبة أكبر من الكمية غير المرجعة لهذا المنتج');
    if(item.lotAllocations.length===0){
      if(lots?.length||item.returnLines.some(line=>line.lotId!==null))
        throw new ReturnError(409,'هذا المنتج لا يستخدم التشغيلات');
    }else{
      if(!lots?.length)throw new ReturnError(400,'حدد التشغيلة الفعلية لكل قطعة مرتجعة');
      if(item.returnLines.some(line=>line.lotId===null)||
        item.lotAllocations.reduce((sum,l)=>sum+l.quantity,0)!==item.quantity)
        throw new ReturnError(409,'سجل تشغيلات المنتج غير مكتمل؛ راجع المخزون');
      for(const chosen of lots){
        const allocation=item.lotAllocations.find(a=>a.lotId===chosen.lotId);
        if(!allocation)throw new ReturnError(400,'التشغيلة المحددة ليست ضمن طلب الزبون');
        const already=item.returnLines.filter(line=>line.lotId===chosen.lotId)
          .reduce((sum,line)=>sum+line.quantity,0);
        if(chosen.quantity>allocation.quantity-already)
          throw new ReturnError(409,'الكمية من هذه التشغيلة أكبر من المسموح بإرجاعه');
      }
    }
  }
  return splitLines(selection);
}

/** Transaction: optimistic order revision, immutable lines, restock only good units. */
export async function applyOrderReturn(
  tx:Prisma.TransactionClient,order:OrderWithReturnLines,selection:ReturnSelection[],
  requestId:string,reason:string,actorId:string
){
  const old=await tx.orderReturn.findUnique({
    where:{orderId_requestId:{orderId:order.id,requestId}},include:{lines:true}
  });
  if(old){
    const expected=fingerprint(splitLines(selection));
    const saved=fingerprint(old.lines.map(line=>({
      orderItemId:line.orderItemId,lotId:line.lotId,quantity:line.quantity,
      disposition:line.disposition==='quarantined'?'quarantined':'restocked'
    })));
    if(old.reason!==reason||expected!==saved)
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
      orderItemId:line.orderItemId,lotId:line.lotId,
      quantity:line.quantity,disposition:line.disposition
    }))}
  },include:{lines:true}});

  // A quarantined piece has been physically received but is NOT placed back
  // into Product.stock or ProductLot.stock. ReturnLine is its custody ledger.
  for(const {orderItemId} of selection){
    const item=order.items.find(i=>i.id===orderItemId)!;
    const goodLines=planned.filter(row=>row.orderItemId===orderItemId&&row.disposition==='restocked');
    const restoredQuantity=goodLines.reduce((sum,line)=>sum+line.quantity,0);
    for(const row of goodLines.filter(row=>row.lotId!==null)){
      await tx.productLot.update({where:{id:row.lotId!},data:{stock:{increment:row.quantity}}});
    }
    if(restoredQuantity>0){
      const restored=await tx.product.update({where:{id:item.productId},
        data:{stock:{increment:restoredQuantity}},select:{stock:true}});
      await tx.inventoryMovement.create({data:{
        productId:item.productId,delta:restoredQuantity,
        before:restored.stock-restoredQuantity,after:restored.stock,
        reason:complete?'order_returned':'order_returned_partial',
        referenceId:saved.id,actorId
      }});
    }
  }
  if(order.userId)await tx.notification.create({data:{
    recipientId:order.userId,kind:'order_status',title:'تحديث مرتجع طلبك',
    message:complete?'تم تسجيل استلام كامل المرتجع':'تم تسجيل استلام بعض منتجات طلبك',
    orderId:order.id
  }});
  return {returnEvent:saved,orderStatus:complete?'returned':'delivered',alreadyProcessed:false};
}
