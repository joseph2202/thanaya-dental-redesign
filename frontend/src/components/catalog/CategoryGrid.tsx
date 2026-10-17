'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import ProductMedia from '@/components/ui/ProductMedia';
import { productsAPI } from '@/lib/api';

type CatalogProduct = { name: string; category: string; image?: string | null; icon?: string | null };
type CatalogCategory = { name: string; count: number; product: CatalogProduct };

function groupProducts(products: CatalogProduct[]): CatalogCategory[] {
  const groups = new Map<string, CatalogCategory>();
  for (const product of products) {
    const name = product.category?.trim();
    if (!name) continue;
    const group = groups.get(name);
    if (group) {
      group.count += 1;
      if (!group.product.image && product.image) group.product = product;
    } else {
      groups.set(name, { name, count: 1, product });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
}

export default function CategoryGrid({ variant = 'home' }: { variant?: 'home' | 'page' }) {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    productsAPI.getAll()
      .then((products: CatalogProduct[]) => { setCategories(groupProducts(products)); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') return <div className="site-surface p-10 text-center site-muted" role="status">جاري تحميل الأقسام...</div>;
  if (status === 'error') return <div className="site-surface p-10 text-center site-muted" role="status">تعذّر تحميل الأقسام. تأكد من تشغيل خادم المتجر ثم حدّث الصفحة.</div>;
  if (!categories.length) return <div className="site-surface p-10 text-center site-muted">ماكو أقسام فيها منتجات بعد. راح تظهر هنا أول ما تضيف منتجات للمتجر.</div>;

  return <div className={`grid gap-4 sm:gap-5 ${variant === 'page' ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
    {categories.map(category => <Link
      key={category.name}
      href={`/products?category=${encodeURIComponent(category.name)}`}
      className="site-card group flex flex-col sm:flex-row min-h-[190px]"
      aria-label={`${category.name}، ${category.count} منتج`}
    >
      <ProductMedia name={category.product.name} image={category.product.image} icon={category.product.icon} size={54} className="h-36 sm:h-auto sm:w-2/5 shrink-0 m-3 rounded-xl" />
      <span className="flex flex-1 flex-col justify-between gap-5 p-5 sm:pr-2">
        <span className="text-[11px] font-bold tracking-widest text-brand" dir="ltr">THANAYA / CATEGORY</span>
        <span className="flex items-end justify-between gap-3">
          <span><strong className="block text-lg leading-7 group-hover:text-brand transition-colors">{category.name}</strong><small className="site-muted text-xs">{category.count} منتج متوفر</small></span>
          <ArrowUpLeft size={20} className="text-brand shrink-0" aria-hidden="true" />
        </span>
      </span>
    </Link>)}
  </div>;
}
