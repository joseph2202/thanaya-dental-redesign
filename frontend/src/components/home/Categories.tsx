import Link from 'next/link';
import ProductIcon from '@/components/ui/ProductIcon';
import { ArrowUpLeft } from 'lucide-react';

const cats = [
  { name: 'طب الأسنان', icon: 'Smile', subtitle: 'Dental' },
  { name: 'مستلزمات طبية', icon: 'Stethoscope', subtitle: 'Supplies' },
  { name: 'أجهزة طبية', icon: 'Activity', subtitle: 'Devices' },
  { name: 'مختبرات', icon: 'FlaskConical', subtitle: 'Laboratory' },
  { name: 'تعقيم', icon: 'ShieldPlus', subtitle: 'Sterilization' },
  { name: 'كراسي ومتحركة', icon: 'Accessibility', subtitle: 'Mobility' },
];

export default function Categories() {
  return (
    <section className="site-container site-section" aria-labelledby="categories-title">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div><span className="site-eyebrow">EXPLORE CATEGORIES</span><h2 id="categories-title" className="site-heading mt-2">كل احتياجاتك، مرتّبة إلك.</h2><p className="site-muted text-sm mt-1">اختَر القسم وابدأ من المكان الصحيح.</p></div>
        <Link href="/categories" className="text-brand text-sm font-bold inline-flex items-center gap-2 hover:underline">كل الأقسام <ArrowUpLeft size={16} /></Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {cats.map((c) => <Link key={c.name} href={`/products?category=${encodeURIComponent(c.name)}`} className="site-card group p-4 sm:p-5 min-h-[168px] flex flex-col justify-between">
          <span className="w-12 h-12 bg-[#edf3ff] text-brand rounded-xl grid place-items-center group-hover:bg-brand group-hover:text-white transition-colors"><ProductIcon name={c.icon} size={24} /></span>
          <span><strong className="block font-bold text-[13px] sm:text-sm">{c.name}</strong><small className="text-[10px] text-[#8191a4]" dir="ltr">{c.subtitle}</small></span>
        </Link>)}
      </div>
    </section>
  );
}
