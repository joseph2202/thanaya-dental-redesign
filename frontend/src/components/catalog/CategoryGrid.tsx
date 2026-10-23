import Link from 'next/link';
import {ArrowUpLeft} from 'lucide-react';
import ProductIcon from '@/components/ui/ProductIcon';

type CatalogProduct = { name: string; category: string; image?: string | null; icon?: string | null };
type CatalogCategory = { name: string; count: number; product: CatalogProduct };

function groupProducts(products: CatalogProduct[]): CatalogCategory[] {
  const groups = new Map<string, CatalogCategory>();
  for (const product of products) {
    const name = product.category?.trim();
    if (!name) continue;
    const group = groups.get(name);
    if (group) group.count += 1;
    else groups.set(name, { name, count: 1, product });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
}


// Render categories from server-provided real catalog data.
// This markup is included in the page HTML even without browser JavaScript.
export default function CategoryGrid({products,variant='home'}:
 {products:CatalogProduct[];variant?:'home'|'page'}){
 const categories=groupProducts(products);
 if(!categories.length)return <div className="site-surface p-8 text-center site-muted">
   ماكو أقسام فيها منتجات بعد. راح تظهر هنا أول ما تضيف منتجات للمتجر.
 </div>;
  // With one or two real categories, use all available horizontal space instead of
  // leaving empty cells in a fixed three-column catalog grid.
  const gridColumns = categories.length === 1
    ? 'grid-cols-1'
    : categories.length === 2
    ? 'md:grid-cols-2'
    : variant === 'page'
    ? 'md:grid-cols-2 xl:grid-cols-3'
    : 'md:grid-cols-2 lg:grid-cols-3';

  return <div className={`grid gap-4 sm:gap-5 ${gridColumns}`}>
    {categories.map(category => <Link
      key={category.name}
      href={`/products?category=${encodeURIComponent(category.name)}`}
      className="site-card group flex min-h-[112px] items-center gap-4 border-[#c6e8f4] p-3 sm:gap-4 sm:p-4"
      aria-label={`${category.name}، ${category.count} منتج`}
    >
      <span className="thanaya-category-image grid h-[80px] w-[80px] shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#dff5fb,#e9f0f8)] text-[#1687b2] sm:h-[92px] sm:w-[92px]" aria-hidden="true">
        <ProductIcon name={category.product.icon || 'Package'} size={45} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[11px] font-bold tracking-widest text-brand" dir="ltr">THANAYA / CATEGORY</span>
        <strong className="text-base leading-7 transition-colors group-hover:text-brand sm:text-lg">{category.name}</strong>
        <span className="text-sm text-[#657b88]">{category.count} {category.count === 1 ? 'منتج' : 'منتجات'} في القسم</span>
      </span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#b2dfef] bg-white text-brand transition-colors group-hover:bg-[#e6f7fc]" aria-hidden="true">
        <ArrowUpLeft size={18} />
      </span>
    </Link>)}
  </div>;
}
