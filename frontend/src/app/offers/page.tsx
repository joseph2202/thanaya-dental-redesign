import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ArrowUpLeft, Tag } from 'lucide-react';

export default function OffersPage() {
  return <><Header /><main className="site-container site-main py-10 md:py-14"><span className="site-eyebrow">THANAYA OFFERS</span><h1 className="site-page-title mt-2">العروض</h1><div className="site-surface mt-9 p-8 sm:p-12 max-w-3xl"><span className="w-14 h-14 grid place-items-center rounded-2xl bg-[#e8f8fd] text-brand mb-6"><Tag size={27} /></span><h2 className="site-heading">لا توجد عروض معلنة حاليًا.</h2><p className="site-muted text-sm mt-3 mb-7">عند إضافة عرض فعلي للمتجر، يمكن نشر تفاصيله هنا. تگدر الآن تتصفّح المنتجات المتوفرة.</p><Link href="/products" className="site-btn site-btn-primary">تصفّح المنتجات <ArrowUpLeft size={17} /></Link></div></main><Footer /></>;
}
