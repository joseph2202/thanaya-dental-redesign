import Link from 'next/link';
import { ArrowUpLeft, Boxes, ShoppingBag } from 'lucide-react';

export default function OfferBanner() {
  return <section className="site-container pb-16 md:pb-24">
    <div className="relative overflow-hidden rounded-[24px] bg-ink px-7 py-10 sm:px-12 sm:py-14 text-white grid md:grid-cols-[1fr_auto] items-center gap-8">
      <div className="absolute left-[-75px] top-[-95px] w-72 h-72 rounded-full border-[48px] border-white/[.06]" aria-hidden="true" />
      <div className="relative"><span className="text-brand-light text-xs font-bold tracking-widest">THANAYA / BASRA</span><h2 className="site-heading mt-3 text-white">قائمة عيادتك تبدأ من هنا.</h2><p className="text-white/70 text-sm mt-3 max-w-xl leading-8">تصفّح مستلزمات طب الأسنان والأجهزة الطبية، ورتّب احتياجاتك من الأقسام الموجودة في المتجر.</p></div>
      <div className="relative flex items-center gap-3"><Boxes size={36} className="text-brand-light hidden lg:block" aria-hidden="true" /><Link href="/products" className="site-btn bg-white text-ink hover:bg-[#eaf1ff]">ابدأ التصفّح <ArrowUpLeft size={18} /></Link><ShoppingBag size={23} className="text-white/40 hidden lg:block" aria-hidden="true" /></div>
    </div>
  </section>;
}
