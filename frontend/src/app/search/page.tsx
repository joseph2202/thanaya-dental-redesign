import { productsAPI } from '@/lib/api';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import Link from 'next/link';
import { Search } from 'lucide-react';

export const instant = false;
type SearchProduct = { id: string; name: string; brand: string; category: string; price: number; icon?: string; image?: string | null };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const query = (params.q || '').trim();
  let results: SearchProduct[] = [];
  let failed = false;
  if (query) {
    try { results = await productsAPI.getAll({ search: query }); }
    catch { failed = true; }
  }
  return <><Header /><main className="site-container site-main py-12 md:py-16"><span className="site-eyebrow">SEARCH / THANAYA</span><h1 className="site-page-title mt-2">نتائج البحث</h1><p className="site-muted mt-2 mb-9">{failed ? 'تعذّر الاتصال بالمتجر حاليًا.' : query ? `${results.length} نتيجة لـ «${query}»` : 'اكتب اسم منتج أو ماركة في شريط البحث.'}</p>
    {results.length ? <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">{results.map(p => <Link key={p.id} href={`/product/${p.id}`} className="site-card group"><ProductMedia name={p.name} image={p.image} icon={p.icon} className="h-44 m-3 rounded-xl" size={55} /><div className="px-5 pb-5"><small className="text-brand font-bold">{p.category}</small><h2 className="font-bold mt-2 group-hover:text-brand">{p.name}</h2><p className="text-xs text-[#7896a6] mt-1">{p.brand}</p><p className="font-extrabold mt-4">{p.price.toLocaleString()} <small className="text-xs font-normal">د.ع</small></p></div></Link>)}</div> : <div className="site-surface p-12 text-center max-w-2xl mx-auto"><Search size={28} className="mx-auto text-brand mb-4" /><h2 className="site-heading text-2xl">{failed ? 'حاول مرة ثانية بعد تشغيل الخادم' : 'ما لقينا منتج بهذا الاسم'}</h2><p className="site-muted text-sm mt-2 mb-5">جرّب كلمة أخرى أو شوف كل المنتجات.</p><Link href="/products" className="site-btn site-btn-outline">تصفّح المنتجات</Link></div>}
  </main><Footer /></>;
}
