"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { productsAPI, uploadAPI, settingsAPI } from '@/lib/api';
import { parseThousandsIqd,parseUsd,formatThousandsIqd,formatFullIqd } from '@/lib/money-entry';
import ProductIcon from '@/components/ui/ProductIcon';
import { useAuth } from '@/context/AuthContext';
import {saleUnitLabel,saleUnitOptions} from '@/lib/saleUnits';

export default function AdminProducts() {
  const { user } = useAuth();
  const canEditProducts = user?.role === 'owner' || user?.role === 'admin';
  const [productsList, setProductsList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [lotsData,setLotsData]=useState<any>(null);
  const [lotError,setLotError]=useState('');
  const [lotBusy,setLotBusy]=useState(false);
  const [lotForm,setLotForm]=useState({code:'',expiryDate:'',quantity:''});
  const [stockDelta, setStockDelta] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [stockError, setStockError] = useState('');
  const [stockBusy, setStockBusy] = useState(false);
  const [stockHistory, setStockHistory] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await productsAPI.getAll();
      setProductsList(data);
    } catch (error) {
      console.error('Failed to load products', error);
    }
  };

  const openInventory = async (product: any) => {
    setStockProduct(product);setLotsData(null);setLotError('');
    productsAPI.getLots(product.id).then(data => {
      setLotsData(data);
      setStockProduct((current: any) => current?.id === product.id
        ? {...current, stock: data.product.stock, lotTracking: data.product.lotTracking}
        : current);
    }).catch(e => setLotError(e instanceof Error ? e.message : 'تعذر تحميل التشغيلات'));
    setStockDelta(''); setStockReason(''); setStockError(''); setStockHistory([]);
    try { const data = await productsAPI.getInventory(product.id); setStockHistory(data.movements || []); }
    catch (error) { setStockError(error instanceof Error ? error.message : 'تعذر جلب السجل'); }
  };

  const refreshLots = async (id: string) => {
    const data = await productsAPI.getLots(id);
    setLotsData(data);
    // Keep the currently open inventory panel in sync with the audited database stock.
    // Refreshing the table alone leaves stockProduct holding its initial zero-stock snapshot.
    setStockProduct((current: any) => current?.id === id
      ? {...current, stock: data.product.stock, lotTracking: data.product.lotTracking}
      : current);
    await loadProducts();
    const inventory = await productsAPI.getInventory(id);
    setStockHistory(inventory.movements || []);
  };
  const enableLots=async()=>{
    if(!stockProduct||!confirm('تفعيل تتبع التشغيلات لهذا المنتج؟'))return;
    setLotBusy(true);setLotError('');
    try{await productsAPI.enableLots(stockProduct.id);await refreshLots(stockProduct.id);}
    catch(e){setLotError(e instanceof Error?e.message:'تعذر التفعيل');}
    finally{setLotBusy(false);}
  };
  const receiveLot=async(e:React.FormEvent)=>{
    e.preventDefault();if(!stockProduct)return;
    setLotBusy(true);setLotError('');
    try{await productsAPI.receiveLot(stockProduct.id,{...lotForm,quantity:Number(lotForm.quantity)});await refreshLots(stockProduct.id);setLotForm({code:'',expiryDate:'',quantity:''});}
    catch(e){setLotError(e instanceof Error?e.message:'تعذر تسجيل التشغيلة');}
    finally{setLotBusy(false);}
  };
  const adjustLot=async(lot:any)=>{
    if(!stockProduct)return;
    const delta=Number(prompt('فرق الكمية (+ أو -):','-1'));
    if(!Number.isSafeInteger(delta)||delta===0)return;
    const reason=prompt('سبب التعديل');if(!reason?.trim())return;
    setLotBusy(true);setLotError('');
    try{await productsAPI.adjustLot(stockProduct.id,lot.id,{delta,reason:reason.trim()});await refreshLots(stockProduct.id);}
    catch(e){setLotError(e instanceof Error?e.message:'تعذر تعديل التشغيلة');}
    finally{setLotBusy(false);}
  };
  const saveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const delta = Number(stockDelta);
    if (!stockProduct || !Number.isSafeInteger(delta) || delta === 0 || !stockReason.trim()) {
      setStockError('أدخل فرق كمية صحيح وسبب التعديل'); return;
    }
    setStockBusy(true); setStockError('');
    try {
      const updated = await productsAPI.adjustStock(stockProduct.id, delta, stockReason.trim());
      setStockProduct(updated);
      await loadProducts();
      const data = await productsAPI.getInventory(updated.id);
      setStockHistory(data.movements || []);
      setStockDelta(''); setStockReason('');
    } catch (error) { setStockError(error instanceof Error ? error.message : 'فشل تعديل المخزون'); }
    finally { setStockBusy(false); }
  };

  const handleDelete = async (productId: string) => {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      try {
        await productsAPI.delete(productId);
        setProductsList(productsList.filter(p => p.id !== productId));
      } catch (error) {
        alert('فشل حذف المنتج');
      }
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setShowAddForm(true);
  };

  const handleSave = async (product: any): Promise<string | null> => {
    setLoading(true);
    try {
      const data = { ...product, category: product.category.trim() };
      if (editingProduct) {
        // Metadata updates cannot silently overwrite available stock.
        delete data.stock;
        delete data.availableStock;
        delete data.lotTracking;
        delete data.lots;
        delete data.id;
        delete data.createdAt;
        delete data.orderItems;
        delete data.inventoryMovements;
      }
      if (editingProduct) {
        await productsAPI.update(product.id, data);
      } else {
        await productsAPI.create(data);
      }
      await loadProducts();
      setShowAddForm(false);
      setEditingProduct(null);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'فشل حفظ المنتج';
    } finally {
      setLoading(false);
    }
  };

  const existingCategories = [...new Set(productsList.map(p => p.category?.trim()).filter(Boolean))] as string[];

  const filteredProducts = productsList.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.sku||'').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-black text-ink">إدارة المنتجات</h2>
        {canEditProducts && <button onClick={() => { setShowAddForm(true); setEditingProduct(null); }} className="bg-brand text-white rounded-full px-6 py-2 font-bold hover:bg-brand-dark transition">
          + إضافة منتج
        </button>}
      </div>

      {stockProduct && <section className="site-surface mb-7 p-6" aria-label="إدارة المخزون">
        <div className="flex items-center justify-between gap-3 mb-4"><h3 className="text-xl font-black">مخزون {stockProduct.name}</h3><button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={() => setStockProduct(null)}>إغلاق</button></div>
        <p className="mb-4 text-sm">الكمية الحالية: <strong className="text-brand">{stockProduct.stock}</strong> {saleUnitLabel(stockProduct.saleUnit)}. للإضافة اكتب رقماً موجباً، وللتصحيح بالنقصان اكتب رقماً سالباً.</p>
        <div className="mb-5 rounded-xl border border-brand/20 bg-[#f4faff] p-4">
          <h4 className="mb-3 font-black">التشغيلات وتواريخ الصلاحية</h4>
          {lotsData?.product?.lotTracking ? <>
            <p className="mb-3 text-xs text-neutral-600">تُباع التشغيلات الصالحة حسب الأقرب انتهاءً؛ المخزون المنتهي لا يدخل ضمن المتاح للبيع.</p>
            <div className="mb-4 space-y-2">{lotsData.lots?.map((lot:any)=><div key={lot.id} className="flex flex-wrap justify-between gap-3 rounded-lg border bg-white p-3 text-sm">
              <div><b dir="ltr">{lot.code}</b><p>الصلاحية: {lot.expiryDate} · الكمية: {lot.stock}</p><strong className={lot.status==='expired'?'text-red-700':lot.status==='soon'?'text-amber-700':'text-green-700'}>{lot.status==='expired'?'منتهية':lot.status==='soon'?'قريبة الانتهاء':'صالحة'}</strong></div>
              <button type="button" disabled={lotBusy} onClick={()=>adjustLot(lot)} className="site-btn site-btn-outline site-btn-sm">تعديل الكمية</button>
            </div>)}</div>
            <form onSubmit={receiveLot} className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-bold">رقم التشغيلة<input required maxLength={80} value={lotForm.code} onChange={e=>setLotForm({...lotForm,code:e.target.value})} className="mt-1 w-full rounded-xl border p-3" placeholder="LOT-2026-A"/></label>
              <label className="text-sm font-bold">تاريخ الصلاحية<input required type="date" value={lotForm.expiryDate} onChange={e=>setLotForm({...lotForm,expiryDate:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>
              <label className="text-sm font-bold">الكمية المستلمة<input required type="number" min={1} max={1000000} value={lotForm.quantity} onChange={e=>setLotForm({...lotForm,quantity:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>
              <button type="submit" disabled={lotBusy} className="site-btn site-btn-primary sm:col-span-3">تسجيل التشغيلة وإضافة المخزون</button>
            </form>
          </> : <><p className="mb-3 text-xs text-neutral-600">لتفعيلها بأمان، المنتج لازم يكون بدون مخزون وبدون حركات أو طلبات سابقة. المنتجات القديمة تبقى على النظام السابق.</p><button type="button" disabled={lotBusy||stockProduct.stock!==0} onClick={enableLots} className="site-btn site-btn-outline site-btn-sm">تفعيل تتبع التشغيلات</button></>}
          {lotError&&<p role="alert" className="mt-3 font-bold text-red-700">{lotError}</p>}
        </div>
        {!lotsData?.product?.lotTracking && <form onSubmit={saveStock} className="grid gap-3 sm:grid-cols-[130px_1fr_auto] items-end">
          <label className="text-sm font-bold">فرق الكمية<input type="number" step="1" required value={stockDelta} onChange={e=>setStockDelta(e.target.value)} className="mt-1 block w-full rounded-xl border border-brand/30 p-3" placeholder="+5 أو -2" /></label>
          <label className="text-sm font-bold">سبب التعديل<input required maxLength={250} value={stockReason} onChange={e=>setStockReason(e.target.value)} className="mt-1 block w-full rounded-xl border border-brand/30 p-3" placeholder="توريد، جرد، تلف..." /></label>
          <button type="submit" disabled={stockBusy} className="site-btn site-btn-primary">{stockBusy ? 'جاري الحفظ...' : 'تسجيل الحركة'}</button>
        </form>}
        {stockError && <p role="alert" className="mt-3 font-bold text-red-700">{stockError}</p>}
        <h4 className="font-black mt-6 mb-3">آخر حركات المخزون</h4>
        <div className="max-h-64 overflow-auto space-y-2 text-sm">{stockHistory.length === 0 ? <p className="text-neutral-500">ماكو حركات مخزون مسجلة بعد.</p> : stockHistory.map((entry: any)=><div key={entry.id} className="rounded-xl border border-brand/15 px-4 py-3 flex flex-wrap justify-between gap-3"><span>{entry.reason} — {entry.delta > 0 ? '+' : ''}{entry.delta}</span><span>{entry.before} ← {entry.after}</span><time>{new Date(entry.createdAt).toLocaleString('ar-IQ')}</time></div>)}</div>
      </section>}

      {showAddForm && (
        <ProductForm product={editingProduct} existingCategories={existingCategories} onSave={handleSave} onCancel={() => { setShowAddForm(false); setEditingProduct(null); }} loading={loading} />
      )}

      <div className="mb-6">
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث عن منتج..." className="w-full max-w-md border-2 border-brand/30 rounded-xl px-4 py-2 font-bold focus:outline-none focus:border-brand" />
      </div>

      <div className="bg-white border-2 border-brand/20 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper2">
            <tr>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">المنتج</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">التصنيف</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">السعر</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">المخزون</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-t border-brand/10">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.image ? (
    <img src={p.image} alt={p.name} className="w-12 h-12 object-cover rounded-lg border border-brand/20" />
  ) : (
    <div className="text-brand"><ProductIcon name={p.icon || 'Package'} size={32} /></div>
  )}
                    <div>
                      <p className="font-bold text-sm text-ink">{p.name}</p>
                      <p className="text-xs text-neutral-500">{p.brand}{p.sku ? ' · SKU: '+p.sku : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-ink">{p.category}</td>
                <td className="px-4 py-3 text-sm font-bold text-ink">{p.price.toLocaleString()} د.ع</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-bold ${p.stock > 10 ? 'text-green-600' : p.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>{p.lotTracking ? (p.availableStock??p.stock) : p.stock} {saleUnitLabel(p.saleUnit)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openInventory(p)} className="site-btn site-btn-outline site-btn-sm">المخزون</button>
                    {canEditProducts && <button onClick={() => handleEdit(p)} className="text-xs bg-brand/10 text-brand rounded-lg px-3 py-1 font-bold hover:bg-brand/20">تعديل</button>}
                    {canEditProducts && <button onClick={() => handleDelete(p.id)} className="text-xs bg-red-50 text-red-600 rounded-lg px-3 py-1 font-bold hover:bg-red-100">حذف</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function ProductForm({ product, existingCategories, onSave, onCancel, loading }: { product: any; existingCategories: string[]; onSave: (p: any) => Promise<string | null>; onCancel: () => void; loading: boolean }) {
  const [form, setForm] = useState(product || { name: '', description: '', price: 0, usdPrice: 0, category: '', brand: '', icon: 'Package', stock: 0, badge: '', image: '', gallery: [], specs: [], sku: '', model: '', size: '', saleUnit: 'piece' });
  const [extraUploading,setExtraUploading]=useState(false);
  const [success, setSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [imagePreview, setImagePreview] = useState(product?.image || '');
  const [uploading, setUploading] = useState(false);
  const [priceUnit,setPriceUnit]=useState<'thousands'|'usd'>('thousands');
  const [priceText,setPriceText]=useState(product?formatThousandsIqd(product.price):'');
  const [exchangeRate,setExchangeRate]=useState<number|null>(null);
  useEffect(()=>{settingsAPI.getPublic().then((d:any)=>setExchangeRate(d.usdToIqdRate??null)).catch(()=>{})},[]);
  const parsed=priceUnit==='thousands'?parseThousandsIqd(priceText):parseUsd(priceText);
  const resolvedPrice=parsed===null?null:priceUnit==='thousands'?parsed:exchangeRate&&exchangeRate>0?Math.round(parsed*exchangeRate):null;
  const rateValid=exchangeRate!==null&&Number.isSafeInteger(exchangeRate)&&exchangeRate>=1&&exchangeRate<=1_000_000;
  const priceValid=resolvedPrice!==null&&Number.isSafeInteger(resolvedPrice)&&resolvedPrice>=0&&resolvedPrice<=1_000_000_000&&(priceUnit!=='usd'||rateValid);


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // عرض معاينة الصورة
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // رفع الصورة للسيرفر
    setUploading(true);
    try {
      const result = await uploadAPI.uploadImage(file);
      setForm({ ...form, image: result.url });
      setSuccess('تم رفع الصورة بنجاح');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setImagePreview(form.image || '');
      alert(error.message || 'فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const extraImages:string[]=Array.isArray(form.gallery)?form.gallery:[];
  const specifications:{label:string;value:string}[]=Array.isArray(form.specs)?form.specs:[];
  const uploadExtra=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files||[]);
    if(files.length+extraImages.length>5){setSaveError('الحد الأقصى 5 صور إضافية');return;}
    setExtraUploading(true);setSaveError('');
    try{const uploaded:string[]=[];for(const file of files){const result=await uploadAPI.uploadImage(file);uploaded.push(result.url)}setForm((old:any)=>({...old,gallery:[...(Array.isArray(old.gallery)?old.gallery:[]),...uploaded]}))}
    catch(err){setSaveError(err instanceof Error?err.message:'تعذر رفع إحدى الصور')}
    finally{setExtraUploading(false);e.target.value=''}
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!priceValid || resolvedPrice === null) {setSaveError('راجع السعر وسعر الصرف قبل الحفظ');return;}
    const usdPrice = exchangeRate && exchangeRate>0 ? Math.round(resolvedPrice / exchangeRate) : form.usdPrice;
    const error = await onSave({...form,gallery:extraImages,specs:specifications.filter(p=>p.label.trim()||p.value.trim()),price:resolvedPrice,usdPrice});
    if (error) setSaveError(error);
  };

  return (
    <div className="bg-white border-2 border-brand/20 rounded-2xl p-6 mb-6">
      <h3 className="font-black text-xl mb-6 text-ink">{product ? '✏️ تعديل منتج' : '➕ إضافة منتج جديد'}</h3>
      
      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6 text-green-700 font-bold">
          ✅ {success}
        </div>
      )}

      {saveError && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 font-bold" role="alert">{saveError}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* رفع الصورة */}
        <div className="md:col-span-2">
          <label className="block font-bold mb-2 text-sm text-ink">صورة المنتج</label>
          <div className="flex items-center gap-4">
            {imagePreview && (
              <div className="flex shrink-0 flex-col items-center gap-2">
                <img src={imagePreview} alt="معاينة صورة المنتج" className="h-24 w-24 rounded-xl border-2 border-brand/30 object-contain" />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setForm((current: any) => ({ ...current, image: '' }));
                    setImagePreview('');
                  }}
                  className="max-w-36 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  إزالة الصورة واستخدام الأيقونة
                </button>
              </div>
            )}
            <label className="flex-1 cursor-pointer">
              <div className="border-2 border-dashed border-brand/30 rounded-xl p-6 text-center hover:border-brand transition">
                {uploading ? (
                  <p className="text-brand font-bold">جاري الرفع...</p>
                ) : (
                  <>
                    <p className="text-neutral-600 mb-2">اضغط لاختيار صورة</p>
                    <p className="text-xs text-neutral-400">JPG, PNG, WebP (حد أقصى 5MB)</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        <div className="md:col-span-2 rounded-xl border border-brand/20 p-4"><h4 className="mb-2 font-black">صور إضافية للمنتج (حتى 5)</h4><div className="mb-3 flex flex-wrap gap-3">{extraImages.map((src:string,index:number)=><div className="relative" key={src}><img src={src} alt={'صورة إضافية '+(index+1)} className="h-20 w-20 rounded-lg border object-contain"/><button type="button" aria-label="حذف الصورة الإضافية" onClick={()=>setForm((old:any)=>({...old,gallery:old.gallery.filter((url:string)=>url!==src)}))} className="absolute -left-2 -top-2 rounded-full bg-red-600 px-2 text-white">×</button></div>)}</div><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={extraUploading||extraImages.length>=5} onChange={uploadExtra} className="max-w-full text-sm"/><p className="mt-2 text-xs text-neutral-500">ارفع صور المنتج الحقيقية فقط. صورة الغلاف الأساسية تبقى كما هي.</p>{extraUploading&&<p role="status">جاري رفع الصور...</p>}</div>
        <div className="md:col-span-2 rounded-xl border border-brand/20 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-black">المواصفات الفنية (حتى 12)</h4><button type="button" disabled={specifications.length>=12} className="site-btn site-btn-outline site-btn-sm" onClick={()=>setForm((old:any)=>({...old,specs:[...(old.specs||[]),{label:'',value:''}]}))}>+ إضافة مواصفة</button></div>{specifications.map((spec,index)=><div key={index} className="mb-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input aria-label={'اسم المواصفة '+(index+1)} maxLength={80} value={spec.label} placeholder="مثال: الشركة المصنعة" onChange={e=>setForm((old:any)=>({...old,specs:old.specs.map((p:any,i:number)=>i===index?{...p,label:e.target.value}:p)}))} className="site-input min-w-0 px-3"/><input aria-label={'قيمة المواصفة '+(index+1)} maxLength={300} value={spec.value} placeholder="مثال: DentaPro" onChange={e=>setForm((old:any)=>({...old,specs:old.specs.map((p:any,i:number)=>i===index?{...p,value:e.target.value}:p)}))} className="site-input min-w-0 px-3"/><button type="button" onClick={()=>setForm((old:any)=>({...old,specs:old.specs.filter((_:any,i:number)=>i!==index)}))} className="rounded-lg border px-3 text-red-700">حذف</button></div>)}</div>
        {/* اسم المنتج */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">اسم المنتج *</label>
          <input 
            type="text" 
            placeholder="مثال: طقم أدوات فحص أسنان"
            value={form.name} 
            onChange={(e) => setForm({ ...form, name: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
        </div>

        <div className="md:col-span-2 rounded-xl border border-brand/20 bg-[#f6fbfe] p-4">
          <h4 className="mb-3 font-black">هوية المنتج ووحدة البيع</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold">رمز المنتج SKU (اختياري وفريد)
              <input type="text" dir="ltr" maxLength={40} value={form.sku||''} onChange={e=>setForm({...form,sku:e.target.value.toUpperCase()})}
                placeholder="DNT-BOX-001" className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3 text-left"/>
              <span className="mt-1 block text-xs font-normal text-neutral-600">حروف إنجليزية وأرقام و - أو _ أو نقطة. لا يتكرر بين المنتجات.</span>
            </label>
            <label className="block text-sm font-bold">وحدة البيع
              <select value={form.saleUnit||'piece'} onChange={e=>setForm({...form,saleUnit:e.target.value})}
                className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3">
                {Object.entries(saleUnitOptions).map(([code,name])=><option key={code} value={code}>{name}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-neutral-600">السعر والمخزون والكمية المطلوبة تُحسب بهذه الوحدة. لا تغيّرها بعد بدء حركات المخزون أو البيع.</span>
            </label>
            <label className="block text-sm font-bold">الموديل (اختياري)
              <input type="text" maxLength={100} value={form.model||''} onChange={e=>setForm({...form,model:e.target.value})}
                placeholder="TM-20" className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3"/>
            </label>
            <label className="block text-sm font-bold">القياس / الحجم (اختياري)
              <input type="text" maxLength={100} value={form.size||''} onChange={e=>setForm({...form,size:e.target.value})}
                placeholder="20 ml أو Size M" className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3"/>
            </label>
          </div>
        </div>

        {/* التصنيف */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">التصنيف *</label>
          <input 
            type="text" 
            placeholder="اختَر قسمًا موجودًا أو اكتب قسمًا جديدًا"
            value={form.category} 
            onChange={(e) => setForm({ ...form, category: e.target.value })} 
            list="thanaya-product-categories"
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
          <datalist id="thanaya-product-categories">{existingCategories.map(name => <option key={name} value={name} />)}</datalist>
          <p className="text-xs text-neutral-500 mt-1">اختَر الاسم الموجود إذا المنتج من نفس القسم؛ اختلاف الكتابة ينشئ قسمًا ثانيًا بالمتجر.</p>
        </div>

        <div className="md:col-span-2 rounded-xl border border-brand/20 bg-paper2/30 p-4 space-y-3">
          <label className="block font-bold text-sm">وحدة إدخال السعر</label>
          <select value={priceUnit} onChange={e=>{
            const unit=e.target.value as 'thousands'|'usd';
            setPriceUnit(unit);
            setPriceText(unit==='thousands'?formatThousandsIqd(resolvedPrice??form.price):exchangeRate?String(Number(((resolvedPrice??form.price)/exchangeRate).toFixed(2))):'');
          }} className="w-full rounded-xl border border-brand/30 bg-white px-4 py-3">
            <option value="thousands">بالألف دينار العراقي (25 = 25,000 د.ع)</option>
            <option value="usd">دولار أمريكي ($10 = عشرة دولارات)</option>
          </select>
          <label className="block font-bold text-sm">
            {priceUnit==='thousands'?'السعر بالألف دينار':'السعر بالدولار'}
            <input required type="text" inputMode="decimal" value={priceText} placeholder={priceUnit==='thousands'?'مثال: 25 أو 12.5':'مثال: 10 أو 12.50'}
              onChange={e=>setPriceText(e.target.value)}
              className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3" />
          </label>
          {priceUnit==='usd'&&<p className={rateValid?'text-sm font-bold text-ink':'text-sm font-bold text-red-700'}>{rateValid?`سعر الصرف المعتمد: 1 دولار = ${exchangeRate.toLocaleString('en-US')} د.ع. الحسبة: ${priceText||'0'} × ${exchangeRate.toLocaleString('en-US')}`:'حدد سعر صرف موجب في إعدادات ثنايا قبل حفظ السعر.'}</p>}
          {priceUnit==='usd'&&rateValid&&exchangeRate!==null&&(exchangeRate<1000||exchangeRate>3000)&&<p className="text-sm text-amber-700">تنبيه: سعر الصرف غير معتاد، راجع الحسبة قبل الحفظ.</p>}
          <p className={priceValid?'text-sm font-bold text-brand':'text-sm font-bold text-red-700'} role="status">
            {priceValid&&resolvedPrice!==null?'السعر النهائي: '+formatFullIqd(resolvedPrice):'أدخل سعراً صالحاً قبل الحفظ.'}
          </p>
          <p className="text-xs text-neutral-600">السعر ينحفظ بالدينار الكامل. الطلبات القديمة ما تتغير.</p>
        </div>

        {/* الماركة */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">الماركة / الشركة المصنعة *</label>
          <input 
            type="text" 
            placeholder="مثال: DentaPro"
            value={form.brand} 
            onChange={(e) => setForm({ ...form, brand: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
        </div>

        {/* المخزون */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">{product ? 'المخزون (للعرض فقط)' : 'الكمية الابتدائية (المخزون) *'}</label>
          <input 
            type="number" 
            placeholder="مثال: 50"
            value={form.stock ?? ''} 
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required
            readOnly={Boolean(product)}
            min={0}
          />
          {product && <p className="text-xs text-neutral-500 mt-1">لتغيير الكمية استخدم زر المخزون بجانب المنتج حتى تُسجَّل الحركة.</p>}
        </div>

        {/* الأيقونة */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">اسم الأيقونة (احتياطي)</label>
          <input 
            type="text" 
            placeholder="مثال: Stethoscope, Package, Heart"
            value={form.icon} 
            onChange={(e) => setForm({ ...form, icon: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
          />
          <p className="text-xs text-neutral-500 mt-1">تستخدم إذا لم توجد صورة</p>
        </div>

        {/* البادج */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">الشارة (اختياري)</label>
          <select 
            value={form.badge || ''} 
            onChange={(e) => setForm({ ...form, badge: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand bg-white"
          >
            <option value="">بدون شارة</option>
            <option value="new">جديد</option>
            <option value="sale">خصم</option>
            <option value="popular">مطلوب</option>
          </select>
        </div>

        {/* الوصف */}
        <div className="md:col-span-2">
          <label className="block font-bold mb-2 text-sm text-ink">وصف المنتج *</label>
          <textarea 
            placeholder="اكتب وصفاً تفصيلياً للمنتج..."
            value={form.description} 
            onChange={(e) => setForm({ ...form, description: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand resize-none" 
            rows={4} 
            required 
          />
        </div>

        {/* الأزرار */}
        <div className="md:col-span-2 flex gap-3 pt-2">
          <button type="submit" disabled={loading || uploading || extraUploading} className="bg-brand text-white rounded-full px-8 py-3 font-bold disabled:opacity-50 hover:bg-brand-dark transition">
            {loading ? 'جاري الحفظ...' : (product ? 'تحديث المنتج' : 'إضافة المنتج')}
          </button>
          <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-700 rounded-full px-8 py-3 font-bold hover:bg-gray-300 transition">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
