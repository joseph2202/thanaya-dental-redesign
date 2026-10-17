import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductIcon from '@/components/ui/ProductIcon';
import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';

const categories = [
  { name: 'طب الأسنان', icon: 'Smile', desc: 'أدوات ومستلزمات الأسنان' },
  { name: 'مستلزمات طبية', icon: 'Stethoscope', desc: 'احتياجات العيادات اليومية' },
  { name: 'أجهزة طبية', icon: 'Activity', desc: 'الأجهزة الموجودة في المتجر' },
  { name: 'مختبرات', icon: 'FlaskConical', desc: 'مستلزمات المختبر' },
  { name: 'تعقيم', icon: 'ShieldPlus', desc: 'مواد ومعدات التعقيم' },
  { name: 'كراسي ومتحركة', icon: 'Accessibility', desc: 'كراسي المرضى والمساعدة' },
];

export default function CategoriesPage() {
  return <><Header /><main className="site-container site-main py-14 md:py-20"><span className="site-eyebrow">EXPLORE THANAYA</span><h1 className="site-page-title mt-2">تصفّح حسب احتياجك.</h1><p className="site-muted mt-3 mb-10">كل قسم يوصلك للمنتجات الموجودة ضمنه.</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{categories.map(c => <Link key={c.name} href={`/products?category=${encodeURIComponent(c.name)}`} className="site-card group p-7 min-h-[220px] flex flex-col justify-between"><span className="w-14 h-14 rounded-2xl bg-[#eaf1ff] text-brand grid place-items-center"><ProductIcon name={c.icon} size={27} /></span><span className="flex items-end justify-between gap-3"><span><strong className="block text-lg group-hover:text-brand">{c.name}</strong><small className="text-[#8494a7] text-xs">{c.desc}</small></span><ArrowUpLeft size={19} className="text-brand" /></span></Link>)}</div></main><Footer /></>;
}
