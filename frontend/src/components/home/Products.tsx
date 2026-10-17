"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, Plus, Check, PackageX, RefreshCw } from 'lucide-react';
import { useCart, Product } from '@/context/CartContext';
import { productsAPI } from '@/lib/api';
import ProductMedia from '@/components/ui/ProductMedia';

type CatalogProduct = Product & { image?: string | null };

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
    const result = addToCart(product);
    setMessage(result.message);
    setAddedId(result.success ? product.id : null);
    window.setTimeout(() => setMessage(''), 2500);
  };

  const reload = () => { setLoading(true); setError(false); productsAPI.getAll().then((data: CatalogProduct[]) => setProducts(data.slice(0, 8))).catch(() => setError(true)).finally(() => setLoading(false)); };

  return <section className="site-container site-section" aria-labelledby="products-title">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div><span className="site-eyebrow">FROM THE CATALOG</span><h2 id="products-title" className="site-heading mt-2">منتجات مختارة لعيادتك</h2><p className="site-muted text-sm mt-1">تصفّح أحدث ما أُضيف إلى المتجر، واختر مستلزمات عيادتك بكل سهولة.</p></div>
      <Link href="/products" className="text-brand text-sm font-bold inline-flex items-center gap-2 hover:underline">عرض كل المنتجات <ArrowUpLeft size={16} /></Link>
    </div>
    {loading ? <p className="site-muted py-14 text-center" role="status">جاري تحميل المنتجات...</p> : error ? <div className="site-surface flex flex-col items-center gap-4 p-10 text-center site-muted" role="status"><PackageX size={32} /> تعذّر تحميل المنتجات. تأكد من تشغيل خادم المتجر. <button type="button" onClick={reload} className="site-btn site-btn-outline"><RefreshCw size={15} /> إعادة المحاولة</button></div> : products.length === 0 ? <div className="site-surface p-10 text-center site-muted">ما انضافت منتجات للمتجر بعد. المنتجات الجديدة راح تظهر هنا تلقائياً.</div> :
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {products.map((p) => <article key={p.id} className="site-card group flex flex-col relative">
          <Link href={`/product/${p.id}`} className="block" aria-label={`تفاصيل ${p.name}`}><ProductMedia name={p.name} image={p.image} icon={p.icon} className="h-52 m-3 rounded-xl" size={62} /></Link><span className={`absolute top-6 right-6 rounded-full px-3 py-1.5 text-[10px] font-black shadow-sm ${p.stock > 0 ? "bg-white text-[#147b70]" : "bg-red-50 text-red-700"}`}>{p.stock > 0 ? "متوفر" : "نفد المخزون"}</span>
          <div className="px-5 pb-5 flex flex-col flex-1"><span className="text-[11px] text-brand font-bold">{p.category || 'من المتجر'}</span><Link href={`/product/${p.id}`} className="font-bold text-[15px] leading-7 mt-1 hover:text-brand line-clamp-2">{p.name}</Link><p className="text-xs text-[#8999ab] mt-1">{p.brand}</p><div className="flex items-end justify-between gap-2 mt-auto pt-5"><span className="font-extrabold text-lg">{p.price.toLocaleString()} <small className="font-normal text-xs">د.ع</small></span><button onClick={() => add(p)} disabled={p.stock <= 0} aria-label={`أضف ${p.name} للسلة`} className={`w-10 h-10 rounded-xl text-white grid place-items-center transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 ${addedId === p.id ? "bg-success" : "bg-brand hover:bg-brand-dark"}`} title={p.stock <= 0 ? 'نفد المخزون' : 'أضف للسلة'}>{addedId === p.id ? <Check size={19} /> : <Plus size={20} />}</button></div></div>
        </article>)}
      </div>}
    <p className="sr-only" role="status">{message}</p>
  </section>;
}
