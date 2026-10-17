import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpLeft, MapPin } from 'lucide-react';

export default function Hero() {
  return (
    <section className="site-container pt-8 md:pt-12" aria-labelledby="hero-title">
      <div className="relative overflow-hidden rounded-[26px] bg-[#eaf2ff] grid lg:grid-cols-[1.08fr_.92fr] min-h-[565px]">
        <div className="relative z-10 px-6 sm:px-10 lg:px-16 py-14 lg:py-20 flex flex-col justify-center">
          <div className="site-eyebrow flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" /> من البصرة، لكل احتياجاتك الطبية</div>
          <h1 id="hero-title" className="text-[clamp(2.6rem,4.9vw,5rem)] leading-[1.35] font-extrabold tracking-tight mt-6 max-w-[650px]">
            تفاصيل تصنع فرقًا<br /><span className="text-brand">في كل عيادة.</span>
          </h1>
          <p className="site-muted text-sm sm:text-base max-w-[470px] mt-5">
            مستلزمات طب الأسنان والأجهزة والمواد الطبية في مكان واحد. تصفّح المنتجات واختر ما يلائم احتياجك بوضوح وسهولة.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-8">
            <Link href="/products" className="site-btn site-btn-primary">تصفّح المنتجات <ArrowUpLeft size={18} aria-hidden="true" /></Link>
            <Link href="/categories" className="site-btn site-btn-outline">استكشف الأقسام</Link>
          </div>
          <p className="mt-9 text-xs text-[#5e7590] flex items-center gap-2"><MapPin size={15} aria-hidden="true" /> متجر عراقي من البصرة</p>
        </div>
        <div className="relative min-h-[350px] lg:min-h-full flex items-center justify-center bg-[radial-gradient(circle_at_50%_50%,#d8e7ff,transparent_68%)]">
          <Image src="/visuals/clinical-still-life.svg" alt="رسم توضيحي لمستلزمات طب الأسنان والأجهزة الطبية" width={680} height={580} priority className="relative z-10 w-full max-w-[620px] h-auto drop-shadow-sm" />
          <div className="absolute z-20 bottom-8 left-5 sm:left-10 bg-white/95 border border-white rounded-2xl px-5 py-3 shadow-[0_16px_36px_#173c831a]">
            <span className="block text-sm font-bold">من اختيارك إلى طلبك</span>
            <span className="text-[11px] text-[#72849a]">تجربة مرتّبة وواضحة</span>
          </div>
        </div>
      </div>
    </section>
  );
}
