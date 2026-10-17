import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    include: { orders: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users);
});

export default router;
