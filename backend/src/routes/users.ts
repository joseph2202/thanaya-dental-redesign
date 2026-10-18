import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin,requireOwner } from '../middleware/requireAdmin';
const router=Router();
const prisma=new PrismaClient();
const roles=new Set(['customer','admin','inventory','sales']);
router.get('/',requireAdmin,async (_req,res)=>{
  try{res.json(await prisma.user.findMany({select:{id:true,name:true,email:true,phone:true,role:true,createdAt:true,orders:{select:{id:true}}},orderBy:{createdAt:'desc'}}));}
  catch(error){console.error(error);res.status(500).json({error:'تعذر جلب المستخدمين'});}
});
router.get('/role-history',requireOwner,async (_req,res)=>{
  try{res.json(await prisma.roleChange.findMany({take:50,orderBy:{createdAt:'desc'}}));}
  catch(error){console.error(error);res.status(500).json({error:'تعذر جلب سجل الصلاحيات'});}
});
router.patch('/:id/role',requireOwner,async(req,res)=>{
 const role=req.body?.role;
 if(typeof role!=='string'||!roles.has(role))return res.status(400).json({error:'الدور غير مسموح'});
 const id=String(req.params.id),actorId=res.locals.adminUserId as string;
 if(id===actorId)return res.status(403).json({error:'لا يمكنك تغيير صلاحية حسابك'});
 try {
  const result=await prisma.$transaction(async tx=>{
    const target=await tx.user.findUnique({where:{id},select:{role:true}});
    if(!target)return 'missing';
    if(target.role==='owner')return 'locked';
    if(target.role===role)return 'unchanged';
    const update=await tx.user.updateMany({where:{id,role:target.role},data:{role}});
    if(update.count!==1)return 'conflict';
    await tx.roleChange.create({data:{actorId,targetId:id,previousRole:target.role,newRole:role}});
    return 'updated';
  });
  if(result==='missing')return res.status(404).json({error:'المستخدم غير موجود'});
  if(result==='locked')return res.status(403).json({error:'لا يمكن تغيير صلاحية المالك'});
  if(result==='conflict')return res.status(409).json({error:'تغيرت الصلاحيات، حدث الصفحة'});
  return res.json({changed:result==='updated',user:await prisma.user.findUnique({where:{id},select:{id:true,name:true,email:true,role:true}})});
 }catch(error){console.error(error);return res.status(500).json({error:'تعذر تعديل الدور'});}
});
export default router;
