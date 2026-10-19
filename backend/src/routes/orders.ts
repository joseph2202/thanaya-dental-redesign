import { Router, Request } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { getJwtSecret } from '../config/auth';
import { requireAdmin, requireSales } from '../middleware/requireAdmin';
import { isProvince } from './delivery';
import {discountFor,normalizeCode} from './coupons';

const router = Router();
const prisma = new PrismaClient();
const MAX_LINES = 50;
const MAX_QUANTITY = 100;

type BasketLine = { productId: string; quantity: number };
type Customer = { name: string; phone: string; address: string; city: string };
type Principal = { id: string; role: string };
type StoredOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;

// The same checkout intent has a stable, unique order ID even after a lost response.
function requestOrderId(userId: string, requestId: string): string {
  return 'ord_' + createHash('sha256').update(userId + ':' + requestId).digest('hex').slice(0,32);
}

function matchesCheckout(order: StoredOrder, userId: string, lines: BasketLine[], customer: Customer, couponCode:string|null): boolean {
  if((order.couponCode??null)!==couponCode)return false;
  if (order.userId !== userId || order.customerName !== customer.name ||
      order.customerPhone !== customer.phone || order.customerAddress !== customer.address ||
      order.customerCity !== customer.city || order.items.length !== lines.length) return false;
  const saved = new Map(order.items.map(item => [item.productId, item.quantity]));
  return lines.every(item => saved.get(item.productId) === item.quantity);
}

class OrderError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function principalFromRequest(req: Request): Promise<Principal | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const token = jwt.verify(header.slice(7), getJwtSecret());
    if (typeof token === 'string' || typeof token.userId !== 'string') return null;
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { id: true, role: true }
    });
    return user;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) return null;
    throw error;
  }
}

function parseLines(input: unknown): BasketLine[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_LINES) {
    throw new OrderError(400, 'السلة يجب أن تحتوي من 1 إلى 50 منتجاً');
  }
  const lines: BasketLine[] = [];
  const seen = new Set<string>();
  for (const line of input) {
    if (typeof line !== 'object' || line === null) throw new OrderError(400, 'بيانات المنتج غير صالحة');
    const entry = line as Record<string, unknown>;
    const productId = entry.productId ?? (entry.product as Record<string, unknown> | undefined)?.id;
    if (typeof productId !== 'string' || !productId.trim() || seen.has(productId)) {
      throw new OrderError(400, 'معرّف المنتج مفقود أو مكرر');
    }
    if (!Number.isInteger(entry.quantity) || (entry.quantity as number) < 1 || (entry.quantity as number) > MAX_QUANTITY) {
      throw new OrderError(400, 'الكمية يجب أن تكون رقماً صحيحاً بين 1 و100');
    }
    seen.add(productId);
    lines.push({ productId, quantity: entry.quantity as number });
  }
  return lines;
}

function parseCustomer(input: unknown): Customer {
  if (!input || typeof input !== 'object') throw new OrderError(400, 'بيانات التوصيل مطلوبة');
  const data = input as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const address = typeof data.address === 'string' ? data.address.trim() : '';
  const city = typeof data.city === 'string' ? data.city.trim() : '';
  if (name.length < 2 || name.length > 120) throw new OrderError(400, 'الاسم غير صالح');
  if (!/^07\d{9}$/.test(phone)) throw new OrderError(400, 'أدخل رقم هاتف عراقي صحيح يبدأ بـ07');
  if (address.length < 5 || address.length > 500) throw new OrderError(400, 'أدخل عنوان توصيل مفصل');
  if (city.length < 2 || city.length > 60) throw new OrderError(400, 'اختر المحافظة');
  return { name, phone, address, city };
}

function reportError(res: import('express').Response, error: unknown, context: string) {
  if (error instanceof OrderError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P1008', 'P2028', 'P2010'].includes(error.code)) {
    res.status(409).json({ error: 'تغير المخزون أو يوجد طلب متزامن، يرجى المحاولة مجدداً' });
    return;
  }
  console.error(context, error);
  res.status(500).json({ error: 'تعذرت معالجة الطلب، حاول مرة ثانية' });
}

// Admin-only overview.
router.get('/', requireSales, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) { reportError(res, error, 'list orders'); }
});

// Paginated operations view. Existing /orders stays backward-compatible for the dashboard.
const ORDER_STATES=['pending','confirmed','shipped','delivered','cancelled','returned'] as const;
router.get('/manage',requireSales,async(req,res)=>{
  try{
    const rawPage=typeof req.query.page==='string'?req.query.page:'1';
    if(!/^[1-9]\d{0,4}$/.test(rawPage))return res.status(400).json({error:'رقم الصفحة غير صالح'});
    const page=Number(rawPage),limit=20;
    const status=typeof req.query.status==='string'?req.query.status:'all';
    if(status!=='all'&&!ORDER_STATES.includes(status as typeof ORDER_STATES[number]))
      return res.status(400).json({error:'فلتر الحالة غير صالح'});
    const search=typeof req.query.search==='string'?req.query.search.trim():'';
    if(search.length>100||Object.keys(req.query).some(k=>!['page','status','search'].includes(k)))
      return res.status(400).json({error:'فلتر البحث غير صالح'});
    const searchWhere:Prisma.OrderWhereInput=search?{OR:[
      {id:{contains:search}},{customerName:{contains:search}},
      {customerPhone:{contains:search}},{customerCity:{contains:search}},
      {customerAddress:{contains:search}}
    ]}:{};
    const where:Prisma.OrderWhereInput={...searchWhere,...(status==='all'?{}:{status})};
    const [rows,total,states]=await Promise.all([
      prisma.order.findMany({where,include:{items:{include:{product:{select:{name:true}}}}},
        orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit}),
      prisma.order.count({where}),
      prisma.order.groupBy({by:['status'],_count:{_all:true},where:searchWhere})
    ]);
    const counts:Object=Object.fromEntries(ORDER_STATES.map(x=>[x,0]));
    for(const entry of states)(counts as Record<string,number>)[entry.status]=entry._count._all;
    res.json({orders:rows,total,page,pageSize:limit,totalPages:Math.max(1,Math.ceil(total/limit)),
      statusCounts:counts,matchingSearchTotal:states.reduce((a,s)=>a+s._count._all,0)});
  }catch(error){reportError(res,error,'manage orders')}
});

// Read a customer's own order history from the database, never browser storage.
router.get('/mine', async (req, res) => {
  try {
    const principal = await principalFromRequest(req);
    if (!principal) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    const orders = await prisma.order.findMany({
      where: { userId: principal.id },
      include: { items: { include: { product: { select: { id: true, name: true, image: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) { reportError(res, error, 'my orders'); }
});

// The confirmation page can view only the logged-in owner's order.
router.get('/:id', async (req, res) => {
  try {
    const principal = await principalFromRequest(req);
    if (!principal) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: { items: { include: { product: { select: { id: true, name: true, image: true } } } } }
    });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (order.userId !== principal.id && !['owner','admin','sales'].includes(principal.role)) {
      return res.status(403).json({ error: 'لا يمكنك عرض هذا الطلب' });
    }
    res.json(order);
  } catch (error) { reportError(res, error, 'get order'); }
});

// Server-owned prices and conditional stock decrements in ONE database transaction.
// Client-supplied total, item prices, and userId are intentionally ignored.
router.post('/', async (req, res) => {
  let submission: { id: string; userId: string; lines: BasketLine[]; customer: Customer;couponCode:string|null } | null = null;
  try {
    const principal = await principalFromRequest(req);
    if (!principal) return res.status(401).json({ error: 'سجل الدخول حتى تؤكد طلبك' });
    const lines = parseLines(req.body?.items);
    const customer = parseCustomer(req.body?.customer);
    const requestId = req.body?.requestId;
    if (typeof requestId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new OrderError(400, 'معرّف عملية الشراء مفقود أو غير صالح، حدّث الصفحة وحاول مجدداً');
    }
    const id = requestOrderId(principal.id, requestId);
    const couponCode=req.body?.couponCode==null||req.body.couponCode===''?null:typeof req.body.couponCode==='string'?normalizeCode(req.body.couponCode):null;
    if(req.body?.couponCode && (!couponCode||!/^[A-Z0-9_-]{3,32}$/.test(couponCode)))throw new OrderError(400,'رمز الخصم غير صالح');
    submission = { id, userId: principal.id, lines, customer, couponCode };

    // Replays return the original order, not a second purchase.
    const previous = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (previous) {
      if (!matchesCheckout(previous, principal.id, lines, customer,couponCode)) {
        throw new OrderError(409, 'تم استخدام معرّف الشراء لطلب مختلف');
      }
      return res.status(200).json(previous);
    }

    const order = await prisma.$transaction(async (tx) => {
      const config=await tx.deliveryConfig.findUnique({where:{id:'main'}});
      let shippingFee:number|null=null;
      if(config?.enabled){
        if(!isProvince(customer.city))throw new OrderError(400,'اختر محافظة صحيحة');
        const rate=await tx.deliveryRate.findUnique({where:{province:customer.city}});
        if(!rate?.available)throw new OrderError(400,'التوصيل غير متاح لهذه المحافظة');
        shippingFee=rate.fee;
      }
      const products = await tx.product.findMany({
        where: { id: { in: lines.map(item => item.productId) } },
        select: { id: true, name: true, price: true }
      });
      const byId = new Map(products.map(product => [product.id, product]));
      let total = 0;
      for (const item of lines) {
        const product = byId.get(item.productId);
        if (!product) throw new OrderError(400, 'أحد المنتجات لم يعد متوفراً');
        if (!Number.isSafeInteger(product.price) || product.price < 0) {
          throw new OrderError(409, 'سعر أحد المنتجات يحتاج مراجعة');
        }
        total += product.price * item.quantity;
        if (!Number.isSafeInteger(total)) throw new OrderError(400, 'إجمالي الطلب كبير جداً');
        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } }
        });
        if (result.count !== 1) {
          throw new OrderError(409, `الكمية المطلوبة من "${product.name}" غير متوفرة حالياً`);
        }
      }

      const updatedStock = await tx.product.findMany({where:{id:{in:lines.map(item=>item.productId)}},select:{id:true,stock:true}});
      const stockMap = new Map(updatedStock.map(p=>[p.id,p.stock]));
      const createdId = id;
      for (const item of lines) {
        const after = stockMap.get(item.productId);
        if (after === undefined) throw new OrderError(409,'تغير المخزون');
        await tx.inventoryMovement.create({data:{productId:item.productId,delta:-item.quantity,before:after+item.quantity,after,reason:'order_placed',referenceId:createdId,actorId:principal.id}});
      }

      const subtotal=total;
      let discountAmount=0;
      if(couponCode){
        const coupon=await tx.coupon.findUnique({where:{code:couponCode}});
        const discount=coupon?discountFor(coupon,subtotal):null;
        if(discount===null||!coupon)throw new OrderError(409,'الكوبون غير صالح أو انتهى أو استُنفدت استخداماته');
        const changed=await tx.coupon.updateMany({
          where:{id:coupon.id,active:true,...(coupon.maxUses!==null?{usedCount:{lt:coupon.maxUses}}:{})},
          data:{usedCount:{increment:1}}
        });
        if(changed.count!==1)throw new OrderError(409,'تم استنفاد الكوبون، يرجى المحاولة بدونه');
        discountAmount=discount;
      }
      total-=discountAmount;
      if(shippingFee!==null){
        total+=shippingFee;
        if(!Number.isSafeInteger(total))throw new OrderError(400,'إجمالي الطلب كبير جداً');
      }
      const created=await tx.order.create({
        data: {
          id,
          userId: principal.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          customerCity: customer.city,
          total,
          ...(shippingFee!==null ? {subtotal,shippingFee} : {subtotal}),
          ...(couponCode?{couponCode,discountAmount}:{}),
          items: {
            create: lines.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              price: byId.get(item.productId)!.price
            }))
          }
        },
        include: { items: true }
      });
      const staff=await tx.user.findMany({where:{role:{in:['owner','admin','sales']}},select:{id:true}});
      if(staff.length)await tx.notification.createMany({data:staff.map(u=>({
        recipientId:u.id,kind:'new_order',title:'طلب جديد',message:'وصل طلب من '+customer.name+' بقيمة '+total.toLocaleString('en-US')+' د.ع',orderId:created.id
      }))});
      return created;
    }, { maxWait: 5000, timeout: 10000 });

    res.status(201).json(order);
  } catch (error) {
    // When a concurrent retry committed first, the unique order ID wins;
    // report that *same* order after checking its ownership and contents.
    if (submission) {
      try {
        const previous = await prisma.order.findUnique({
          where: { id: submission.id }, include: { items: true }
        });
        if (previous) {
          if (matchesCheckout(previous, submission.userId, submission.lines, submission.customer,submission.couponCode)) {
            return res.status(200).json(previous);
          }
          return res.status(409).json({ error: 'تم استخدام معرّف الشراء لطلب مختلف' });
        }
      } catch (lookupError) {
        console.error('idempotency lookup failed', lookupError);
      }
    }
    reportError(res, error, 'create order');
  }
});

const transitions: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned: []
};

// Only admins may change status. Cancellation and confirmed returns restock ONCE.
router.patch('/:id/status', requireSales, async (req, res) => {
  try {
    const status = req.body?.status;
    if (typeof status !== 'string' || !Object.values(transitions).flat().includes(status)) {
      return res.status(400).json({ error: 'حالة الطلب غير صالحة' });
    }
    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: String(req.params.id) },
        include: { items: true }
      });
      if (!current) throw new OrderError(404, 'الطلب غير موجود');
      if (!(transitions[current.status] || []).includes(status)) {
        throw new OrderError(409, 'الانتقال بين حالتي الطلب غير مسموح');
      }

      const changed = await tx.order.updateMany({
        where: { id: current.id, status: current.status },
        data: { status }
      });
      if (changed.count !== 1) throw new OrderError(409, 'حالة الطلب تغيرت، حدّث الصفحة');
      if (status === 'cancelled' || status === 'returned') {
        for (const item of current.items) {
          const restored = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
            select: { stock:true }
          });
          await tx.inventoryMovement.create({data:{productId:item.productId,delta:item.quantity,before:restored.stock-item.quantity,after:restored.stock,reason:status === 'cancelled' ? 'order_cancelled' : 'order_returned',referenceId:current.id,actorId:res.locals.adminUserId as string}});
        }
      }
      if(current.userId)await tx.notification.create({data:{
        recipientId:current.userId,kind:'order_status',title:'تحديث حالة طلبك',
        message:'تغيرت حالة الطلب إلى '+({confirmed:'مؤكد',shipped:'تم الشحن',delivered:'تم التوصيل',cancelled:'ملغي',returned:'مرتجع'} as Record<string,string>)[status],
        orderId:current.id
      }});
      return tx.order.findUniqueOrThrow({ where: { id: current.id } });
    }, { maxWait: 5000, timeout: 10000 });
    res.json(order);
  } catch (error) { reportError(res, error, 'update order status'); }
});

export default router;
