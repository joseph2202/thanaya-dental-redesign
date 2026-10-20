import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import CategoryGrid from '@/components/catalog/CategoryGrid';

export default function Categories() {
  return (
    <section className="site-container pt-6 pb-4 md:pt-8 md:pb-5" aria-labelledby="categories-title">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div><span className="site-eyebrow">EXPLORE CATEGORIES</span><h2 id="categories-title" className="site-heading mt-2">كل احتياجاتك، مرتّبة إلك.</h2><p className="site-muted text-sm mt-1">أقسام المتجر حسب المنتجات الموجودة فعلًا.</p></div>
        <Link href="/categories" className="site-btn site-btn-outline site-btn-sm">كل الأقسام <ArrowUpLeft size={16} /></Link>
      </div>
      <CategoryGrid />
    </section>
  );
}
