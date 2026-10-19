import { productsAPI } from '@/lib/api';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import CatalogFilters from '@/components/catalog/CatalogFilters';

export const instant = false;

type CatalogProduct = { id: string; name: string; price: number; brand: string; category: string; icon?: string; image?: string | null; badge?: string };

type SearchParams = { category?: string; brand?: string; sort?: string; minPrice?: string; maxPrice?: string; search?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const apiParams: { category?: string; brand?: string; sort?: string; search?: string; minPrice?: string; maxPrice?: string } = {};
  if (params.category) apiParams.category = params.category;
  if (params.brand) apiParams.brand = params.brand;
  if (params.sort) apiParams.sort = params.sort;
  if (params.search) apiParams.search = params.search;
  if (params.minPrice) apiParams.minPrice = params.minPrice;
  if (params.maxPrice) apiParams.maxPrice = params.maxPrice;

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


  return <><Header /><main className="site-container site-main py-9 md:py-12">
    <div className="mb-9 rounded-[26px] border border-[#d0eaf5] bg-[linear-gradient(110deg,#e5f7fd,#ffffff)] px-7 py-9 md:px-12"><span className="site-eyebrow">THANAYA / CATALOG</span><h1 className="mt-2 text-3xl font-black text-ink md:text-5xl">كل احتياجات عيادتك بمكان واحد.</h1><p className="site-muted mt-3 text-sm">تصفّح المنتجات المتوفرة حسب القسم والماركة، ورتّبها حسب احتياجك.</p></div>
    <div className="grid lg:grid-cols-[240px_1fr] gap-7">
      <CatalogFilters key={JSON.stringify(params)} initial={{search:params.search||'',category:params.category||'',brand:params.brand||'',sort:params.sort||'',minPrice:params.minPrice||'',maxPrice:params.maxPrice||''}} categories={categories} brands={brands} />
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-[#587484]">{products.length} منتج مطابق</p>{Object.values(apiParams).some(Boolean)&&<Link href="/products" className="text-sm font-bold text-brand underline">إزالة الفلاتر</Link>}</div>
        {products.length === 0 ? <div className="site-surface text-center py-20 px-5"><h2 className="site-heading">ماكو منتجات تطابق اختيارك.</h2><p className="site-muted mt-2 mb-6">جرّب قسمًا آخر أو امسح الفلاتر.</p><Link href="/products" className="site-btn site-btn-primary">كل المنتجات</Link></div> :
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map(p => <Link key={p.id} href={`/product/${p.id}`} className="site-card group block"><ProductMedia name={p.name} image={p.image} icon={p.icon} className="h-52 m-3 rounded-xl" size={60} /><div className="px-5 pb-5"><span className="text-[11px] font-bold text-brand">{p.category}</span><h2 className="font-bold text-sm leading-7 mt-1 group-hover:text-brand line-clamp-2">{p.name}</h2><p className="text-xs text-[#8b99a8] mt-1">{p.brand}</p><div className="flex justify-between items-end mt-5"><strong className="text-lg">{p.price.toLocaleString()} <small className="text-xs font-normal">د.ع</small></strong><ArrowUpLeft size={18} className="text-brand" /></div></div></Link>)}
          </div>}
      </div>
    </div>
  </main><Footer /></>;
}
