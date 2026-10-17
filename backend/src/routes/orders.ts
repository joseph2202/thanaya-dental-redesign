import { Router, Request } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();
const MAX_LINES = 50;
const MAX_QUANTITY = 100;

type BasketLine = { productId: string; quantity: number };
type Customer = { name: string; phone: string; address: string; city: string };
type Principal = { id: string; role: string };

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
      ['P2034', 'P1008', 'P2028'].includes(error.code)) {
    res.status(409).json({ error: 'تغير المخزون أو يوجد طلب متزامن، يرجى المحاولة مجدداً' });
    return;
  }
  console.error(context, error);
  res.status(500).json({ error: 'تعذرت معالجة الطلب، حاول مرة ثانية' });
}

// Admin-only overview.
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) { reportError(res, error, 'list orders'); }
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
    if (order.userId !== principal.id && principal.role !== 'admin') {
      return res.status(403).json({ error: 'لا يمكنك عرض هذا الطلب' });
    }
    res.json(order);
  } catch (error) { reportError(res, error, 'get order'); }
});

// Server-owned prices and conditional stock decrements in ONE database transaction.
// Client-supplied total, item prices, and userId are intentionally ignored.
router.post('/', async (req, res) => {
  try {
    const principal = await principalFromRequest(req);
    if (!principal) return res.status(401).json({ error: 'سجل الدخول حتى تؤكد طلبك' });
    const lines = parseLines(req.body?.items);
    const customer = parseCustomer(req.body?.customer);

    const order = await prisma.$transaction(async (tx) => {
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

      return tx.order.create({
        data: {
          userId: principal.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          customerCity: customer.city,
          total,
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
    }, { maxWait: 5000, timeout: 10000 });

    res.status(201).json(order);
  } catch (error) { reportError(res, error, 'create order'); }
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
router.patch('/:id/status', requireAdmin, async (req, res) => {
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
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
          });
        }
      }
      return tx.order.findUniqueOrThrow({ where: { id: current.id } });
    }, { maxWait: 5000, timeout: 10000 });
    res.json(order);
  } catch (error) { reportError(res, error, 'update order status'); }
});

export default router;
