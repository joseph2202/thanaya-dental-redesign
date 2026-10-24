import {Router} from 'express';
import {Prisma,PrismaClient} from '@prisma/client';
import {requireAdmin} from '../middleware/requireAdmin';

const router=Router();
const db=new PrismaClient();

class ProcurementError extends Error {
 constructor(public status:number,message:string){super(message);}
}
const nonempty=(value:unknown,max:number,label:string):string=>{
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)
  throw new ProcurementError(400,label+' مطلوب ويجب ألا يتجاوز '+max+' حرفاً');
 return value.trim();
};
const optional=(value:unknown,max:number,label:string):string|null=>{
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||value.trim().length>max)
  throw new ProcurementError(400,label+' غير صالح');
 return value.trim()||null;
};
const keys=(data:Record<string,unknown>,allowed:string[])=>{
 if(Object.keys(data).some(k=>!allowed.includes(k)))
  throw new ProcurementError(400,'تم إرسال حقول غير مسموحة');
};
const object=(raw:unknown):Record<string,unknown>=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new ProcurementError(400,'بيانات الطلب غير صالحة');
 return raw as Record<string,unknown>;
};
const normalizedCode=(raw:unknown)=>{
 const code=nonempty(raw,24,'رمز المورد').toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(code))
  throw new ProcurementError(400,'رمز المورد يجب أن يتكون من 2–24 حرفاً لاتينياً أو رقماً');
 return code;
};
const normalizeFields=(data:Record<string,unknown>,create:boolean)=>{
 keys(data,['code','name','contact','phone','email','city','address','note','active','expectedRevision']);
 const result:Record<string,string|null|boolean>={};
 if(create||data.name!==undefined)result.name=nonempty(data.name,130,'اسم المورد');
 if(create)result.code=normalizedCode(data.code);
 else if(data.code!==undefined)throw new ProcurementError(400,'رمز المورد ثابت، ولا يمكن تغييره');
 for(const [key,max] of [['contact',100],['phone',35],['email',150],['city',100],['address',230],['note',500]] as const){
  if(data[key]!==undefined)result[key]=optional(data[key],max,key);
 }
 if(data.email!==undefined&&result.email&&
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email as string))
  throw new ProcurementError(400,'البريد الإلكتروني غير صالح');
 if(data.active!==undefined){
  if(typeof data.active!=='boolean')throw new ProcurementError(400,'حالة المورد غير صالحة');
  result.active=data.active;
 }
 return result;
};
function handle(res:import('express').Response,err:unknown,where:string){
 if(err instanceof ProcurementError)return res.status(err.status).json({error:err.message});
 if(err instanceof Prisma.PrismaClientKnownRequestError){
  if(err.code==='P2002')return res.status(409).json({error:'هناك سجل بنفس الرمز أو معرّف العملية'});
  if(err.code==='P2025')return res.status(404).json({error:'السجل المطلوب غير موجود'});
 }
 console.error(where,err);
 return res.status(500).json({error:'تعذر إكمال العملية؛ راجع الإدارة'});
}
const validId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=120;
const exactUuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);

router.use(requireAdmin);
router.get('/suppliers',async(req,res)=>{
 try{
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  if(search.length>100||Object.keys(req.query).some(k=>k!=='search')||
    (req.query.search!==undefined&&typeof req.query.search!=='string'))
   throw new ProcurementError(400,'بحث الموردين غير صالح');
  const suppliers=await db.supplier.findMany({
   where:search?{OR:[{name:{contains:search}},{code:{contains:search}},{contact:{contains:search}}]}:{},
   orderBy:[{active:'desc'},{name:'asc'}],take:200
  });
  res.setHeader('Cache-Control','no-store');
  return res.json(suppliers);
 }catch(e){return handle(res,e,'get suppliers');}
});
router.post('/suppliers',async(req,res)=>{
 try{
  const data=normalizeFields(object(req.body),true);
  const supplier=await db.supplier.create({data:data as Prisma.SupplierCreateInput});
  res.setHeader('Cache-Control','no-store');
  return res.status(201).json(supplier);
 }catch(e){return handle(res,e,'create supplier');}
});
router.patch('/suppliers/:id',async(req,res)=>{
 try{
  const id=req.params.id;
  if(!validId(id))throw new ProcurementError(400,'معرّف المورد غير صالح');
  const input=object(req.body);
  if(!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<0)
   throw new ProcurementError(400,'رقم إصدار المورد مطلوب');
  const data=normalizeFields(input,false);
  if(!Object.keys(data).length)throw new ProcurementError(400,'ماكو تغييرات للحفظ');
  const changed=await db.supplier.updateMany({
   where:{id,revision:input.expectedRevision as number},
   data:{...data,revision:{increment:1}}
  });
  if(changed.count!==1)throw new ProcurementError(409,'سجل المورد تغيّر؛ حدّث القائمة قبل التعديل');
  const supplier=await db.supplier.findUniqueOrThrow({where:{id}});
  res.setHeader('Cache-Control','no-store');
  return res.json(supplier);
 }catch(e){return handle(res,e,'update supplier');}
});

const details={supplier:{select:{id:true,name:true,code:true,active:true}},
 createdBy:{select:{id:true,name:true}},lines:{orderBy:{id:'asc' as const}}};
router.get('/purchase-drafts',async(req,res)=>{
 try{
  if(Object.keys(req.query).length)throw new ProcurementError(400,'معلمات الطلب غير صالحة');
  const drafts=await db.purchaseOrder.findMany({
   orderBy:[{createdAt:'desc'},{id:'desc'}],take:100,include:details
  });
  res.setHeader('Cache-Control','no-store');
  return res.json(drafts.map(({lines,...draft})=>({
   ...draft,lines,totalIqd:lines.reduce((n,line)=>n+line.quantity*line.unitCostIqd,0)
  })));
 }catch(e){return handle(res,e,'list purchase drafts');}
});
router.get('/purchase-drafts/:id',async(req,res)=>{
 try{
  const id=req.params.id;
  if(!validId(id))throw new ProcurementError(400,'رقم المسودة غير صالح');
  const draft=await db.purchaseOrder.findUnique({where:{id},include:details});
  if(!draft)throw new ProcurementError(404,'مسودة الشراء غير موجودة');
  res.setHeader('Cache-Control','no-store');
  return res.json({...draft,totalIqd:draft.lines.reduce((n,l)=>n+l.quantity*l.unitCostIqd,0)});
 }catch(e){return handle(res,e,'purchase draft');}
});
router.post('/purchase-drafts',async(req,res)=>{
 try{
  const input=object(req.body);
  keys(input,['requestId','supplierId','note','lines']);
  if(!exactUuid(input.requestId))throw new ProcurementError(400,'معرّف طلب الشراء غير صالح');
  const supplierId=nonempty(input.supplierId,120,'المورد');
  const note=optional(input.note,400,'ملاحظة الشراء');
  if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>30)
   throw new ProcurementError(400,'اختر بين منتج واحد و30 منتجاً');
  const items=input.lines.map((raw:unknown)=>{
   const item=object(raw);
   keys(item,['productId','quantity','unitCostIqd']);
   const productId=nonempty(item.productId,120,'المنتج');
   if(!Number.isSafeInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>100000)
    throw new ProcurementError(400,'الكمية يجب أن تكون عدداً صحيحاً');
   if(!Number.isSafeInteger(item.unitCostIqd)||Number(item.unitCostIqd)<1||Number(item.unitCostIqd)>2000000000)
    throw new ProcurementError(400,'تكلفة الوحدة يجب أن تكون بالدينار الصحيح');
   return {productId,quantity:item.quantity as number,unitCostIqd:item.unitCostIqd as number};
  });
  if(new Set(items.map(x=>x.productId)).size!==items.length)
   throw new ProcurementError(400,'لا يمكن إضافة نفس المنتج مرتين في المسودة');
  const cost=items.reduce((n,l)=>n+l.quantity*l.unitCostIqd,0);
  if(!Number.isSafeInteger(cost)||cost>2000000000)
   throw new ProcurementError(400,'المبلغ الإجمالي للمسودة يتجاوز الحد المدعوم');
  const actor=res.locals.adminUserId as string;
  const draft=await db.$transaction(async(tx)=>{
   const prior=await tx.purchaseOrder.findUnique({
    where:{requestId:input.requestId as string},include:{lines:true}
   });
   if(prior){
    const same=prior.createdById===actor&&prior.supplierId===supplierId&&prior.note===note&&
     prior.lines.length===items.length&&items.every(it=>prior.lines.some(line=>
      line.productId===it.productId&&line.quantity===it.quantity&&line.unitCostIqd===it.unitCostIqd));
    if(!same)throw new ProcurementError(409,'معرّف المحاولة مستخدم لمسودة أخرى');
    return {id:prior.id,alreadyCreated:true};
   }
   const supplier=await tx.supplier.findUnique({where:{id:supplierId}});
   if(!supplier||!supplier.active)throw new ProcurementError(409,'المورد غير موجود أو موقوف');
   const products=await tx.product.findMany({
    where:{id:{in:items.map(it=>it.productId)}},
    select:{id:true,name:true,sku:true}
   });
   if(products.length!==items.length)throw new ProcurementError(409,'بعض المنتجات لم تعد موجودة');
   const snapshot=new Map(products.map(p=>[p.id,p]));
   const created=await tx.purchaseOrder.create({
    data:{requestId:input.requestId as string,supplierId,createdById:actor,note,
     lines:{create:items.map(it=>({
      productId:it.productId,productName:snapshot.get(it.productId)!.name,
      sku:snapshot.get(it.productId)!.sku,
      quantity:it.quantity,unitCostIqd:it.unitCostIqd
     }))}}
   });
   return {id:created.id,alreadyCreated:false};
  });
  res.setHeader('Cache-Control','no-store');
  return res.status(draft.alreadyCreated?200:201).json({
   ...draft,notice:'مسودة داخلية فقط؛ لم تُرسل للمورد، ولم تتغير كمية المخزون أو الأموال'
  });
 }catch(e){
  if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')
   return res.status(409).json({error:'توجد محاولة بنفس المعرّف؛ حدّث المسودات للتحقق قبل الإعادة'});
  return handle(res,e,'create purchase draft');
 }
});
export default router;
