import Link from 'next/link';
import { ArrowUpLeft, Boxes, ShoppingBag } from 'lucide-react';

export default function OfferBanner() {
  return <section className="site-container py-4 md:py-5">
    <div className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(120deg,#007cae,#04a5d1)] px-6 py-6 sm:px-10 sm:py-7 text-white grid md:grid-cols-[1fr_auto] items-center gap-8">
      <div className="absolute left-[-75px] top-[-95px] w-72 h-72 rounded-full border-[48px] border-white/[.06]" aria-hidden="true" />
      <div className="relative"><span className="text-white/80 text-xs font-bold tracking-widest">THANAYA / BASRA</span><h2 className="site-heading mt-3 text-white">احتياجات عيادتك، أسهل مع ثنايا.</h2><p className="text-white/70 text-sm mt-3 max-w-xl leading-8">تصفّح مستلزمات طب الأسنان والأجهزة الطبية، ورتّب احتياجاتك من الأقسام الموجودة في المتجر.</p></div>
      <div className="relative flex items-center gap-3"><Boxes size={36} className="text-brand-light hidden lg:block" aria-hidden="true" /><Link href="/products" className="site-btn site-btn-outline">ابدأ التصفّح <ArrowUpLeft size={18} /></Link><ShoppingBag size={23} className="text-white/40 hidden lg:block" aria-hidden="true" /></div>
    </div>
  </section>;
}
