import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json(categories);
});

router.post('/', async (req, res) => {
  const category = await prisma.category.create({ data: req.body });
  res.json(category);
});

router.delete('/:id', async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
