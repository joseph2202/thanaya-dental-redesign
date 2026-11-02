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


// ERP05 private cost coverage for completed, unreturned delivered orders.
// Never backfill legacy COGS using current Product.purchaseCostIqd.
// Excluding any order with merchandise returns is conservative: its net
// revenue and matching COGS need a dedicated refund/return reconciliation.
router.get('/costs',requireAdmin,async(req,res)=>{
 const range=req.query.range===undefined?'30':req.query.range;
 if(typeof range!=='string'||!['7','30','90','all'].includes(range)||
    Object.keys(req.query).some(key=>key!=='range'))
  return res.status(400).json({error:'فترة تقرير التكلفة غير صالحة'});
 try{
  const since=range==='all'?undefined:new Date(Date.now()-Number(range)*DAY_MS);
  const where:Prisma.OrderWhereInput={
   status:'delivered',...(since?{createdAt:{gte:since}}:{})
  };
  let eligibleDelivered=0,completeCostOrders=0,missingCostOrders=0,
      returnedDeliveredOrders=0,knownCostIqd=0,coveredSalesIqd=0;
  // Paged rather than a silently truncated "all time" estimate.
  let cursor:string|undefined;
  while(true){
   const batch=await prisma.order.findMany({
    where,orderBy:{id:'asc'},take:150,
    ...(cursor?{skip:1,cursor:{id:cursor}}:{}),
    select:{
     id:true,total:true,shippingFee:true,
     items:{select:{
      id:true,quantity:true,
      costSnapshots:{select:{quantity:true,unitCostIqd:true}},
      returnLines:{select:{id:true}}
     }}
    }
   });
   if(!batch.length)break;
   for(const order of batch){
    eligibleDelivered++;
    // If any merchandise return happened, omit the entire order from
    // comparable margin until refund / return revenue recognition exists.
    if(order.items.some(item=>item.returnLines.length>0)){
     returnedDeliveredOrders++;continue;
    }
    let cost=0,complete=true;
    for(const item of order.items){
     const captured=item.costSnapshots.reduce((n,x)=>n+x.quantity,0);
     if(!item.costSnapshots.length||captured!==item.quantity||
        item.costSnapshots.some(x=>x.unitCostIqd===null||x.unitCostIqd<0)){
      complete=false;break;
     }
     for(const row of item.costSnapshots)cost+=row.quantity*row.unitCostIqd!;
    }
    const merchandiseRevenue=order.total-(order.shippingFee||0);
    if(!complete||!Number.isSafeInteger(cost)||!Number.isSafeInteger(merchandiseRevenue)||
       merchandiseRevenue<0){missingCostOrders++;continue;}
    completeCostOrders++;knownCostIqd+=cost;coveredSalesIqd+=merchandiseRevenue;
   }
   cursor=batch[batch.length-1].id;
   if(batch.length<150)break;
  }
  const safe=[eligibleDelivered,completeCostOrders,knownCostIqd,coveredSalesIqd].every(Number.isSafeInteger);
  if(!safe)throw new Error('COGS totals exceed safe integer limits');
  const unreturned=eligibleDelivered-returnedDeliveredOrders;
  res.setHeader('Cache-Control','no-store');
  return res.json({
   range,generatedAt:new Date().toISOString(),
   eligibleDelivered,completeCostOrders,missingCostOrders,returnedDeliveredOrders,
   unreturnedDeliveredOrders:unreturned,
   coveragePercent:unreturned?Math.round(completeCostOrders/unreturned*100):0,
   knownCostIqd,coveredSalesIqd,
   knownMerchandiseMarginIqd:coveredSalesIqd-knownCostIqd,
   complete:missingCostOrders===0&&returnedDeliveredOrders===0,
   warning:'هامش البضاعة للطلبات المسلّمة ذات تكلفة موثقة فقط. لا يشمل مصاريف التشغيل والتوصيل وعمولات التحصيل، ولا المرتجعات أو الطلبات القديمة مجهولة التكلفة. ليس صافي الربح.'
  });
 }catch(error){
  console.error('private cost coverage report',error);
  res.status(500).json({error:'تعذر استخراج ملخص تكلفة البضاعة'});
 }
});

export default router;
