import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, phone: true,
      role: true, createdAt: true, orders: { select: { id: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users);
});

export default router;
