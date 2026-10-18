import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { getJwtSecret } from '../config/auth';
const prisma = new PrismaClient();
export type StaffRole = 'owner'|'admin'|'inventory'|'sales';
export const requireRoles = (...roles: StaffRole[]): RequestHandler => async (req,res,next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {res.status(401).json({error:'يجب تسجيل الدخول'});return;}
  try {
    const payload = jwt.verify(authorization.slice(7),getJwtSecret());
    if(typeof payload==='string'||typeof payload.userId!=='string'){res.status(401).json({error:'جلسة غير صالحة'});return;}
    const user=await prisma.user.findUnique({where:{id:payload.userId},select:{role:true}});
    if(!user){res.status(401).json({error:'جلسة غير صالحة'});return;}
    if(!roles.includes(user.role as StaffRole)){res.status(403).json({error:'غير مصرح لك بهذه العملية'});return;}
    res.locals.adminUserId=payload.userId;
    res.locals.staffRole=user.role;
    next();
  } catch(error) {
    if(error instanceof jwt.JsonWebTokenError){res.status(401).json({error:'جلسة غير صالحة'});return;}
    next(error);
  }
};
export const requireOwner=requireRoles('owner');
export const requireAdmin=requireRoles('owner','admin');
export const requireInventory=requireRoles('owner','admin','inventory');
export const requireSales=requireRoles('owner','admin','sales');
