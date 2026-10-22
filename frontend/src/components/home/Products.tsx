"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, PackageX, RefreshCw, BadgeCheck, ScanSearch, ShoppingBag } from 'lucide-react';
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

  return <section id="featured-products" className="site-container scroll-mt-28 pt-9 pb-8 md:pt-12 md:pb-11" aria-labelledby="products-title">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-7">
      <div><span className="site-eyebrow" dir="ltr">CURATED FOR YOUR CLINIC / 01</span><h2 id="products-title" className="signature-section-heading mt-2">اختيارات لعيادتك، بكل وضوح.</h2><p className="site-muted mt-2 max-w-[620px] text-sm">منتجات حقيقية من كتالوج ثنايا، مع الأسعار ووحدات البيع وحالة التوفر الحالية.</p></div>
      <Link href="/products" className="site-btn site-btn-outline site-btn-sm">الكتالوج الكامل <ArrowUpLeft size={16} /></Link>
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
      <div className={`grid items-stretch gap-3.5 sm:gap-5 ${products.length===1?
        'grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]':
        products.length===2?
        'grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.12fr)]':
        products.length===3?
        'grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-3':
        'grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4'}`}>
        {products.map(p=><CatalogProductCard key={p.id} product={p}/>)}
        {products.length<=2&&<aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden rounded-[25px] border border-[#bedfea] bg-[linear-gradient(145deg,#dff3f8_0%,#f6fbfd_78%)] p-6 lg:flex lg:p-7" aria-label="مساعدة باختيار المنتج">
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full border-[35px] border-[#cae9f3]/55"/>
          <div className="relative">
            <span className="site-eyebrow" dir="ltr">BUILT FOR YOUR CLINIC</span>
            <h3 className="mt-5 text-[clamp(1.65rem,2.7vw,2.45rem)] font-black leading-[1.35] tracking-[-.04em] text-[#204556]">اختيار واضح.
              <span className="block text-[#078fb9]">من أول تفصيل.</span>
            </h3>
            <p className="mt-4 max-w-sm text-sm leading-8 text-[#5d7b88]">قارن مواصفات المنتج، انتبه لوحدة البيع، وراجع السعر والكميات قبل تأكيد طلب عيادتك.</p>
            <div className="mt-7 space-y-3.5 text-[12px] font-bold text-[#37657a]">
              <p className="flex items-center gap-2.5"><ScanSearch size={20} className="shrink-0 text-[#0699c5]"/> تفاصيل كل منتج بمكان واحد</p>
              <p className="flex items-center gap-2.5"><BadgeCheck size={20} className="shrink-0 text-[#0699c5]"/> أسعار ووحدات بيع واضحة</p>
              <p className="flex items-center gap-2.5"><ShoppingBag size={20} className="shrink-0 text-[#0699c5]"/> مراجعة المخزون عند الطلب</p>
            </div>
          </div>
          <Link href="/products" className="relative mt-8 inline-flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#9bcbdc] bg-white/85 px-4 text-sm font-black text-[#146987] transition hover:bg-white">
            استكشف الكتالوج <ArrowUpLeft size={17} aria-hidden="true"/>
          </Link>
        </aside>}
      </div>}
  </section>;
}
