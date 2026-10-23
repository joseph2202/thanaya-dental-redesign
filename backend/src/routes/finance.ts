import {Router} from 'express';
import {Prisma,PrismaClient} from '@prisma/client';
import {requireAdmin} from '../middleware/requireAdmin';
import {PaymentError,parsePaymentIntent,enforcePayment,matchesPayment,snapshot} from '../lib/paymentLedger';

const router=Router();
const prisma=new PrismaClient();

const include={
 items:{include:{returnLines:true}},
 paymentEvents:{orderBy:{createdAt:'asc'}}
} as const;
function failure(res:import('express').Response,error:unknown,context:string){
 if(error instanceof PaymentError){res.status(error.status).json({error:error.message});return;}
 if(error instanceof Prisma.PrismaClientKnownRequestError&&
   ['P2002','P2034','P1008','P2028','P2010','P2025'].includes(error.code)){
  res.status(409).json({error:'الحركة المالية تغيرت من جهاز آخر؛ حدّث البيانات وحاول مجدداً'});return;
 }
 console.error(context,error);
 res.status(500).json({error:'تعذّر عرض أو حفظ الحركة المالية'});
}
const validOrderId=(id:unknown):id is string=>typeof id==='string'&&id.length>=3&&id.length<=120;

// Read-only, owner/admin order finder. Only orders eligible for financial
// review are listed; never performs a collection or changes order state.
router.get('/orders',requireAdmin,async(req,res)=>{
 const raw=typeof req.query.search==='string'?req.query.search.trim():'';
 if(raw.length>100||Object.keys(req.query).some(k=>k!=='search')||
    (req.query.search!==undefined&&typeof req.query.search!=='string'))
  return res.status(400).json({error:'بحث الطلبات غير صالح'});
 try{
  const where:Prisma.OrderWhereInput={
   status:{in:['delivered','returned']},
   ...(raw?{OR:[
    {id:{contains:raw}},{customerName:{contains:raw}},{customerPhone:{contains:raw}}
   ]}:{})
  };
  const rows=await prisma.order.findMany({
   where,
   select:{
    id:true,customerName:true,status:true,total:true,createdAt:true,
    paymentEvents:{select:{kind:true,amountIqd:true}}
   },
   take:12,orderBy:[{createdAt:'desc'},{id:'desc'}]
  });
  const orders=rows.map(({paymentEvents,...order})=>{
   const collectedIqd=paymentEvents
    .filter(e=>e.kind==='collection').reduce((n,e)=>n+e.amountIqd,0);
   const refundedIqd=paymentEvents
    .filter(e=>e.kind==='refund').reduce((n,e)=>n+e.amountIqd,0);
   return {...order,collectedIqd,refundedIqd,
    collectionRemainingIqd:Math.max(0,order.total-collectedIqd)};
  });
  res.setHeader('Cache-Control','no-store');
  res.json({orders,limit:12,hasMore:rows.length===12});
 }catch(e){failure(res,e,'finance order finder');}
});

router.get('/orders/:id',requireAdmin,async(req,res)=>{
 const orderId=req.params.id;
 if(!validOrderId(orderId))return res.status(400).json({error:'رقم الطلب غير صالح'});
 try{
  const order=await prisma.order.findUnique({where:{id:orderId},include});
  if(!order)return res.status(404).json({error:'الطلب غير موجود'});
  const totals=snapshot(order);
  res.setHeader('Cache-Control','no-store');
  res.json({order:{id:order.id,customerName:order.customerName,
    status:order.status,total:order.total,paymentMethod:order.paymentMethod},
    totals,
    events:order.paymentEvents.map(({id,kind,method,amountIqd,note,actorId,createdAt})=>
      ({id,kind,method,amountIqd,note,actorId,createdAt}))});
 }catch(e){failure(res,e,'finance order detail');}
});

router.post('/orders/:id/events',requireAdmin,async(req,res)=>{
 const orderId=req.params.id;
 if(!validOrderId(orderId))return res.status(400).json({error:'رقم الطلب غير صالح'});
 try{
  const intent=parsePaymentIntent(req.body);
  const actorId=res.locals.adminUserId as string;
  const result=await prisma.$transaction(async(tx)=>{
   const order=await tx.order.findUnique({where:{id:orderId},include});
   if(!order)throw new PaymentError(404,'الطلب غير موجود');
   const duplicate=order.paymentEvents.find(e=>e.requestId===intent.requestId);
   if(duplicate){
    if(!matchesPayment(duplicate,intent))
     throw new PaymentError(409,'معرّف العملية مستخدم لحركة مالية مختلفة');
    return {event:duplicate,alreadyProcessed:true};
   }
   enforcePayment(order,intent);
   const revision=await tx.order.updateMany({
    where:{id:order.id,paymentRevision:order.paymentRevision},
    data:{paymentRevision:{increment:1}}
   });
   if(revision.count!==1)throw new PaymentError(409,'تغيّر سجل المال من جهاز آخر؛ حدّث الطلب');
   const event=await tx.orderPaymentEvent.create({data:{
    orderId:order.id,requestId:intent.requestId,actorId,
    kind:intent.kind,method:intent.method,amountIqd:intent.amountIqd,note:intent.note
   }});
   return {event,alreadyProcessed:false};
  },{maxWait:2000,timeout:8000});
  res.setHeader('Cache-Control','no-store');
  res.status(result.alreadyProcessed?200:201).json({
   id:result.event.id,kind:result.event.kind,amountIqd:result.event.amountIqd,
   alreadyProcessed:result.alreadyProcessed
  });
 }catch(e){failure(res,e,'create financial event');}
});

// This summarizes staff-ATTESTED cashflow by event date in UTC+3, NOT
// gross order values and NOT bank settlement. Historical events remain empty.
router.get('/summary',requireAdmin,async(req,res)=>{
 const range=typeof req.query.range==='string'?req.query.range:'30';
 if(!['7','30','90','all'].includes(range)||
   Object.keys(req.query).some(k=>k!=='range'))
  return res.status(400).json({error:'فترة التقرير غير صالحة'});
 const days=range==='all'?null:Number(range);
 const since=days===null?undefined:new Date(Date.now()-days*86400000);
 try{
  const [events,allCount,awaiting]=await Promise.all([
   prisma.orderPaymentEvent.findMany({where:since?{createdAt:{gte:since}}:{},
    select:{kind:true,amountIqd:true,createdAt:true},
    orderBy:{createdAt:'desc'},take:50000}),
   prisma.orderPaymentEvent.count({where:since?{createdAt:{gte:since}}:{}}),
   prisma.order.count({where:{status:'delivered',paymentEvents:{none:{kind:'collection'}}}})
  ]);
  if(allCount>50000)return res.status(409).json({error:'الحركات المالية كثيرة لهذه الفترة؛ قلل المدة أو صدّر السجلات'});
  let receivedIqd=0,refundedIqd=0,receipts=0,refunds=0;
  for(const event of events){
   if(event.kind==='collection'){receivedIqd+=event.amountIqd;receipts++;}
   if(event.kind==='refund'){refundedIqd+=event.amountIqd;refunds++;}
  }
  res.setHeader('Cache-Control','no-store');
  res.json({range,receivedIqd,refundedIqd,netRecordedIqd:receivedIqd-refundedIqd,
   receipts,refunds,deliveredWithoutReceipt:awaiting,generatedAt:new Date().toISOString(),
   explanation:'حركات يدوياً وثّقها موظفو ثنايا؛ ليست كشف بنك أو صافي أرباح'});
 }catch(e){failure(res,e,'finance summary');}
});
export default router;
