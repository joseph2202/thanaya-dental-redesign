import {Router} from 'express';
import {PrismaClient,Prisma} from '@prisma/client';
import {requireAdmin} from '../middleware/requireAdmin';
import {createXlsx,Sheet} from '../lib/simpleXlsx';

const router=Router(),prisma=new PrismaClient();
const allowed=['7','30','90','all'] as const;
const statuses:Record<string,string>={pending:'قيد المعالجة',confirmed:'مؤكد',shipped:'بالطريق',delivered:'مُسلّم',cancelled:'ملغي',returned:'مرتجع'};
const date=(d:Date)=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const value=(key:string)=>parts.find(p=>p.type===key)?.value||'';
 return value('year')+'-'+value('month')+'-'+value('day');
};
const safe=(v:string|null|undefined)=>v||'';
const title=(v:string|null|undefined)=>v||'منتج';
function send(res:import('express').Response,buf:Buffer,name:string){
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition',`attachment; filename="${name}"`);
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.send(buf);
}

// Orders contain personal data: only owner/admin, never unauthenticated/public URLs.
router.get('/orders',requireAdmin,async(req,res)=>{
 const raw=req.query.range===undefined?'30':req.query.range;
 if(typeof raw!=='string'||!allowed.includes(raw as typeof allowed[number])||
    Object.keys(req.query).some(k=>k!=='range'))
   return res.status(400).json({error:'الفترة المطلوبة غير صالحة'});
 try{
  const since=raw==='all'?undefined:new Date(Date.now()-Number(raw)*86400000);
  const where:Prisma.OrderWhereInput=since?{createdAt:{gte:since}}:{};
  const rows=await prisma.order.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],
   take:10001,include:{items:{include:{product:{select:{name:true}}}}}});
  if(rows.length>10000)return res.status(413).json({error:'يوجد أكثر من 10 آلاف طلب؛ اختر فترة أصغر'});
  const orders:Sheet={name:'الطلبات',headers:[
   'رقم الطلب','تاريخ الطلب - توقيت العراق','اسم المستلم','الهاتف','المحافظة','العنوان',
   'الحالة','مجموع المنتجات - د.ع','الخصم - د.ع','التوصيل - د.ع','الإجمالي المحفوظ - د.ع','رمز الخصم','طريقة الدفع'
  ],rows:rows.map(o=>[
   o.id,new Date(o.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'short',timeStyle:'short'}),
   o.customerName,o.customerPhone,o.customerCity,o.customerAddress,statuses[o.status]||o.status,
   o.subtotal??o.items.reduce((s,i)=>s+i.price*i.quantity,0),o.discountAmount??0,
   o.shippingFee??null,o.total,safe(o.couponCode),o.paymentMethod
  ])};
  const details:Sheet={name:'بنود الطلبات',headers:['رقم الطلب','اسم المنتج وقت الطلب (إن توفر)','معرّف المنتج','الكمية','سعر الوحدة المحفوظ - د.ع','مجموع البند - د.ع'],
   rows:rows.flatMap(o=>o.items.map(i=>[o.id,title(i.productName||i.product?.name),i.productId,i.quantity,i.price,i.quantity*i.price]))};
  const buf=createXlsx([orders,details]);
  send(res,buf,'thanaya-orders-'+date(new Date())+'.xlsx');
 }catch(e){console.error('export orders',e);res.status(500).json({error:'تعذّر تصدير الطلبات'})}
});

router.get('/inventory',requireAdmin,async(req,res)=>{
 if(Object.keys(req.query).length)return res.status(400).json({error:'لا توجد فلاتر مسموحة'});
 try{
  const rows=await prisma.product.findMany({orderBy:[{category:'asc'},{name:'asc'}],take:10001,
   include:{lots:{orderBy:[{expiryDate:'asc'},{code:'asc'}]}}});
  if(rows.length>10000)return res.status(413).json({error:'حجم الكتالوج كبير جداً للتصدير المباشر'});
  const products:Sheet={name:'المنتجات والمخزون',headers:[
   'معرّف المنتج','رمز SKU','اسم المنتج','التصنيف','الماركة','الموديل','القياس','وحدة البيع',
   'سعر البيع - د.ع','المخزون الفيزيائي','حالة النشر','تتبّع التشغيلات'
  ],rows:rows.map(p=>[
   p.id,safe(p.sku),p.name,p.category,p.brand,safe(p.model),safe(p.size),safe(p.saleUnit),
   p.price,p.stock,p.published?'ظاهر':'مخفي',p.lotTracking?'نعم':'لا'
  ])};
  const lots:Sheet={name:'التشغيلات والصلاحية',headers:[
    'SKU','المنتج','رقم التشغيلة','انتهاء الصلاحية','الرصيد الفيزيائي','الحالة بتاريخ التصدير'
  ],rows:rows.flatMap(p=>p.lots.map(l=>[
   safe(p.sku),p.name,l.code,l.expiryDate,l.stock,l.expiryDate<date(new Date())?'منتهية':'غير منتهية'
  ]))};
  const buf=createXlsx([products,lots]);
  send(res,buf,'thanaya-inventory-'+date(new Date())+'.xlsx');
 }catch(e){console.error('export inventory',e);res.status(500).json({error:'تعذّر تصدير المخزون'})}
});
export default router;
