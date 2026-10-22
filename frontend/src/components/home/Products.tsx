"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, PackageX, RefreshCw } from 'lucide-react';
import type { Product } from '@/context/CartContext';
import { productsAPI } from '@/lib/api';
import CatalogProductCard from '@/components/catalog/CatalogProductCard';

type CatalogProduct = Product & { image?: string | null; availableStock?: number };

export default function Products() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    productsAPI.getAll().then((data: CatalogProduct[]) => setProducts(data.slice(0, 8))).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

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
      <div className={`grid gap-4 sm:gap-5 ${products.length === 1 ? "grid-cols-1 max-w-sm" : products.length === 2 ? "grid-cols-1 min-[390px]:grid-cols-2 max-w-[860px]" : products.length === 3 ? "grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4"}`}>
        {products.map(p => <CatalogProductCard key={p.id} product={p} />)}
      </div>}
  </section>;
}
