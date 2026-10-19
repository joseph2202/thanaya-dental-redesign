import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;
const STATES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'] as const;
const BAGHDAD_MS = 3 * 60 * 60 * 1000;

// Report periods measure rolling days. The visual trend groups dates by Iraq time (UTC+3).
router.get('/overview', requireAdmin, async (req, res) => {
  const range = req.query.range === undefined ? '30' : req.query.range;
  if (typeof range !== 'string' || !['7', '30', '90', 'all'].includes(range) ||
      Object.keys(req.query).some(key => key !== 'range')) {
    return res.status(400).json({ error: 'الفترة المطلوبة غير صالحة' });
  }

  try {
    const now = new Date();
    const days = range === 'all' ? null : Number(range);
    const since = days === null ? undefined : new Date(now.getTime() - days * DAY_MS);
    const period: Prisma.OrderWhereInput = since ? { createdAt: { gte: since } } : {};
    const delivered: Prisma.OrderWhereInput = { ...period, status: 'delivered' };
    const trendDays = days === 7 ? 7 : 30;
    const trendStart = new Date(now.getTime() - (trendDays + 1) * DAY_MS);

    const [
      byStatus, deliveredSums, productTotal, lowStockTotal, outOfStockTotal,
      lowStock, topQuantities, trendOrders
    ] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], where: period, _count: { _all: true } }),
      prisma.order.aggregate({ where: delivered, _count: { _all: true },
        _sum: { total: true, shippingFee: true, discountAmount: true } }),
      prisma.product.count(),
      prisma.product.count({ where: { stock: { lte: 5 } } }),
      prisma.product.count({ where: { stock: 0 } }),
      prisma.product.findMany({ where: { stock: { lte: 5 } },
        select: { id: true, name: true, stock: true },
        orderBy: [{ stock: 'asc' }, { name: 'asc' }], take: 12 }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { is: delivered } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 8
      }),
      prisma.order.findMany({
        where: { status: 'delivered', createdAt: { gte: trendStart } },
        select: { createdAt: true, total: true }
      })
    ]);

    const productNames = topQuantities.length ? await prisma.product.findMany({
      where: { id: { in: topQuantities.map(p => p.productId) } },
      select: { id: true, name: true }
    }) : [];
    const names = new Map(productNames.map(p => [p.id, p.name]));
    const topProducts = topQuantities.map(p => ({
      productId: p.productId,
      name: names.get(p.productId) || 'منتج سابق',
      units: p._sum.quantity || 0
    }));

    const statusCounts: Record<string, number> = Object.fromEntries(STATES.map(s => [s, 0]));
    let orderCount = 0;
    for (const entry of byStatus) {
      statusCounts[entry.status] = entry._count._all;
      orderCount += entry._count._all;
    }

    const baghdadDate = (timestamp: number): string =>
      new Date(timestamp + BAGHDAD_MS).toISOString().slice(0, 10);
    const trendMap = new Map<string, { date: string; orders: number; value: number }>();
    for (let offset = trendDays - 1; offset >= 0; offset--) {
      const date = baghdadDate(now.getTime() - offset * DAY_MS);
      trendMap.set(date, { date, orders: 0, value: 0 });
    }
    for (const order of trendOrders) {
      const bucket = trendMap.get(baghdadDate(order.createdAt.getTime()));
      if (bucket) {
        bucket.orders += 1;
        bucket.value += order.total;
      }
    }

    const deliveredValue = deliveredSums._sum.total || 0;
    const deliveredOrders = deliveredSums._count._all;
    res.json({
      range,
      generatedAt: now.toISOString(),
      stats: {
        orders: orderCount,
        deliveredOrders,
        deliveredValue,
        discountsOnDelivered: deliveredSums._sum.discountAmount || 0,
        deliveryFeesOnDelivered: deliveredSums._sum.shippingFee || 0,
        averageDeliveredOrderValue: deliveredOrders ? Math.round(deliveredValue / deliveredOrders) : 0,
        awaitingOrders: statusCounts.pending + statusCounts.confirmed + statusCounts.shipped,
        cancelledOrders: statusCounts.cancelled,
        returnedOrders: statusCounts.returned,
        totalProducts: productTotal,
        lowStockProducts: lowStockTotal,
        outOfStockProducts: outOfStockTotal
      },
      statusCounts,
      topProducts,
      lowStock,
      trendDays,
      trend: Array.from(trendMap.values())
    });
  } catch (error) {
    console.error('sales and inventory reports', error);
    res.status(500).json({ error: 'تعذر تحميل التقارير حالياً' });
  }
});

export default router;
