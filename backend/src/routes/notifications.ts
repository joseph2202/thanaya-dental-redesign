import {Router} from 'express';
import {PrismaClient} from '@prisma/client';
import {requireRoles} from '../middleware/requireAdmin';
import jwt from 'jsonwebtoken';
import {getJwtSecret} from '../config/auth';
const prisma=new PrismaClient(),router=Router();
router.use(async(req,res,next)=>{
 const token=req.headers.authorization?.replace(/^Bearer /,'');
 if(!token)return res.status(401).json({error:'سجل الدخول أولاً'});
 try{
  const payload=jwt.verify(token,getJwtSecret());
  if(typeof payload==='string'||typeof payload.userId!=='string')return res.status(401).json({error:'جلسة غير صالحة'});
  const user=await prisma.user.findUnique({where:{id:payload.userId},select:{id:true,role:true}});
  if(!user)return res.status(401).json({error:'جلسة غير صالحة'});
  res.locals.notificationUser=user;next();
 }catch{return res.status(401).json({error:'جلسة غير صالحة'})}
});
router.get('/',async(_req,res)=>{
 try{
  const user=res.locals.notificationUser as {id:string;role:string};
  const [items,unread]=await Promise.all([
   prisma.notification.findMany({where:{recipientId:user.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50}),
   prisma.notification.count({where:{recipientId:user.id,readAt:null}})
  ]);
  let lowStock:{id:string;name:string;stock:number}[]=[];
  if(['owner','admin','inventory'].includes(user.role)){
   lowStock=await prisma.product.findMany({where:{stock:{lte:5}},select:{id:true,name:true,stock:true},orderBy:[{stock:'asc'},{name:'asc'}],take:50});
  }
  res.json({items,unread,lowStock});
 }catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل التنبيهات'})}
});
router.patch('/:id/read',async(req,res)=>{
 try{
  const user=res.locals.notificationUser as {id:string};
  const result=await prisma.notification.updateMany({where:{id:String(req.params.id),recipientId:user.id,readAt:null},data:{readAt:new Date()}});
  if(result.count===0){
   const exists=await prisma.notification.findFirst({where:{id:String(req.params.id),recipientId:user.id},select:{id:true}});
   if(!exists)return res.status(404).json({error:'التنبيه غير موجود'});
  }
  res.json({success:true});
 }catch(e){console.error(e);res.status(500).json({error:'تعذر تحديث التنبيه'})}
});
export default router;