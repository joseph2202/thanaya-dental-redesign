import {Router} from 'express';
import {PrismaClient} from '@prisma/client';
import {requireAdmin} from '../middleware/requireAdmin';
const router=Router(), prisma=new PrismaClient();
export const normalizeCode=(s:string)=>s.trim().toUpperCase();
export function discountFor(c:{kind:string;discount:number;active:boolean;minSubtotal:number;maxUses:number|null;usedCount:number;expiresAt:Date|null},subtotal:number){
 if(!c.active||c.expiresAt && c.expiresAt.getTime()<=Date.now()||c.maxUses!==null&&c.usedCount>=c.maxUses||subtotal<c.minSubtotal)return null;
 if(c.kind==='percent')return Math.min(subtotal,Math.floor(subtotal*c.discount/100));
 if(c.kind==='fixed')return Math.min(subtotal,c.discount);
 return null;
}
router.get('/',requireAdmin,async(_req,res)=>{try{res.json(await prisma.coupon.findMany({orderBy:{createdAt:'desc'}}))}catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل الكوبونات'})}});
router.post('/',requireAdmin,async(req,res)=>{
 const b=req.body||{}, code=typeof b.code==='string'?normalizeCode(b.code):'';
 if(!/^[A-Z0-9_-]{3,32}$/.test(code)||!['percent','fixed'].includes(b.kind)||
 !Number.isSafeInteger(b.discount)||b.discount<1||(b.kind==='percent'?b.discount>100:b.discount>1_000_000_000)||
 !Number.isSafeInteger(b.minSubtotal)||b.minSubtotal<0||b.minSubtotal>1_000_000_000||
 (b.maxUses!==null&&(!Number.isSafeInteger(b.maxUses)||b.maxUses<1||b.maxUses>1_000_000))||
 (b.expiresAt!==null && (typeof b.expiresAt!=='string'||!Number.isFinite(Date.parse(b.expiresAt))||Date.parse(b.expiresAt)<=Date.now())))
 return res.status(400).json({error:'تحقق من رمز الكوبون وقيمته وشروط استخدامه'});
 try{res.status(201).json(await prisma.coupon.create({data:{code,kind:b.kind,discount:b.discount,minSubtotal:b.minSubtotal,maxUses:b.maxUses,expiresAt:b.expiresAt?new Date(b.expiresAt):null}}))}
 catch(e:any){res.status(e?.code==='P2002'?409:500).json({error:e?.code==='P2002'?'رمز الكوبون موجود مسبقاً':'تعذر إنشاء الكوبون'})}
});
router.patch('/:id/toggle',requireAdmin,async(req,res)=>{
 try{
 const id=String(req.params.id),old=await prisma.coupon.findUnique({where:{id}});
 if(!old)return res.status(404).json({error:'الكوبون غير موجود'});
 res.json(await prisma.coupon.update({where:{id},data:{active:!old.active}}));
 }catch(e){console.error(e);res.status(500).json({error:'تعذر تحديث الكوبون'})}
});
router.delete('/:id',requireAdmin,async(req,res)=>{
 try{
 const id=String(req.params.id),c=await prisma.coupon.findUnique({where:{id}});
 if(!c)return res.status(404).json({error:'الكوبون غير موجود'});
 if(c.usedCount>0)return res.status(409).json({error:'الكوبون مستخدم في طلبات سابقة. عطّله بدلاً من حذفه'});
 await prisma.coupon.delete({where:{id}});res.json({success:true});
 }catch(e){console.error(e);res.status(500).json({error:'تعذر حذف الكوبون'})}
});
export default router;
