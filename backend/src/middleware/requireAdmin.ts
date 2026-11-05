import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { getJwtSecret } from '../config/auth';

const prisma = new PrismaClient();

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'يجب تسجيل الدخول' });
    return;
  }

  try {
    const payload = jwt.verify(authorization.slice(7), getJwtSecret());
    if (typeof payload === 'string' || typeof payload.userId !== 'string') {
      res.status(401).json({ error: 'جلسة غير صالحة' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true }
    });
    if (!user) {
      res.status(401).json({ error: 'جلسة غير صالحة' });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'غير مصرح لك بهذه العملية' });
      return;
    }
    // Signed-in administrator identifier is sourced from verified JWT + current DB role.
    // Never trust actorId from request bodies.
    res.locals.adminUserId = payload.userId;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'جلسة غير صالحة' });
      return;
    }
    next(error);
  }
};
