import Link from 'next/link';
import { ArrowUpLeft, ArrowLeft, Sparkles, MapPin } from 'lucide-react';

/** Light, editorial hero inspired by the original Thanaya storefront. */
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[#dceef7]" aria-labelledby="hero-title">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_5%,#e3f5ff_0%,transparent_55%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 top-20 h-48 w-48 rounded-full border-[26px] border-[#d8f1fc]/45" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-4 h-56 w-56 rounded-full border-[26px] border-[#d8f1fc]/45" />

      <div className="site-container relative flex min-h-[450px] flex-col items-center justify-center px-1 py-14 text-center sm:min-h-[490px] sm:py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#b7e5f7] bg-white/90 px-5 py-2 text-[11px] font-extrabold text-[#0879a5] shadow-[0_8px_30px_rgba(4,142,188,.07)] sm:text-xs">
          <Sparkles size={15} aria-hidden="true" /> ثنايا لمستلزمات طب الأسنان والأجهزة الطبية
        </div>
        <h1 id="hero-title" className="mt-7 max-w-[950px] text-[clamp(2.4rem,4.7vw,4.7rem)] font-black leading-[1.32] tracking-[-.035em] text-[#202b36]">
          كل ما تحتاجه عيادتك،<br />
          <span className="text-[#039fd0]">من أصغر أداة إلى أكبر جهاز.</span>
        </h1>
        <p className="mt-5 max-w-[640px] text-sm leading-8 text-[#647586] sm:text-base sm:leading-9">
          تسوّق مستلزمات طب الأسنان والأجهزة والمواد الطبية بمكان واحد.
          اطّلع على الأسعار والتفاصيل، واختَر احتياجات عيادتك بسهولة.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Link href="/products" className="site-btn site-btn-primary min-w-[150px] rounded-full !bg-[#049fd1] hover:!bg-[#007faa]">
            تسوّق الآن <ArrowUpLeft size={18} aria-hidden="true" />
          </Link>
          <Link href="/categories" className="site-btn site-btn-outline min-w-[158px] rounded-full !border-[#92cbe3] hover:!border-brand">
            تصفّح الأقسام <ArrowLeft size={17} aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-10 flex items-center justify-center gap-2 text-xs font-semibold text-[#7895a7]">
          <MapPin size={15} aria-hidden="true" /> متجر عراقي من البصرة
        </p>
      </div>
    </section>
  );
}
