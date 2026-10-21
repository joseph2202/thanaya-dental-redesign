import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAdmin, requireInventory } from '../middleware/requireAdmin';

const router = Router();
const prisma = new PrismaClient();
class InputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fields = ['name','description','price','usdPrice','category','brand','icon','image','gallery','specs','sku','model','size','saleUnit','badge'] as const;
type Editable = { name:string; description:string; price:number; usdPrice:number; category:string; brand:string; icon:string; image:string|null; gallery:string|null; specs:string|null; sku:string|null; model:string|null; size:string|null; saleUnit:string|null; badge:string|null };
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
      case 'gallery': {
        if(val==null||val===''){result.gallery=null;break;}
        if(!Array.isArray(val)||val.length>5||val.some(v=>typeof v!=='string'||v.length>2048||!/^https?:\/\//.test(v)))throw new InputError(400,'صور المعرض غير صالحة');
        if(new Set(val).size!==val.length)throw new InputError(400,'صور المعرض مكررة');
        result.gallery=JSON.stringify(val);break;
      }
      case 'specs': {
        if(val==null||val===''){result.specs=null;break;}
        if(!Array.isArray(val)||val.length>12||val.some(v=>!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['label','value'].includes(k))||typeof v.label!=='string'||typeof v.value!=='string'||!v.label.trim()||!v.value.trim()||v.label.length>80||v.value.length>300))throw new InputError(400,'المواصفات غير صالحة');
        result.specs=JSON.stringify(val.map(v=>({label:v.label.trim(),value:v.value.trim()})));break;
      }
      case 'sku': {
        if (val === undefined || val === null || val === '') { result.sku = null; break; }
        const sku = textField(val, 'رمز SKU', 40).toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(sku)) throw new InputError(400, 'رمز SKU يقبل حروفاً إنجليزية وأرقاماً و- و_ ونقطة فقط');
        result.sku = sku;
        break;
      }
      case 'model':
      case 'size': {
        if (val === undefined || val === null || val === '') { result[key] = null; break; }
        result[key] = textField(val, key === 'model' ? 'الموديل' : 'المقاس', 100);
        break;
      }
      case 'saleUnit': {
        if (val === undefined || val === null || val === '') { result.saleUnit = null; break; }
        if (typeof val !== 'string' || !['piece','box','set','pack','pair','bottle','tube','carton','bag','roll'].includes(val)) {
          throw new InputError(400, 'وحدة البيع غير صالحة');
        }
        result.saleUnit = val;
        break;
      }
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
// Expiry dates are local Iraq calendar dates, not UTC instants.
function todayInIraq(): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Baghdad', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date());
  const part=(name:string)=>parts.find(p=>p.type===name)?.value ?? '';
  return part('year')+'-'+part('month')+'-'+part('day');
}
function validExpiryDate(value:unknown):value is string {
  if (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function publicProduct<T extends {gallery:string|null;specs:string|null;stock:number;lotTracking:boolean;lots?:{stock:number;expiryDate:string}[]}>(p:T){
  const {lots,...withoutLots}=p;
  const availableStock = p.lotTracking ? (lots||[]).filter(l=>l.expiryDate>=todayInIraq()).reduce((n,l)=>n+l.stock,0) : p.stock;
  return {...withoutLots, gallery:p.gallery?JSON.parse(p.gallery):[], specs:p.specs?JSON.parse(p.specs):[], availableStock};
}
function respondError(res: import('express').Response, error: unknown) {
  if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'رمز SKU أو رقم التشغيلة مستخدم مسبقاً لهذا المنتج' });
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
    const where: Prisma.ProductWhereInput = { published: true };
    if (typeof category === 'string' && category.trim()) where.category = category.trim();
    if (typeof brand === 'string' && brand.trim()) where.brand = brand.trim();
    const price: Prisma.IntFilter = {};
    if (minPrice !== undefined) price.gte = parseMoney(Number(minPrice), 'الحد الأدنى');
    if (maxPrice !== undefined) price.lte = parseMoney(Number(maxPrice), 'الحد الأعلى');
    if (Object.keys(price).length) where.price = price;
    if (typeof search === 'string' && search.trim()) {
      const term = textField(search, 'البحث', 100);
      where.OR = [{name:{contains:term}},{description:{contains:term}},{brand:{contains:term}},{sku:{contains:term}},{model:{contains:term}}];
    }
    const orders: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      'price-asc': {price:'asc'}, 'price-desc':{price:'desc'}, name:{name:'asc'}
    };
    res.json((await prisma.product.findMany({ where, include:{lots:{select:{stock:true,expiryDate:true}}}, orderBy: typeof sort === 'string' && orders[sort] ? orders[sort] : {createdAt:'desc'} })).map(publicProduct));
  } catch (error) { respondError(res, error); }
});

// Public, read-only cart quote. Never trusts saved browser prices or stock.
router.post('/quote', async (req, res) => {
  try {
    const items: unknown = req.body?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      throw new InputError(400, 'السلة يجب أن تحتوي من 1 إلى 50 منتجاً');
    }
    const seen = new Set<string>();
    const lines: { productId: string; quantity: number }[] = [];
    for (const entry of items) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new InputError(400, 'بيانات السلة غير صالحة');
      }
      const { productId, quantity } = entry as Record<string, unknown>;
      if (typeof productId !== 'string' || !productId.trim() || productId.length > 120 || seen.has(productId) ||
          !Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 100) {
        throw new InputError(400, 'معرّف أو كمية المنتج غير صالحة أو مكررة');
      }
      seen.add(productId);
      lines.push({ productId, quantity: quantity as number });
    }
    const products = await prisma.product.findMany({
      where: { id: { in: lines.map(line => line.productId) }, published: true },
      select: { id: true, name: true, price: true, stock: true, saleUnit: true, lotTracking:true, lots:{select:{stock:true,expiryDate:true}} }
    });
    const byId = new Map(products.map(product => [product.id, product]));
    let subtotal = 0;
    const quoted = lines.map(line => {
      const product = byId.get(line.productId) ?? null;
      if (product) {
        subtotal += product.price * line.quantity;
        if (!Number.isSafeInteger(subtotal)) throw new InputError(400, 'مجموع السلة كبير جداً');
      }
      const availableStock=product?(product.lotTracking?product.lots.filter(l=>l.expiryDate>=todayInIraq()).reduce((n,l)=>n+l.stock,0):product.stock):0;
      return {
        productId: line.productId, quantity: line.quantity,
        product:product?{id:product.id,name:product.name,price:product.price,stock:product.stock,saleUnit:product.saleUnit,availableStock}:null,
        available: Boolean(product && availableStock >= line.quantity)
      };
    });
    res.json({ items: quoted, subtotal, canCheckout: quoted.every(line => line.available) });
  } catch (error) { respondError(res, error); }
});

// Staff catalog keeps hidden products visible so their inventory and order history are preserved.
router.get('/manage', requireInventory, async (req, res) => {
  try {
    const items = await prisma.product.findMany({include:{lots:{select:{stock:true,expiryDate:true}}},orderBy:{createdAt:'desc'}});
    res.json(items.map(publicProduct));
  } catch (error) { respondError(res,error); }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: String(req.params.id) },include:{lots:{select:{stock:true,expiryDate:true}}} });
    if (!product || !product.published) return res.status(404).json({ error: 'المنتج غير متاح في المتجر' });
    res.json(publicProduct(product));
  } catch (error) { respondError(res, error); }
});

// Staff-only lot register; no customer PII or supplier details are exposed.
router.get('/:id/lots', requireInventory, async(req,res)=>{
  try{
    const product=await prisma.product.findUnique({where:{id:String(req.params.id)},select:{id:true,name:true,stock:true,lotTracking:true}});
    if(!product)throw new InputError(404,'المنتج غير موجود');
    const lots=await prisma.productLot.findMany({where:{productId:product.id},orderBy:[{expiryDate:'asc'},{createdAt:'asc'}]});
    const today=todayInIraq();
    res.json({product,lots:lots.map(l=>({...l,status:l.expiryDate<today?'expired':l.expiryDate<=new Date(Date.now()+30*86400000).toISOString().slice(0,10)?'soon':'valid'}))});
  }catch(error){respondError(res,error);}
});

router.post('/:id/enable-lots',requireAdmin,async(req,res)=>{
  try{
    const id=String(req.params.id);
    const result=await prisma.$transaction(async tx=>{
      const p=await tx.product.findUnique({where:{id},select:{id:true,stock:true,lotTracking:true,_count:{select:{orderItems:true,inventoryMovements:true}}}});
      if(!p)throw new InputError(404,'المنتج غير موجود');
      if(p.lotTracking)throw new InputError(409,'تتبع التشغيلات مفعّل مسبقاً');
      if(p.stock!==0||p._count.orderItems!==0||p._count.inventoryMovements!==0)throw new InputError(409,'لتفعيل التشغيلات على منتج قائم، يجب تسوية مخزونه وسجله أولاً؛ أنشئ منتجاً جديداً بمخزون صفر لهذه الميزة');
      return tx.product.update({where:{id},data:{lotTracking:true},select:{id:true,lotTracking:true}});
    });
    res.json(result);
  }catch(error){respondError(res,error);}
});

router.post('/:id/lots',requireInventory,async(req,res)=>{
  try{
    const id=String(req.params.id);
    const {code,expiryDate,quantity}=req.body||{};
    const lotCode=textField(code,'رقم التشغيلة',80).toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(lotCode))throw new InputError(400,'رقم التشغيلة يقبل الحروف الإنجليزية والأرقام والرموز - _ . / فقط');
    if(!validExpiryDate(expiryDate)||expiryDate<todayInIraq())throw new InputError(400,'تاريخ الصلاحية منتهي أو غير صالح');
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)throw new InputError(400,'كمية التشغيلة غير صالحة');
    const saved=await prisma.$transaction(async tx=>{
      const p=await tx.product.findUnique({where:{id},select:{stock:true,lotTracking:true}});
      if(!p)throw new InputError(404,'المنتج غير موجود');
      if(!p.lotTracking)throw new InputError(409,'فعّل تتبع التشغيلات لهذا المنتج أولاً');
      if(p.stock+quantity>1000000)throw new InputError(409,'المخزون يتجاوز الحد المسموح');
      const lot=await tx.productLot.create({data:{productId:id,code:lotCode,expiryDate,stock:quantity}});
      const updated=await tx.product.updateMany({where:{id,stock:p.stock},data:{stock:{increment:quantity}}});
      if(updated.count!==1)throw new InputError(409,'تغيّر المخزون، حدّث الصفحة');
      await tx.inventoryMovement.create({data:{productId:id,before:p.stock,after:p.stock+quantity,delta:quantity,reason:'lot_received: '+lotCode,referenceId:lot.id,actorId:res.locals.adminUserId as string}});
      return lot;
    });
    res.status(201).json(saved);
  }catch(error){respondError(res,error);}
});

router.post('/:id/lots/:lotId/adjust',requireInventory,async(req,res)=>{
  try{
    const productId=String(req.params.id),lotId=String(req.params.lotId);
    const {delta,reason}=req.body||{};
    if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000000)throw new InputError(400,'فرق الكمية غير صالح');
    const note=textField(reason,'سبب التعديل',180);
    const saved=await prisma.$transaction(async tx=>{
      const [p,lot]=await Promise.all([
        tx.product.findUnique({where:{id:productId},select:{stock:true,lotTracking:true}}),
        tx.productLot.findUnique({where:{id:lotId}})
      ]);
      if(!p||!lot||lot.productId!==productId||!p.lotTracking)throw new InputError(404,'التشغيلة غير موجودة');
      if(delta>0&&lot.expiryDate<todayInIraq())throw new InputError(409,'لا يجوز إضافة مخزون لتشغيلة منتهية الصلاحية');
      if(lot.stock+delta<0||p.stock+delta<0||p.stock+delta>1000000)throw new InputError(409,'كمية التشغيلة أو المنتج لا تكفي');
      const change=await tx.productLot.updateMany({where:{id:lotId,stock:lot.stock},data:{stock:{increment:delta}}});
      if(change.count!==1)throw new InputError(409,'كمية التشغيلة تغيرت؛ أعد المحاولة');
      const update=await tx.product.updateMany({where:{id:productId,stock:p.stock},data:{stock:{increment:delta}}});
      if(update.count!==1)throw new InputError(409,'المخزون تغير؛ أعد المحاولة');
      await tx.inventoryMovement.create({data:{productId,delta,before:p.stock,after:p.stock+delta,reason:'lot_adjust: '+lot.code+' — '+note,referenceId:lot.id,actorId:res.locals.adminUserId as string}});
      return tx.productLot.findUniqueOrThrow({where:{id:lotId}});
    });
    res.json(saved);
  }catch(error){respondError(res,error);}
});

router.get('/:id/inventory', requireInventory, async (req, res) => {
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
    res.status(201).json(publicProduct(created));
  } catch (error) { respondError(res,error); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = parseProduct(req.body, true);
    const product = await prisma.$transaction(async tx => {
      if (Object.prototype.hasOwnProperty.call(data, 'saleUnit')) {
        const before = await tx.product.findUnique({
          where: { id: String(req.params.id) },
          select: { saleUnit: true, stock: true, _count: { select: { orderItems: true, inventoryMovements: true } } }
        });
        if (!before) throw new InputError(404, 'المنتج غير موجود');
        const changedUnit = (before.saleUnit ?? 'piece') !== (data.saleUnit ?? 'piece');
        if (changedUnit && (before.stock > 0 || before._count.orderItems > 0 || before._count.inventoryMovements > 0)) {
          throw new InputError(409, 'لا يمكن تغيير وحدة البيع لمنتج له مخزون أو سجل طلبات/حركات؛ أنشئ منتجاً جديداً بوحدة البيع المطلوبة');
        }
      }
      return tx.product.update({where:{id:String(req.params.id)},data});
    });
    res.json(publicProduct(product));
  } catch (error) { respondError(res,error); }
});

// Owner/admin can unpublish a product without deleting stock or historical records.
router.patch('/:id/visibility', requireAdmin, async (req, res) => {
  try {
    if (!req.body || typeof req.body.published !== 'boolean' || Object.keys(req.body).some(k => k !== 'published')) {
      throw new InputError(400, 'حالة ظهور المنتج غير صالحة');
    }
    const result = await prisma.product.update({where:{id:String(req.params.id)},data:{published:req.body.published},select:{id:true,published:true}});
    res.json(result);
  } catch(error) { respondError(res,error); }
});

router.post('/:id/stock-adjustment', requireInventory, async (req, res) => {
  try {
    const { delta, reason } = req.body || {};
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000000) {
      throw new InputError(400, 'فرق المخزون يجب أن يكون عدداً صحيحاً غير صفر');
    }
    const note = textField(reason, 'سبب التعديل', 250);
    const actorId = res.locals.adminUserId as string;
    const productId = String(req.params.id);
    const updated = await prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({ where:{id:productId},select:{stock:true,lotTracking:true} });
      if (!product) throw new InputError(404,'المنتج غير موجود');
      if (product.lotTracking) throw new InputError(409,'عدّل كمية تشغيلة محددة، لا تستخدم التعديل العام للمخزون');
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
