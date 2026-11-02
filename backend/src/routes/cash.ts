import {Router} from 'express';
import {Prisma,PrismaClient} from '@prisma/client';
import {requireAdmin,requireOwner} from '../middleware/requireAdmin';

const router=Router(),db=new PrismaClient();
class CashError extends Error {constructor(public status:number,message:string){super(message);}}
const uuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const text=(v:unknown,min:number,max:number,label:string)=>{
 if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)
  throw new CashError(400,label+' غير صالح');
 return v.trim();
};
const money=(v:unknown)=>{
 if(!Number.isSafeInteger(v)||Number(v)<1||Number(v)>2000000000)
  throw new CashError(400,'المبلغ يجب أن يكون بالدينار العراقي الصحيح');
 return v as number;
};
const body=(raw:unknown,allowed:string[])=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new CashError(400,'بيانات الحركة غير صالحة');
 const parsed=raw as Record<string,unknown>;
 if(Object.keys(parsed).some(k=>!allowed.includes(k)))
  throw new CashError(400,'الحقول غير مسموحة');
 if(!uuid(parsed.requestId))throw new CashError(400,'معرّف العملية غير صالح');
 return parsed;
};
const fail=(res:import('express').Response,error:unknown)=>{
 if(error instanceof CashError)return res.status(error.status).json({error:error.message});
 if(error instanceof Prisma.PrismaClientKnownRequestError&&
  ['P2002','P2034','P1008','P2028'].includes(error.code))
  return res.status(409).json({error:'عملية متزامنة أو مكررة؛ حدّث السجل قبل الإعادة'});
 console.error('cash and expense ledger',error);
 return res.status(500).json({error:'تعذر تسجيل أو عرض حركة الصندوق'});
};
const safe=(sum:number)=>{
 if(!Number.isSafeInteger(sum))throw new CashError(409,'المجموع تجاوز نطاق الحساب المدعوم');
 return sum;
};

router.use(requireAdmin);
router.get('/summary',async(req,res)=>{
 try{
  const range=req.query.range===undefined?'30':req.query.range;
  if(typeof range!=='string'||!['7','30','90','all'].includes(range)||
     Object.keys(req.query).some(key=>key!=='range'))
   throw new CashError(400,'فترة الصندوق غير صالحة');
  const since=range==='all'?undefined:new Date(Date.now()-Number(range)*86400000);
  const dates=since?{createdAt:{gte:since}}:{};
  const [expenses,cashExpense,customerIn,customerRefund,supplierPaid,
   contributions,withdrawals,expenseCount]=await Promise.all([
   db.storeExpense.aggregate({where:dates,_sum:{amountIqd:true}}),
   db.storeExpense.aggregate({where:{...dates,method:'cash'},_sum:{amountIqd:true}}),
   db.orderPaymentEvent.aggregate({where:{...dates,method:'cash',kind:'collection'},_sum:{amountIqd:true}}),
   db.orderPaymentEvent.aggregate({where:{...dates,method:'cash',kind:'refund'},_sum:{amountIqd:true}}),
   db.supplierPayment.aggregate({where:{...dates,method:'cash'},_sum:{amountIqd:true}}),
   db.cashAdjustment.aggregate({where:{...dates,direction:'contribution'},_sum:{amountIqd:true}}),
   db.cashAdjustment.aggregate({where:{...dates,direction:'withdrawal'},_sum:{amountIqd:true}}),
   db.storeExpense.count({where:dates})
  ]);
  const val=(x:{_sum:{amountIqd:number|null}})=>x._sum.amountIqd||0;
  const inflow=safe(val(customerIn)+val(contributions));
  const outflow=safe(val(customerRefund)+val(supplierPaid)+val(cashExpense)+val(withdrawals));
  const net=safe(inflow-outflow);
  res.setHeader('Cache-Control','no-store');
  return res.json({
   range,generatedAt:new Date().toISOString(),expenseCount,
   recordedExpenseIqd:val(expenses),
   cashInIqd:inflow,cashOutIqd:outflow,netRecordedCashMovementIqd:net,
   components:{
    customerCashCollectedIqd:val(customerIn),customerCashRefundedIqd:val(customerRefund),
    supplierCashPaidIqd:val(supplierPaid),cashOperatingExpensesIqd:val(cashExpense),
    ownerCashContributionsIqd:val(contributions),ownerCashWithdrawalsIqd:val(withdrawals)
   },
   warning:'هذا صافي حركة النقد المسجلة في الفترة، وليس رصيد صندوق فعلياً أو صافي أرباح. لا يشمل حركات غير موثقة أو افتتاحية صندوق مجهولة.'
  });
 }catch(e){return fail(res,e);}
});
router.get('/expenses',async(req,res)=>{
 try{
  if(Object.keys(req.query).length)throw new CashError(400,'معلمات غير مسموحة');
  const expenses=await db.storeExpense.findMany({
   orderBy:[{createdAt:'desc'},{id:'desc'}],take:100,
   select:{id:true,category:true,method:true,amountIqd:true,
    reference:true,note:true,createdAt:true,actorId:true}
  });
  res.setHeader('Cache-Control','no-store');
  return res.json(expenses);
 }catch(e){return fail(res,e);}
});
router.post('/expenses',async(req,res)=>{
 try{
  const p=body(req.body,['requestId','category','method','amountIqd','reference','note']);
  const category=text(p.category,2,40,'تصنيف المصروف');
  if(!['rent','utilities','salaries','delivery','maintenance','marketing','other'].includes(category))
   throw new CashError(400,'تصنيف المصروف غير مسموح؛ مشتريات البضاعة تدخل فواتير الموردين');
  const method=text(p.method,3,32,'طريقة السداد');
  if(!['cash','bank_transfer','other'].includes(method))
   throw new CashError(400,'طريقة السداد غير مسموحة');
  const amountIqd=money(p.amountIqd),reference=text(p.reference,8,200,'مرجع الدفع');
  const note=text(p.note,8,300,'وصف المصروف');
  const actorId=res.locals.adminUserId as string;
  const old=await db.storeExpense.findUnique({where:{requestId:p.requestId as string}});
  if(old){
   if(old.actorId!==actorId||old.category!==category||old.method!==method||
    old.amountIqd!==amountIqd||old.reference!==reference||old.note!==note)
    throw new CashError(409,'معرّف العملية مستخدم بمعلومات مختلفة');
   return res.status(200).json({id:old.id,alreadyRecorded:true});
  }
  const saved=await db.storeExpense.create({data:{
   requestId:p.requestId as string,actorId,category,method,amountIqd,reference,note
  }});
  res.setHeader('Cache-Control','no-store');
  return res.status(201).json({id:saved.id,alreadyRecorded:false});
 }catch(e){return fail(res,e);}
});
// Only the business owner can record movements to/from the physical cash
// drawer, not employees or automatic checkout/payable calls.
router.post('/owner-movements',requireOwner,async(req,res)=>{
 try{
  const p=body(req.body,['requestId','direction','amountIqd','reference','note']);
  const direction=text(p.direction,3,32,'نوع الحركة');
  if(!['contribution','withdrawal'].includes(direction))
   throw new CashError(400,'نوع حركة الصندوق غير مسموح');
  const amountIqd=money(p.amountIqd),reference=text(p.reference,8,200,'مرجع الصندوق');
  const note=text(p.note,8,300,'سبب الحركة');
  const actorId=res.locals.adminUserId as string;
  const old=await db.cashAdjustment.findUnique({where:{requestId:p.requestId as string}});
  if(old){
   if(old.actorId!==actorId||old.direction!==direction||
    old.amountIqd!==amountIqd||old.reference!==reference||old.note!==note)
    throw new CashError(409,'معرّف الحركة مستخدم لمحتوى مختلف');
   return res.status(200).json({id:old.id,alreadyRecorded:true});
  }
  const saved=await db.cashAdjustment.create({data:{
   requestId:p.requestId as string,actorId,direction,amountIqd,reference,note
  }});
  res.setHeader('Cache-Control','no-store');
  return res.status(201).json({id:saved.id,alreadyRecorded:false});
 }catch(e){return fail(res,e);}
});
export default router;
