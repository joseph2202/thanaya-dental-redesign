"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, Plus } from 'lucide-react';
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

  useEffect(() => {
    productsAPI.getAll().then((data: CatalogProduct[]) => setProducts(data.slice(0, 4))).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  const add = (product: CatalogProduct) => {
    const result = addToCart(product);
    setMessage(result.message);
    window.setTimeout(() => setMessage(''), 2500);
  };

  return <section className="site-container site-section !pt-0" aria-labelledby="products-title">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div><span className="site-eyebrow">FROM THE CATALOG</span><h2 id="products-title" className="site-heading mt-2">منتجات من المتجر</h2><p className="site-muted text-sm mt-1">بيانات المنتجات تُعرض من قائمة المتجر الحالية.</p></div>
      <Link href="/products" className="text-brand text-sm font-bold inline-flex items-center gap-2 hover:underline">عرض كل المنتجات <ArrowUpLeft size={16} /></Link>
    </div>
    {loading ? <p className="site-muted py-14 text-center" role="status">جاري تحميل المنتجات...</p> : error ? <div className="site-surface p-10 text-center site-muted" role="status">تعذّر تحميل المنتجات حاليًا. تأكد من تشغيل خادم المتجر ثم حاول مرة ثانية.</div> : products.length === 0 ? <div className="site-surface p-10 text-center site-muted">ما انضافت منتجات للمتجر بعد.</div> :
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {products.map((p) => <article key={p.id} className="site-card group flex flex-col">
          <Link href={`/product/${p.id}`} className="block" aria-label={`تفاصيل ${p.name}`}><ProductMedia name={p.name} image={p.image} icon={p.icon} className="h-48 m-3 rounded-xl" size={62} /></Link>
          <div className="px-5 pb-5 flex flex-col flex-1"><span className="text-[11px] text-brand font-bold">{p.category || 'من المتجر'}</span><Link href={`/product/${p.id}`} className="font-bold text-[15px] leading-7 mt-1 hover:text-brand line-clamp-2">{p.name}</Link><p className="text-xs text-[#8999ab] mt-1">{p.brand}</p><div className="flex items-end justify-between gap-2 mt-auto pt-5"><span className="font-extrabold text-lg">{p.price.toLocaleString()} <small className="font-normal text-xs">د.ع</small></span><button onClick={() => add(p)} disabled={p.stock <= 0} aria-label={`أضف ${p.name} للسلة`} className="w-9 h-9 rounded-lg bg-brand text-white grid place-items-center hover:bg-brand-dark disabled:opacity-40" title={p.stock <= 0 ? 'نفد المخزون' : 'أضف للسلة'}><Plus size={20} /></button></div></div>
        </article>)}
      </div>}
    <p className="sr-only" role="status">{message}</p>
  </section>;
}
