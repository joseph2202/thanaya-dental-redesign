import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();
class InputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fields = ['name','description','price','usdPrice','category','brand','icon','image','badge'] as const;
type Editable = { name:string; description:string; price:number; usdPrice:number; category:string; brand:string; icon:string; image:string|null; badge:string|null };
const textField = (v: unknown, name: string, limit: number, required = true) => {
  if (typeof v !== 'string') throw new InputError(400, name + ' غير صالح');
  const cleaned = v.trim();
  if (cleaned.length > limit || (required && cleaned.length === 0)) throw new InputError(400, name + ' غير صالح');
  return cleaned;
};
function parseMoney(v: unknown, name: string): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > 1000000000) {
    throw new InputError(400, name + ' يجب أن يكون رقماً صحيحاً موجباً أو صفراً');
  }
  return v as number;
}
function parseProduct(data: unknown, partial: boolean): Partial<Editable> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InputError(400, 'بيانات المنتج غير صالحة');
  const raw = data as Record<string, unknown>;
  if (Object.keys(raw).some(k => !fields.includes(k as (typeof fields)[number]))) {
    throw new InputError(400, 'حقل غير مسموح. عدّل المخزون عبر نقطة إدارة المخزون فقط');
  }
  if (partial && Object.keys(raw).length === 0) throw new InputError(400, 'لا توجد بيانات للتعديل');
  const result: Partial<Editable> = {};
  for (const key of fields) {
    if (partial && !Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const val = raw[key];
    switch (key) {
      case 'price':
      case 'usdPrice': result[key] = parseMoney(val, key); break;
      case 'image':
        if (val === undefined || val === null || val === '') { result.image = null; break; }
        result.image = textField(val, 'الصورة', 2048); break;
      case 'badge':
        if (val === undefined || val === null || val === '') { result.badge = null; break; }
        if (!['new','sale','popular'].includes(String(val))) throw new InputError(400, 'شارة غير صالحة');
        result.badge = val as string;
        break;
      case 'name': result.name = textField(val, 'الاسم', 160); break;
      case 'description': result.description = textField(val, 'الوصف', 4000); break;
      case 'category': result.category = textField(val, 'التصنيف', 90); break;
      case 'brand': result.brand = textField(val, 'الماركة', 120); break;
      case 'icon': result.icon = textField(val ?? 'Package', 'الأيقونة', 80); break;
    }
  }
  return result;
}
function respondError(res: import('express').Response, error: unknown) {
  if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'المنتج غير موجود' });
    if (['P2003', 'P2014'].includes(error.code)) return res.status(409).json({ error: 'المنتج مرتبط بسجل طلبات أو مخزون، ولا يمكن حذفه' });
    if (['P2034', 'P1008','P2028'].includes(error.code)) return res.status(409).json({ error: 'تغيّر المخزون بالتزامن، حدّث الصفحة ثم حاول ثانية' });
  }
  console.error('products', error);
  return res.status(500).json({ error: 'تعذرت معالجة المنتج' });
}

router.get('/', async (req, res) => {
  try {
    const { category, brand, sort, minPrice, maxPrice, search } = req.query;
    const where: Prisma.ProductWhereInput = {};
    if (typeof category === 'string' && category.trim()) where.category = category.trim();
    if (typeof brand === 'string' && brand.trim()) where.brand = brand.trim();
    const price: Prisma.IntFilter = {};
    if (minPrice !== undefined) price.gte = parseMoney(Number(minPrice), 'الحد الأدنى');
    if (maxPrice !== undefined) price.lte = parseMoney(Number(maxPrice), 'الحد الأعلى');
    if (Object.keys(price).length) where.price = price;
    if (typeof search === 'string' && search.trim()) {
      const term = textField(search, 'البحث', 100);
      where.OR = [{name:{contains:term}},{description:{contains:term}},{brand:{contains:term}}];
    }
    const orders: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      'price-asc': {price:'asc'}, 'price-desc':{price:'desc'}, name:{name:'asc'}
    };
    res.json(await prisma.product.findMany({ where, orderBy: typeof sort === 'string' && orders[sort] ? orders[sort] : {createdAt:'desc'} }));
  } catch (error) { respondError(res, error); }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json(product);
  } catch (error) { respondError(res, error); }
});

router.get('/:id/inventory', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const product = await prisma.product.findUnique({ where: { id }, select: { id:true,name:true,stock:true } });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    const movements = await prisma.inventoryMovement.findMany({
      where: { productId:id }, orderBy:[{createdAt:'desc'},{id:'desc'}], take: 100
    });
    res.json({ product, movements });
  } catch (error) { respondError(res,error); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { stock: initialStock, ...fieldsOnly } = req.body || {};
    const data = parseProduct(fieldsOnly, false);
    const stock = initialStock;
    // Stock is allowed ONLY during initial creation, then every change is audited.
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
      throw new InputError(400, 'كمية البداية غير صالحة');
    }
    const actorId = res.locals.adminUserId as string;
    const created = await prisma.$transaction(async tx => {
      const product = await tx.product.create({data:{...(data as Prisma.ProductCreateInput),stock}});
      if (stock > 0) await tx.inventoryMovement.create({data:{
        productId:product.id, before:0, after:stock, delta:stock, reason:'opening_balance', actorId
      }});
      return product;
    });
    res.status(201).json(created);
  } catch (error) { respondError(res,error); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = parseProduct(req.body, true);
    const product = await prisma.product.update({where:{id:String(req.params.id)},data});
    res.json(product);
  } catch (error) { respondError(res,error); }
});

router.post('/:id/stock-adjustment', requireAdmin, async (req, res) => {
  try {
    const { delta, reason } = req.body || {};
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000000) {
      throw new InputError(400, 'فرق المخزون يجب أن يكون عدداً صحيحاً غير صفر');
    }
    const note = textField(reason, 'سبب التعديل', 250);
    const actorId = res.locals.adminUserId as string;
    const productId = String(req.params.id);
    const updated = await prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({ where:{id:productId},select:{stock:true} });
      if (!product) throw new InputError(404,'المنتج غير موجود');
      const after = product.stock + delta;
      if (!Number.isSafeInteger(after) || after < 0 || after > 1000000) throw new InputError(409,'الكمية الناتجة غير مسموحة');
      const changed = await tx.product.updateMany({
        where:{id:productId,stock:product.stock}, data:{stock:after}
      });
      if (changed.count !== 1) throw new InputError(409,'المخزون تغير، حدّث الصفحة ثم أعد المحاولة');
      await tx.inventoryMovement.create({data:{
        productId,delta,before:product.stock,after,reason:'manual: '+note,actorId
      }});
      return tx.product.findUniqueOrThrow({where:{id:productId}});
    });
    res.json(updated);
  } catch (error) { respondError(res,error); }
});

router.delete('/:id', requireAdmin, async (req,res) => {
  try {
    const id = String(req.params.id);
    const product = await prisma.product.findUnique({where:{id},select:{stock:true}});
    if (!product) return res.status(404).json({error:'المنتج غير موجود'});
    if (product.stock !== 0) throw new InputError(409,'صفّر المخزون بإجراء موثق قبل حذف المنتج');
    const count = await prisma.orderItem.count({where:{productId:id}});
    if (count) throw new InputError(409,'المنتج مرتبط بطلبات سابقة ولا يجوز حذف سجله');
    const history = await prisma.inventoryMovement.count({where:{productId:id}});
    if (history) throw new InputError(409,'المنتج لديه سجل مخزون ولا يجوز حذف سجله');
    await prisma.product.delete({where:{id}});
    res.json({success:true});
  } catch (error) {respondError(res,error);}
});

export default router;
