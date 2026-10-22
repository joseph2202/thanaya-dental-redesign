"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, Plus, Check, PackageX, RefreshCw } from 'lucide-react';
import { useCart, Product } from '@/context/CartContext';
import { productsAPI } from '@/lib/api';
import ProductMedia from '@/components/ui/ProductMedia';

type CatalogProduct = Product & { image?: string | null; availableStock?: number };

export default function Products() {
  const { addToCart } = useCart();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const [addedId, setAddedId] = useState<string | null>(null);

  useEffect(() => {
    productsAPI.getAll().then((data: CatalogProduct[]) => setProducts(data.slice(0, 8))).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  const add = (product: CatalogProduct) => {
    const result = addToCart({ ...product, stock: product.availableStock ?? product.stock });
    setMessage(result.message);
    setAddedId(result.success ? product.id : null);
    window.setTimeout(() => setMessage(''), 2500);
  };

  const reload = () => { setLoading(true); setError(false); productsAPI.getAll().then((data: CatalogProduct[]) => setProducts(data.slice(0, 8))).catch(() => setError(true)).finally(() => setLoading(false)); };

  return <section className="site-container pt-5 pb-6 md:pt-6 md:pb-7" aria-labelledby="products-title">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div><span className="site-eyebrow">FROM THE CATALOG</span><h2 id="products-title" className="site-heading mt-2">منتجات مختارة لعيادتك</h2><p className="site-muted text-sm mt-1">تصفّح أحدث ما أُضيف إلى المتجر، واختر مستلزمات عيادتك بكل سهولة.</p></div>
      <Link href="/products" className="site-btn site-btn-outline site-btn-sm">عرض كل المنتجات <ArrowUpLeft size={16} /></Link>
    </div>
    {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="جاري تحميل المنتجات">
      {Array.from({ length: 4 }, (_, index) =>
        <div key={index} className="site-card animate-pulse overflow-hidden p-3" aria-hidden="true">
          <div className="h-40 rounded-xl bg-[#dcecf2] sm:h-48" />
          <div className="mt-4 h-3 w-1/3 rounded-full bg-[#dcecf2]" />
          <div className="mt-3 h-4 w-4/5 rounded-full bg-[#dcecf2]" />
          <div className="mt-4 h-6 w-2/5 rounded-full bg-[#dcecf2]" />
        </div>)}
      <span className="sr-only">جاري تحميل المنتجات...</span>
    </div> : error ? <div className="site-surface flex flex-col items-center gap-4 p-6 text-center site-muted" role="status"><PackageX size={32} /> تعذّر تحميل المنتجات. تأكد من تشغيل خادم المتجر. <button type="button" onClick={reload} className="site-btn site-btn-outline"><RefreshCw size={15} /> إعادة المحاولة</button></div> : products.length === 0 ? <div className="site-surface p-6 text-center site-muted">ما انضافت منتجات للمتجر بعد. المنتجات الجديدة راح تظهر هنا تلقائياً.</div> :
      <div className={`grid gap-4 sm:gap-5 ${products.length === 1 ? "grid-cols-1 max-w-3xl" : products.length === 2 ? "grid-cols-1 sm:grid-cols-2" : products.length === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
        {products.map((p) => <article key={p.id} className={`site-card group relative flex flex-col ${products.length <= 2 ? "sm:flex-row" : ""}`}>
          <Link href={`/product/${p.id}`} className={`block ${products.length <= 2 ? "sm:w-[42%] sm:shrink-0" : ""}`} aria-label={`تفاصيل ${p.name}`}><ProductMedia name={p.name} image={p.image} icon={p.icon} className={`h-44 m-3 rounded-xl ${products.length <= 2 ? "sm:h-44" : "sm:h-52"}`} size={62} /></Link><span className={`absolute top-6 right-6 rounded-full px-3 py-1.5 text-[10px] font-black shadow-sm ${(p.availableStock ?? p.stock) > 0 ? "bg-white text-[#147b70]" : "bg-red-50 text-red-700"}`}>{(p.availableStock ?? p.stock) > 0 ? "متوفر" : "غير متوفر"}</span>
          <div className="px-4 py-4 flex flex-col flex-1"><span className="text-[11px] text-brand font-bold">{p.category || 'من المتجر'}</span><Link href={`/product/${p.id}`} className="font-bold text-[15px] leading-7 mt-1 hover:text-brand line-clamp-2">{p.name}</Link><p className="text-xs text-[#8999ab] mt-1">{p.brand}</p><div className="flex items-end justify-between gap-2 mt-auto pt-3"><span className="font-extrabold text-lg">{p.price.toLocaleString()} <small className="font-normal text-xs">د.ع</small></span><button onClick={() => add(p)} disabled={(p.availableStock ?? p.stock) <= 0} aria-label={`أضف ${p.name} للسلة`} className="site-btn site-btn-primary site-btn-icon shrink-0" title={(p.availableStock ?? p.stock) <= 0 ? 'نفد المخزون' : 'أضف للسلة'}>{addedId === p.id ? <Check size={19} /> : <Plus size={20} />}</button></div></div>
        </article>)}
      </div>}
    <p className="sr-only" role="status">{message}</p>
  </section>;
}
