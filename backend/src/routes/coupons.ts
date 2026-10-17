import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const coupons = await prisma.coupon.findMany();
  res.json(coupons);
});

router.post('/', async (req, res) => {
  const coupon = await prisma.coupon.create({ data: req.body });
  res.json(coupon);
});

router.patch('/:id/toggle', async (req, res) => {
  const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
  if (!coupon) return res.status(404).json({ error: 'غير موجود' });
  
  const updated = await prisma.coupon.update({
    where: { id: req.params.id },
    data: { active: !coupon.active }
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
