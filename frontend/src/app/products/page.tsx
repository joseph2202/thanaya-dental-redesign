import { productsAPI } from '@/lib/api';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import CatalogFilters from '@/components/catalog/CatalogFilters';
import {saleUnitLabel} from '@/lib/saleUnits';

export const instant = false;

type CatalogProduct = { id: string; name: string; price: number; brand: string; category: string; icon?: string; image?: string | null; badge?: string; saleUnit?: string|null; stock: number; availableStock?: number };

type SearchParams = { category?: string; brand?: string; sort?: string; minPrice?: string; maxPrice?: string; search?: string; inStock?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const apiParams: { category?: string; brand?: string; sort?: string; search?: string; minPrice?: string; maxPrice?: string } = {};
  if (params.category) apiParams.category = params.category;
  if (params.brand) apiParams.brand = params.brand;
  if (params.sort) apiParams.sort = params.sort;
  if (params.search) apiParams.search = params.search;
  if (params.minPrice) apiParams.minPrice = params.minPrice;
  if (params.maxPrice) apiParams.maxPrice = params.maxPrice;

  // When no backend filter is active, one catalog fetch is enough for both
  // the cards and the filter sidebar (previously fetched the same list twice).
  const hasApiFilters = Object.values(apiParams).some(Boolean);
  const [fetchedProducts, allProducts] = hasApiFilters
    ? await Promise.all([
        productsAPI.getAll(apiParams) as Promise<CatalogProduct[]>,
        productsAPI.getAll() as Promise<CatalogProduct[]>,
      ])
    : await (productsAPI.getAll() as Promise<CatalogProduct[]>).then(
        items => [items, items] as const
      );
  const stockOnly = params.inStock === '1';
  // availableStock excludes expired batches, while stock also includes those physically held.
  const products = stockOnly ? fetchedProducts.filter(p => (p.availableStock ?? p.stock) > 0) : fetchedProducts;
  const categoryCounts = new Map<string, number>();
  for (const product of allProducts) {
    if (product.category?.trim()) categoryCounts.set(product.category, (categoryCounts.get(product.category) || 0) + 1);
  }
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
  const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();


  return <><Header /><main className="site-container site-main py-5 md:py-8">
    <div className="mb-5 rounded-[26px] border border-[#d0eaf5] bg-[linear-gradient(110deg,#e5f7fd,#ffffff)] px-5 py-6 md:px-9 md:py-7"><span className="site-eyebrow">THANAYA / CATALOG</span><h1 className="mt-2 text-3xl font-black text-ink md:text-5xl">كل احتياجات عيادتك بمكان واحد.</h1><p className="site-muted mt-3 text-sm">تصفّح المنتجات المتوفرة حسب القسم والماركة، ورتّبها حسب احتياجك.</p></div>
    <div className="grid lg:grid-cols-[240px_1fr] gap-5">
      <CatalogFilters key={JSON.stringify(params)} initial={{search:params.search||'',category:params.category||'',brand:params.brand||'',sort:params.sort||'',minPrice:params.minPrice||'',maxPrice:params.maxPrice||'',inStock:stockOnly}} categories={categories} brands={brands} />
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-[#587484]">{products.length} منتج مطابق</p>{(Object.values(apiParams).some(Boolean)||stockOnly)&&<Link href="/products" className="text-sm font-bold text-brand underline">إزالة الفلاتر</Link>}</div>
        {products.length === 0 ? <div className="site-surface text-center py-9 px-5"><h2 className="site-heading">ماكو منتجات تطابق اختيارك.</h2><p className="site-muted mt-2 mb-6">{stockOnly ? 'ماكو منتجات متوفرة تطابق اختيارك حالياً. جرّب إلغاء خيار المتوفر فقط.' : 'جرّب قسمًا آخر أو امسح الفلاتر.'}</p><Link href="/products" className="site-btn site-btn-primary">كل المنتجات</Link></div> :
          <div className={`grid gap-5 ${products.length === 1 ? "grid-cols-1 max-w-2xl" : products.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
            {products.map(p => <Link key={p.id} href={`/product/${p.id}`} className="site-card group block"><div className="relative"><ProductMedia name={p.name} image={p.image} icon={p.icon} className="h-48 m-3 rounded-xl sm:h-52" size={60} /><span className={`absolute top-5 right-5 rounded-full px-3 py-1 text-xs font-bold ${(p.availableStock ?? p.stock) > 0 ? "bg-white text-emerald-700" : "bg-red-50 text-red-700"}`}>{(p.availableStock ?? p.stock) > 0 ? "متوفر" : "غير متوفر"}</span></div><div className="px-5 pb-5"><span className="text-[11px] font-bold text-brand">{p.category}</span><h2 className="font-bold text-sm leading-7 mt-1 group-hover:text-brand line-clamp-2">{p.name}</h2><p className="text-xs text-[#8b99a8] mt-1">{p.brand}</p><div className="flex justify-between items-end mt-5"><strong className="text-lg">{p.price.toLocaleString()} <small className="text-xs font-normal">د.ع / {saleUnitLabel(p.saleUnit)}</small></strong><ArrowUpLeft size={18} className="text-brand" /></div></div></Link>)}
          </div>}
      </div>
    </div>
  </main><Footer /></>;
}
