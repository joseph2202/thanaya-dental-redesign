import Link from 'next/link';
import {ArrowUpLeft,ArrowLeft,ArrowDown,MapPin,ShieldCheck,Package,Stethoscope,Sparkles,Layers3,ScanLine} from 'lucide-react';

export default function Hero(){
 return <section aria-labelledby="hero-title" className="signature-hero relative isolate overflow-hidden">
  <div className="signature-hero-glow pointer-events-none absolute inset-0" aria-hidden="true"/>
  <div className="site-container relative grid items-center gap-7 py-9 sm:py-12 lg:min-h-[450px] lg:grid-cols-[1.05fr_.95fr] lg:gap-10 lg:py-9">
   <div className="relative z-10 max-w-[760px]">
    <div className="inline-flex items-center gap-2.5 rounded-full border border-white/25 bg-white/[.08] px-4 py-2 text-[11px] font-bold tracking-wide text-[#c0ebf6] backdrop-blur-sm sm:text-xs">
     <span className="signature-live-dot" aria-hidden="true"/><span dir="ltr">THANAYA / MEDICAL SUPPLY</span>
    </div>
    <h1 id="hero-title" className="mt-5 text-[clamp(2.25rem,5.3vw,4.65rem)] font-black leading-[1.16] tracking-[-.055em] text-white sm:mt-5">
     كل ما تحتاجه
     <span className="mt-1 block text-[#7fe0fa]">لعيادة متكاملة.</span>
    </h1>
    <p className="mt-4 max-w-[575px] text-sm leading-7 text-[#c6dfe8] sm:text-[16px] sm:leading-8">
     مستلزمات طب الأسنان والأجهزة الطبية، بمواصفات واضحة وأسعار بالدينار العراقي.
     اختَر احتياجات عيادتك بثقة، وخلي التفاصيل علينا.
    </p>
    <div className="mt-5 flex flex-wrap gap-3 sm:mt-6">
     <Link href="/products" className="signature-hero-cta inline-flex min-h-[52px] flex-1 items-center justify-center gap-3 rounded-2xl px-5 text-sm font-black sm:flex-none sm:px-8">
      تصفّح المنتجات <ArrowUpLeft size={20} aria-hidden="true"/>
     </Link>
     <Link href="/categories" className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-black text-white transition hover:border-white/50 hover:bg-white/15 sm:flex-none sm:px-6">
      استكشف الأقسام <ArrowLeft size={17} aria-hidden="true"/>
     </Link>
    </div>
    <div className="mt-6 grid max-w-[560px] grid-cols-2 gap-3 border-t border-white/15 pt-5 text-[11px] leading-6 text-[#c0dbe4] sm:gap-5 sm:text-xs">
     <div className="flex items-start gap-2.5"><MapPin size={18} className="mt-0.5 shrink-0 text-[#7fe0fa]" aria-hidden="true"/><span>متجر عراقي<br/><strong className="text-white">من البصرة</strong></span></div>
     <div className="flex items-start gap-2.5"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#7fe0fa]" aria-hidden="true"/><span>أسعار ووحدات بيع<br/><strong className="text-white">واضحة قبل الطلب</strong></span></div>
    </div>
   </div>

   <div className="signature-showcase relative hidden min-h-[320px] items-center justify-center lg:flex" aria-label="مسارات التسوق في ثنايا">
    <div aria-hidden="true" className="signature-orbit signature-orbit-outer"/>
    <div aria-hidden="true" className="signature-orbit signature-orbit-inner"/>
    <div aria-hidden="true" className="signature-orbit-center"><ScanLine size={68} strokeWidth={1.25}/></div>
    <Link href="/categories" className="signature-showcase-tile absolute right-[1%] top-[3%] w-[61%] rotate-[5deg] p-5 xl:right-[3%]">
     <span className="flex items-center justify-between gap-2"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-100/15 text-[#90e8ff]"><Stethoscope size={27}/></span><ArrowUpLeft size={21} className="text-[#90e8ff]"/></span>
     <span className="mt-5 block text-xs text-[#aad5e1]">تسوق حسب القسم</span>
     <strong className="mt-1 block text-xl text-white">مستلزمات طب الأسنان</strong>
    </Link>
    <Link href="/products" className="signature-showcase-tile absolute bottom-[6%] left-[-1%] w-[65%] -rotate-[6deg] p-5">
     <span className="flex items-center justify-between gap-2"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-100/15 text-[#90e8ff]"><Package size={27}/></span><ArrowUpLeft size={21} className="text-[#90e8ff]"/></span>
     <span className="mt-5 block text-xs text-[#aad5e1]">تصفح الكتالوج</span>
     <strong className="mt-1 block text-xl text-white">الأجهزة والمنتجات</strong>
    </Link>
    <div aria-hidden="true" className="absolute bottom-[9%] right-[0] grid h-16 w-16 place-items-center rounded-3xl border border-[#72cee9]/25 bg-[#113a4d]/70 text-[#81e0f8] shadow-xl backdrop-blur-lg"><Layers3 size={27}/></div>
    <div aria-hidden="true" className="absolute left-[6%] top-[4%] flex items-center gap-2 text-[10px] font-bold tracking-[.2em] text-[#80b6c8]"><Sparkles size={16}/> THE THANAYA EDITION</div>
   </div>
   <Link href="#featured-products" className="absolute bottom-3 left-4 hidden items-center gap-2 text-[11px] font-bold text-[#a9cdd9] hover:text-white lg:inline-flex">
    اكتشف المجموعة <ArrowDown size={15}/>
   </Link>
  </div>
 </section>;
}
