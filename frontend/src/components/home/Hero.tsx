import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpLeft, ArrowLeft, Check, MapPin, PackageSearch, ShieldCheck, Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section className="site-container pt-5 sm:pt-8 lg:pt-10" aria-labelledby="hero-title">
      <div className="relative isolate overflow-hidden rounded-[28px] sm:rounded-[36px] bg-[#112b48] text-white shadow-[0_28px_75px_rgba(16,48,90,.16)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_14%_15%,rgba(44,137,222,.36),transparent_48%),radial-gradient(ellipse_at_78%_75%,rgba(35,176,173,.24),transparent_50%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative grid min-h-[610px] items-center gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative z-10 px-6 pb-4 pt-12 sm:px-10 lg:py-20 lg:pr-14 xl:pr-16">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-bold text-[#d5edff] backdrop-blur-sm sm:text-xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#49dccb]" aria-hidden="true" />
              متجر ثنايا للمستلزمات والأجهزة الطبية
            </div>
            <h1 id="hero-title" className="mt-7 max-w-[650px] text-[clamp(2.5rem,5.2vw,5.2rem)] font-black leading-[1.27] tracking-tight">
              كل ما تحتاجه<br />
              لعيادتك، <span className="text-[#78e5dd]">بمكان واحد.</span>
            </h1>
            <p className="mt-6 max-w-[510px] text-sm leading-8 text-[#c7d8ed] sm:text-base sm:leading-9">
              من مستلزمات طب الأسنان إلى الأجهزة والمواد الطبية. اكتشف منتجات المتجر، قارن التفاصيل، وكمّل طلبك بخطوات واضحة.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/products" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-black text-[#112b48] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#eaf8ff] focus-visible:outline-offset-4">
                استكشف المنتجات <ArrowUpLeft size={18} aria-hidden="true" />
              </Link>
              <Link href="/categories" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:border-white/60 hover:bg-white/20">
                تسوّق حسب القسم <ArrowLeft size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/15 pt-6 text-xs font-semibold text-[#c9d9e9]">
              <span className="inline-flex items-center gap-2"><MapPin size={16} className="text-[#75e0d9]" /> من البصرة، العراق</span>
              <span className="inline-flex items-center gap-2"><PackageSearch size={16} className="text-[#75e0d9]" /> تصفّح حسب المنتج والقسم</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-[#75e0d9]" /> تفاصيل وأسعار واضحة</span>
            </div>
          </div>

          <div className="relative flex min-h-[390px] items-center justify-center px-5 pb-8 sm:px-10 lg:h-full lg:min-h-[580px] lg:py-16 lg:pl-14">
            <div aria-hidden="true" className="absolute right-[11%] top-[15%] h-56 w-56 rounded-full bg-[#3a9bd7]/30 blur-3xl" />
            <div className="relative w-full max-w-[520px] -rotate-2 rounded-[29px] border border-white/35 bg-[#edf6ff] p-4 shadow-[0_35px_90px_rgba(0,12,35,.35)] transition-transform duration-500 hover:rotate-0 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-black tracking-widest text-[#64809b]" dir="ltr">
                <span>THANAYA / MEDICAL SUPPLIES</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#20b6a9]" /> CATALOG</span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_40%,white,#d9e9fa)]">
                <Image
                  src="/visuals/clinical-still-life.svg"
                  alt="رسم توضيحي لمستلزمات طب الأسنان والأجهزة الطبية"
                  width={650} height={540} priority
                  className="aspect-[1.15] w-full object-contain"
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-[#142b43]">
                <div>
                  <p className="text-sm font-black sm:text-base">اختيار يناسب شغلك</p>
                  <p className="mt-1 text-xs text-[#6b8198]">استكشف أقسام المتجر بسهولة</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm" aria-hidden="true">
                  <Sparkles size={18} className="text-[#1855d9]" />
                </span>
              </div>
            </div>
            <div className="absolute bottom-7 left-3 z-10 flex items-center gap-2 rounded-2xl border border-white/80 bg-white px-4 py-3 text-xs font-black text-[#14304c] shadow-[0_15px_35px_rgba(1,28,59,.2)] sm:left-6 lg:bottom-16">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e5f9f4] text-[#168477]" aria-hidden="true"><Check size={18} /></span>
              تجربة شراء واضحة وبسيطة
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
