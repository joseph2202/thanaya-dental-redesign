import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import CategoryGrid from '@/components/catalog/CategoryGrid';
import type {CatalogCardProduct} from '@/components/catalog/CatalogProductCard';

export default function Categories({products}:{products:CatalogCardProduct[]}) {
  const categoryCount=new Set(products.map(p=>p.category?.trim()).filter(Boolean)).size;
  const single=categoryCount===1;
  return (
    <section className={`site-container pt-6 pb-4 md:pt-8 md:pb-5 ${single ? "lg:grid lg:grid-cols-2 lg:items-center lg:gap-6" : ""}`} aria-labelledby="categories-title">
      <div className={`flex flex-wrap items-end justify-between gap-4 mb-5 ${single ? "lg:mb-0" : ""}`}>
        <div><span className="site-eyebrow">EXPLORE CATEGORIES</span><h2 id="categories-title" className="site-heading mt-2">كل احتياجاتك، مرتّبة إلك.</h2><p className="site-muted text-sm mt-1">أقسام المتجر حسب المنتجات الموجودة فعلًا.</p></div>
        <Link href="/categories" className="site-btn site-btn-outline site-btn-sm">كل الأقسام <ArrowUpLeft size={16} /></Link>
      </div>
      <CategoryGrid products={products} />
    </section>
  );
}
