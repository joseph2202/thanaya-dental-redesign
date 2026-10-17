import { productsAPI } from '@/lib/api';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import Link from 'next/link';
import { ArrowUpLeft, SlidersHorizontal } from 'lucide-react';

export const instant = false;

type CatalogProduct = { id: string; name: string; price: number; brand: string; category: string; icon?: string; image?: string | null; badge?: string };

type SearchParams = { category?: string; brand?: string; sort?: string; minPrice?: string; maxPrice?: string; search?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const apiParams: { category?: string; brand?: string; sort?: string; search?: string } = {};
  if (params.category) apiParams.category = params.category;
  if (params.brand) apiParams.brand = params.brand;
  if (params.sort) apiParams.sort = params.sort;
  if (params.search) apiParams.search = params.search;

  const [products, allProducts] = await Promise.all([
    productsAPI.getAll(apiParams) as Promise<CatalogProduct[]>,
    productsAPI.getAll() as Promise<CatalogProduct[]>,
  ]);
  const categoryCounts = new Map<string, number>();
  for (const product of allProducts) {
    if (product.category?.trim()) categoryCounts.set(product.category, (categoryCounts.get(product.category) || 0) + 1);
  }
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
  const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();

  const queryFor = (key: string, value: string) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) query.set(k, v); });
    if (value) query.set(key, value); else query.delete(key);
    return `/products?${query.toString()}`;
  };

  return <><Header /><main className="site-container site-main py-9 md:py-12">
    <div className="mb-9 rounded-[26px] border border-[#d0eaf5] bg-[linear-gradient(110deg,#e5f7fd,#ffffff)] px-7 py-9 md:px-12"><span className="site-eyebrow">THANAYA / CATALOG</span><h1 className="mt-2 text-3xl font-black text-ink md:text-5xl">كل احتياجات عيادتك بمكان واحد.</h1><p className="site-muted mt-3 text-sm">تصفّح المنتجات المتوفرة حسب القسم والماركة، ورتّبها حسب احتياجك.</p></div>
    <div className="grid lg:grid-cols-[240px_1fr] gap-7">
      <aside aria-label="تصفية المنتجات" className="site-surface p-5 h-fit lg:sticky lg:top-28">
        <div className="flex items-center gap-2 font-bold mb-6"><SlidersHorizontal size={18} className="text-brand" /> تصفية المنتجات</div>
        <div><h2 className="text-xs font-bold text-[#8797aa] mb-3">التصنيف</h2><div className="grid gap-1.5 text-sm"><Link href={queryFor('category', '')} className={`rounded-lg px-3 py-2 ${!params.category ? 'bg-[#edf3ff] text-brand font-bold' : 'hover:bg-paper2'}`}>الكل</Link>{categories.map(([name, count]) => <Link key={name} href={queryFor('category', name)} className={`rounded-lg px-3 py-2 flex justify-between gap-2 ${params.category === name ? 'bg-[#edf3ff] text-brand font-bold' : 'hover:bg-paper2'}`}><span>{name}</span><span className="text-xs opacity-70">{count}</span></Link>)}</div></div>
        <div className="border-t border-[#e6edf5] mt-5 pt-5"><h2 className="text-xs font-bold text-[#8797aa] mb-3">الماركة</h2><div className="grid gap-1.5 text-sm"><Link href={queryFor('brand', '')} className={`rounded-lg px-3 py-2 ${!params.brand ? 'bg-[#edf3ff] text-brand font-bold' : 'hover:bg-paper2'}`}>الكل</Link>{brands.map(b => <Link key={b} href={queryFor('brand', b)} className={`rounded-lg px-3 py-2 ${params.brand === b ? 'bg-[#edf3ff] text-brand font-bold' : 'hover:bg-paper2'}`}>{b}</Link>)}</div></div>
        <Link href="/products" className="block text-brand text-xs font-bold mt-5 hover:underline">إعادة تعيين الفلاتر</Link>
      </aside>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5"><p className="text-sm text-[#6d7f94]">{products.length} منتج</p><div className="flex gap-2 flex-wrap text-xs font-bold"><Link href={queryFor('sort', 'price-asc')} className={`px-3 py-2 rounded-lg border ${params.sort === 'price-asc' ? 'border-brand bg-brand text-white' : 'border-[#dce6f1] bg-white hover:border-brand'}`}>السعر: الأقل</Link><Link href={queryFor('sort', 'price-desc')} className={`px-3 py-2 rounded-lg border ${params.sort === 'price-desc' ? 'border-brand bg-brand text-white' : 'border-[#dce6f1] bg-white hover:border-brand'}`}>السعر: الأعلى</Link><Link href={queryFor('sort', 'name')} className={`px-3 py-2 rounded-lg border ${params.sort === 'name' ? 'border-brand bg-brand text-white' : 'border-[#dce6f1] bg-white hover:border-brand'}`}>الاسم</Link></div></div>
        {products.length === 0 ? <div className="site-surface text-center py-20 px-5"><h2 className="site-heading">ماكو منتجات تطابق اختيارك.</h2><p className="site-muted mt-2 mb-6">جرّب قسمًا آخر أو امسح الفلاتر.</p><Link href="/products" className="site-btn site-btn-primary">كل المنتجات</Link></div> :
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map(p => <Link key={p.id} href={`/product/${p.id}`} className="site-card group block"><ProductMedia name={p.name} image={p.image} icon={p.icon} className="h-52 m-3 rounded-xl" size={60} /><div className="px-5 pb-5"><span className="text-[11px] font-bold text-brand">{p.category}</span><h2 className="font-bold text-sm leading-7 mt-1 group-hover:text-brand line-clamp-2">{p.name}</h2><p className="text-xs text-[#8b99a8] mt-1">{p.brand}</p><div className="flex justify-between items-end mt-5"><strong className="text-lg">{p.price.toLocaleString()} <small className="text-xs font-normal">د.ع</small></strong><ArrowUpLeft size={18} className="text-brand" /></div></div></Link>)}
          </div>}
      </div>
    </div>
  </main><Footer /></>;
}
