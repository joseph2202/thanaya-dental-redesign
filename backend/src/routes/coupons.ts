import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAdmin, async (req, res) => {
  const coupons = await prisma.coupon.findMany();
  res.json(coupons);
});

router.post('/', requireAdmin, async (req, res) => {
  const coupon = await prisma.coupon.create({ data: req.body });
  res.json(coupon);
});

router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  const coupon = await prisma.coupon.findUnique({ where: { id: String(req.params.id) } });
  if (!coupon) return res.status(404).json({ error: 'غير موجود' });
  
  const updated = await prisma.coupon.update({
    where: { id: String(req.params.id) },
    data: { active: !coupon.active }
  });
  res.json(updated);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.coupon.delete({ where: { id: String(req.params.id) } });
  res.json({ success: true });
});

export default router;
