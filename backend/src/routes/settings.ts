import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireOwner } from '../middleware/requireAdmin';
const router=Router(), prisma=new PrismaClient();
const defaults={
  id:'main',siteName:'ثنايا',siteDescription:'متجر عراقي للمستلزمات الطبية وطب الأسنان والأجهزة',
  phone:'07822088894',email:'info@thanaya.iq',
  address:'البصرة - حي الخضراء - شارع مستشفى النفط',
  workingHours:'السبت - الخميس: 12 ظهراً - 9 مساءً',
  usdToIqdRate:null as number|null,showUsdApprox:false
};
const editable=['siteName','siteDescription','phone','email','address','workingHours','usdToIqdRate','showUsdApprox'] as const;
const publicFields={siteName:true,siteDescription:true,phone:true,email:true,address:true,workingHours:true,usdToIqdRate:true,showUsdApprox:true,revision:true} as const;
async function current(){
  return prisma.storeSettings.findUnique({where:{id:'main'}}) || {
    ...defaults,revision:0,updatedAt:new Date(0)
  };
}
function validate(raw:any){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>![...editable,'revision'].includes(k as any))) throw Error('حقول غير مسموحة');
 const fields:any={};
 const limits:any={siteName:100,siteDescription:600,phone:40,email:120,address:350,workingHours:160};
 for(const [key,limit] of Object.entries(limits)){
   if(typeof raw[key]!=='string'||!raw[key].trim()||raw[key].trim().length>(limit as number))throw Error('قيمة غير صالحة: '+key);
   fields[key]=raw[key].trim();
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))throw Error('البريد غير صالح');
 if(typeof raw.showUsdApprox!=='boolean')throw Error('خيار الدولار غير صالح');
 const rate=raw.usdToIqdRate;
 if(rate!==null && (!Number.isSafeInteger(rate)||rate<100||rate>10000))throw Error('سعر الصرف يجب أن يكون عدداً صحيحاً بين 100 و10000');
 if(raw.showUsdApprox && rate===null)throw Error('أدخل سعر الصرف قبل تفعيل الدولار');
 if(!Number.isSafeInteger(raw.revision)||raw.revision<0)throw Error('إصدار إعدادات غير صالح');
 return {...fields,usdToIqdRate:rate,showUsdApprox:raw.showUsdApprox};
}
router.get('/public',async(_req,res)=>{
 try{ const row=await current(); const {siteName,siteDescription,phone,email,address,workingHours,usdToIqdRate,showUsdApprox}=row;res.json({siteName,siteDescription,phone,email,address,workingHours,usdToIqdRate,showUsdApprox}); }
 catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل الإعدادات'});}
});
router.get('/',requireOwner,async(_req,res)=>{
 try{const row=await current(); const {id,updatedAt,...rest}=row;res.json(rest);}
 catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل الإعدادات'});}
});
router.put('/',requireOwner,async(req,res)=>{
 let values:ReturnType<typeof validate>;
 try{values=validate(req.body);}catch(e){return res.status(400).json({error:e instanceof Error?e.message:'إعدادات غير صالحة'});}
 const expected=req.body.revision as number, actorId=res.locals.adminUserId as string;
 try {
  const result=await prisma.$transaction(async tx=>{
   // Initialize exactly once, in the same transaction as the first saved update.
   const row=await tx.storeSettings.findUnique({where:{id:'main'}});
   if(!row){
     if(expected!==0)return null;
     await tx.storeSettings.create({data:{...defaults,...values,revision:1}});
     await tx.storeSettingsChange.create({data:{actorId,before:JSON.stringify(defaults),after:JSON.stringify(values)}});
     return 1;
   }
   const updated=await tx.storeSettings.updateMany({where:{id:'main',revision:expected},data:{...values,revision:{increment:1}}});
   if(updated.count!==1)return null;
   await tx.storeSettingsChange.create({data:{actorId,before:JSON.stringify(row),after:JSON.stringify(values)}});
   return expected+1;
  });
  if(result===null)return res.status(409).json({error:'تغيّرت إعدادات المتجر من جهاز آخر. حدّث الصفحة قبل الحفظ'});
  const saved=await prisma.storeSettings.findUniqueOrThrow({where:{id:'main'},select:publicFields});
  res.json(saved);
 } catch(e){console.error(e);res.status(500).json({error:'فشل حفظ الإعدادات'});}
});
export default router;
