import {Router} from 'express';
import {PrismaClient} from '@prisma/client';
import {requireOwner} from '../middleware/requireAdmin';
export const provinces=['بغداد','البصرة','نينوى','أربيل','النجف','كربلاء','الأنبار','بابل','ديالى','ذي قار','صلاح الدين','كركوك','ميسان','المثنى','واسط','دهوك','السليمانية','حلبجة'] as const;
export const isProvince=(s:string)=>provinces.includes(s as typeof provinces[number]);
const prisma=new PrismaClient(),router=Router();
const allowed=['enabled','revision','rates'];
async function getConfig(){
 const config=await prisma.deliveryConfig.findUnique({where:{id:'main'}});
 const rates=await prisma.deliveryRate.findMany();
 return {enabled:config?.enabled??false,revision:config?.revision??0,
  rates:provinces.map(province=>({province,fee:rates.find(r=>r.province===province)?.fee??0,available:rates.find(r=>r.province===province)?.available??false}))};
}
router.get('/public',async(_req,res)=>{try{res.json(await getConfig())}catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل التوصيل'})}});
router.get('/',requireOwner,async(_req,res)=>{try{res.json(await getConfig())}catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل التوصيل'})}});
router.put('/',requireOwner,async(req,res)=>{
 const b=req.body;
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k))||
 typeof b.enabled!=='boolean'||!Number.isSafeInteger(b.revision)||b.revision<0||
 !Array.isArray(b.rates)||b.rates.length!==provinces.length)
 return res.status(400).json({error:'بيانات التوصيل غير صالحة'});
 const seen=new Set<string>();
 for(const r of b.rates){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['province','fee','available'].includes(k))||
  typeof r.province!=='string'||!isProvince(r.province)||seen.has(r.province)||
  typeof r.available!=='boolean'||!Number.isSafeInteger(r.fee)||r.fee<0||r.fee>1000000)
  return res.status(400).json({error:'تحقق من المحافظة وأجرة التوصيل'});
  seen.add(r.province);
 }
 if(b.enabled&&!b.rates.some((r:{available:boolean})=>r.available))
 return res.status(400).json({error:'اختر محافظة متاحة واحدة على الأقل قبل تفعيل التوصيل'});
 try {
  const result=await prisma.$transaction(async tx=>{
   const old=await tx.deliveryConfig.findUnique({where:{id:'main'}});
   if(!old){
    if(b.revision!==0)return false;
    await tx.deliveryConfig.create({data:{id:'main',enabled:b.enabled,revision:1}});
   }else{
    const updated=await tx.deliveryConfig.updateMany({where:{id:'main',revision:b.revision},data:{enabled:b.enabled,revision:{increment:1}}});
    if(updated.count!==1)return false;
   }
   const before=await tx.deliveryRate.findMany();
   for(const r of b.rates)await tx.deliveryRate.upsert({where:{province:r.province},create:r,update:{fee:r.fee,available:r.available}});
   await tx.deliverySettingsChange.create({data:{actorId:res.locals.adminUserId as string,before:JSON.stringify({enabled:old?.enabled??false,rates:before}),after:JSON.stringify({enabled:b.enabled,rates:b.rates})}});
   return true;
  });
  if(!result)return res.status(409).json({error:'تغيرت الإعدادات على جهاز آخر، حدث الصفحة'});
  res.json(await getConfig());
 }catch(e){console.error(e);res.status(500).json({error:'تعذر حفظ التوصيل'})}
});
export default router;
