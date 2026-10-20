import Link from 'next/link';
import {ArrowUpLeft, ArrowLeft, MapPin, Search, ShieldCheck, Package, Stethoscope, Truck, Sparkles} from 'lucide-react';

export default function Hero(){
  return <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b border-[#d1e9f1] bg-[linear-gradient(135deg,#f4fbfd_0%,#e9f7fb_56%,#f8fcfd_100%)]">
    <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#9bdbef]/20 blur-3xl" />
    <div className="site-container relative grid items-center gap-8 py-9 sm:py-12 lg:grid-cols-[1.15fr_.85fr] lg:gap-10 lg:py-14">
      <div className="max-w-3xl">
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#b4e3ee] bg-white/85 px-3.5 py-2 text-[11px] font-bold text-[#056f92] shadow-sm sm:text-xs">
          <Sparkles size={15} className="shrink-0" aria-hidden="true" /> متخصصون بمستلزمات طب الأسنان والأجهزة الطبية
        </div>
        <h1 id="hero-title" className="mt-5 text-[clamp(2.15rem,5.5vw,4.65rem)] font-black leading-[1.28] tracking-[-.045em] text-[#233943]">
          تجهيز عيادتك<br /><span className="text-[#0497c7]">صار أسهل ويا ثنايا.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-8 text-[#566e7a] sm:text-base sm:leading-9">
          تصفّح مستلزمات طب الأسنان والمواد والأجهزة الطبية، قارن التفاصيل والأسعار بالدينار العراقي، واختَر اللي تحتاجه بوضوح.
        </p>
        <div className="mt-6 flex flex-col gap-3 min-[440px]:flex-row min-[440px]:flex-wrap">
          <Link href="/products" className="site-btn site-btn-primary min-[440px]:min-w-[190px]">
            تسوّق المنتجات <ArrowUpLeft size={18} aria-hidden="true" />
          </Link>
          <Link href="/categories" className="site-btn site-btn-outline min-[440px]:min-w-[190px]">
            استكشف الأقسام <ArrowLeft size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#b8dae6] pt-5 text-xs font-semibold text-[#537282]">
          <span className="inline-flex items-center gap-2"><MapPin size={16} className="text-brand" aria-hidden="true" /> متجر عراقي من البصرة</span>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-brand" aria-hidden="true" /> أسعار واضحة بالدينار</span>
        </div>
      </div>
      <div aria-label="تصفح المنتجات بسهولة من الأقسام أو البحث" className="relative mx-auto w-full max-w-[480px]">
        <div className="absolute -inset-3 rounded-[38px] border border-white/70 bg-white/25 -rotate-3" aria-hidden="true"/>
        <div className="relative overflow-hidden rounded-[30px] border border-[#bfdfec] bg-[#ffffff] p-4 shadow-[0_32px_70px_rgba(18,84,109,.12)] sm:p-6">
          <div className="flex items-center justify-between border-b border-[#e2eff3] pb-4">
            <div className="flex items-center gap-2 text-sm font-black text-[#264853]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e7f7fc] text-brand"><Stethoscope size={20}/></span> دليل مستلزمات عيادتك</div>
            <span className="rounded-full bg-[#eef7f8] px-2.5 py-1 text-[10px] font-bold text-[#477687]">ثنايا</span>
          </div>
          <Link href="/products" className="mt-5 flex min-h-12 items-center gap-3 rounded-xl border border-[#d3e8ee] bg-[#f5fafb] px-4 text-sm text-[#708c99] transition hover:border-brand hover:text-brand"><Search size={18} className="shrink-0" /><span>ابحث عن المنتج اللي تحتاجه...</span><ArrowUpLeft size={16} className="mr-auto shrink-0"/></Link>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link href="/categories" className="flex min-h-[144px] flex-col justify-between rounded-[20px] bg-[#d9f2fa] p-4 transition hover:bg-[#c9eaf5] sm:min-h-[172px] sm:p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/75 text-[#08799c]"><Stethoscope size={25}/></span>
              <span className="flex items-end justify-between gap-2"><strong className="text-[15px] leading-6 text-[#174b62]">مستلزمات<br/>طب الأسنان</strong><ArrowUpLeft size={17} className="text-[#08799c]"/></span>
            </Link>
            <Link href="/products" className="flex min-h-[144px] flex-col justify-between rounded-[20px] bg-[#eaf1f8] p-4 transition hover:bg-[#dce9f4] sm:min-h-[172px] sm:p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/80 text-[#47779b]"><Package size={25}/></span>
              <span className="flex items-end justify-between gap-2"><strong className="text-[15px] leading-6 text-[#2f526c]">الأجهزة<br/>والمنتجات الطبية</strong><ArrowUpLeft size={17} className="text-[#47779b]"/></span>
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#ddebf1] bg-[#fbfdfd] p-3 text-xs text-[#557281] sm:p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf8fb] text-[#0486b3]"><Truck size={20}/></span>
            <span><strong className="block text-sm text-[#284a58]">اختَر محافظتك عند إتمام الطلب</strong><span>تظهر أجور التوصيل حسب الإعدادات المتاحة.</span></span>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
