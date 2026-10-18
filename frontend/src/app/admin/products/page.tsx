"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { productsAPI, uploadAPI } from '@/lib/api';
import ProductIcon from '@/components/ui/ProductIcon';
import { useAuth } from '@/context/AuthContext';

export default function AdminProducts() {
  const { user } = useAuth();
  const canEditProducts = user?.role === 'owner' || user?.role === 'admin';
  const [productsList, setProductsList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stockProduct, setStockProduct] = useState<any>(null);
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
    setStockProduct(product);
    setStockDelta(''); setStockReason(''); setStockError(''); setStockHistory([]);
    try { const data = await productsAPI.getInventory(product.id); setStockHistory(data.movements || []); }
    catch (error) { setStockError(error instanceof Error ? error.message : 'تعذر جلب السجل'); }
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

  const handleSave = async (product: any): Promise<boolean> => {
    setLoading(true);
    try {
      const data = { ...product, category: product.category.trim() };
      if (editingProduct) {
        // Metadata updates cannot silently overwrite available stock.
        delete data.stock;
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
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  };

  const existingCategories = [...new Set(productsList.map(p => p.category?.trim()).filter(Boolean))] as string[];

  const filteredProducts = productsList.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
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
        <p className="mb-4 text-sm">الكمية الحالية: <strong className="text-brand">{stockProduct.stock}</strong> قطعة. للإضافة اكتب رقماً موجباً، وللتصحيح بالنقصان اكتب رقماً سالباً.</p>
        <form onSubmit={saveStock} className="grid gap-3 sm:grid-cols-[130px_1fr_auto] items-end">
          <label className="text-sm font-bold">فرق الكمية<input type="number" step="1" required value={stockDelta} onChange={e=>setStockDelta(e.target.value)} className="mt-1 block w-full rounded-xl border border-brand/30 p-3" placeholder="+5 أو -2" /></label>
          <label className="text-sm font-bold">سبب التعديل<input required maxLength={250} value={stockReason} onChange={e=>setStockReason(e.target.value)} className="mt-1 block w-full rounded-xl border border-brand/30 p-3" placeholder="توريد، جرد، تلف..." /></label>
          <button type="submit" disabled={stockBusy} className="site-btn site-btn-primary">{stockBusy ? 'جاري الحفظ...' : 'تسجيل الحركة'}</button>
        </form>
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
                      <p className="text-xs text-neutral-500">{p.brand}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-ink">{p.category}</td>
                <td className="px-4 py-3 text-sm font-bold text-ink">{p.price.toLocaleString()} د.ع</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-bold ${p.stock > 10 ? 'text-green-600' : p.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>{p.stock} قطعة</span>
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

function ProductForm({ product, existingCategories, onSave, onCancel, loading }: { product: any; existingCategories: string[]; onSave: (p: any) => Promise<boolean>; onCancel: () => void; loading: boolean }) {
  const [form, setForm] = useState(product || { name: '', description: '', price: 0, usdPrice: 0, category: '', brand: '', icon: 'Package', stock: 0, badge: '', image: '' });
  const [success, setSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [imagePreview, setImagePreview] = useState(product?.image || '');
  const [uploading, setUploading] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!await onSave(form)) setSaveError('ما انحفظ المنتج. تأكد من اتصال خادم المتجر وحاول مرة ثانية.');
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
              <img src={imagePreview} alt="معاينة" className="w-24 h-24 object-cover rounded-xl border-2 border-brand/30" />
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

        {/* السعر بالدينار */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">السعر (دينار عراقي) *</label>
          <input 
            type="number" 
            placeholder="مثال: 25000"
            value={form.price || ''} 
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
        </div>

        {/* السعر بالدولار */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">السعر (دولار أمريكي) *</label>
          <input 
            type="number" 
            placeholder="مثال: 20"
            value={form.usdPrice || ''} 
            onChange={(e) => setForm({ ...form, usdPrice: Number(e.target.value) })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
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
          <button type="submit" disabled={loading || uploading} className="bg-brand text-white rounded-full px-8 py-3 font-bold disabled:opacity-50 hover:bg-brand-dark transition">
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
