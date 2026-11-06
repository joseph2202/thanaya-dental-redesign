import {createHash} from 'node:crypto';
import type {RequestHandler} from 'express';
import jwt from 'jsonwebtoken';
import {PrismaClient} from '@prisma/client';
import {getJwtSecret} from '../config/auth';

const prisma=new PrismaClient();
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export class SessionStoreUnavailable extends Error {
  constructor(){super('Session revocation store unavailable');}
}
function verified(token:string,allowFuture=false):jwt.JwtPayload|null {
  try{
    const value=jwt.verify(token,getJwtSecret(),{algorithms:['HS256'],ignoreNotBefore:allowFuture});
    return typeof value!=='string'&&typeof value.userId==='string'?value:null;
  }catch(error){
    if(error instanceof jwt.JsonWebTokenError)return null;
    throw error;
  }
}
export async function ensureSessionStore():Promise<void>{
  try{await prisma.revokedSession.findFirst({select:{tokenHash:true,userId:true,expiresAt:true,createdAt:true}});}
  catch{throw new SessionStoreUnavailable();}
}
export async function revokeSession(token:string):Promise<void>{
  const payload=verified(token,true);
  if(!payload)return; // Expired/invalid credentials cannot authorize a replay.
  const expiry=typeof payload.exp==='number'?new Date(payload.exp*1000):null;
  // Old manually issued credentials may have no expiry. Never let a cleanup
  // silently reactivate them; current login credentials always expire in 7d.
  const expiresAt=expiry&&Number.isFinite(expiry.getTime())?expiry:new Date('9999-12-31T00:00:00Z');
  try{
    await prisma.$transaction(async tx=>{
      await tx.revokedSession.deleteMany({where:{expiresAt:{lt:new Date()}}});
      await tx.revokedSession.upsert({where:{tokenHash:digest(token)},update:{},
        create:{tokenHash:digest(token),userId:payload.userId,expiresAt}});
    });
  }catch{throw new SessionStoreUnavailable();}
}

// Run AFTER Cookie/CSRF normalization, before every API router. Do not cache
// negative checks: the very next request after logout must reject the token.
export const rejectRevokedSessions:RequestHandler=async(req,res,next)=>{
  // Express routes are case-insensitive and allow a trailing slash by default.
  const route=req.path.toLowerCase().replace(/\/+$/,'');
  if(!route.startsWith('/api/')||['/api/auth/login','/api/auth/register','/api/auth/logout'].includes(route))return next();
  const authorization=req.headers.authorization;
  if(!authorization?.startsWith('Bearer '))return next();
  const token=authorization.slice(7);
  if(!verified(token))return next(); // Existing protected routes reject invalid JWTs.
  try{
    const revoked=await prisma.revokedSession.findUnique({where:{tokenHash:digest(token)},select:{tokenHash:true}});
    if(revoked){res.status(401).json({error:'انتهت هذه الجلسة. سجل الدخول مجدداً.'});return;}
    next();
  }catch{
    // Never continue authenticated access if the durable journal cannot be read.
    res.status(503).json({error:'تعذّر التحقق من أمان الجلسة. حاول مرة ثانية بعد قليل.'});
  }
};
