import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json(categories);
});

router.post('/', requireAdmin, async (req, res) => {
  const category = await prisma.category.create({ data: req.body });
  res.json(category);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.category.delete({ where: { id: String(req.params.id) } });
  res.json({ success: true });
});

export default router;
