"use client";
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import {RefreshCw, WifiOff} from 'lucide-react';

export default function ProductsError({reset}:{error:Error & {digest?:string};reset:()=>void}) {
  return <>
    <Header />
    <main className="site-container site-main py-12">
      <div className="site-surface mx-auto max-w-xl px-6 py-10 text-center">
        <WifiOff size={40} className="mx-auto text-[#0a8ab7]" aria-hidden="true"/>
        <h1 className="mt-4 text-2xl font-black">المنتجات ما حمّلت هالمرة</h1>
        <p className="site-muted mt-3 text-sm">ممكن الاتصال بالمتجر انقطع مؤقتاً. جرّب تحديث النتائج، أو ارجع للرئيسية.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="site-btn site-btn-primary site-btn-sm">
            <RefreshCw size={17} aria-hidden="true"/> إعادة المحاولة
          </button>
          <Link href="/" className="site-btn site-btn-outline site-btn-sm">الرئيسية</Link>
        </div>
      </div>
    </main>
    <Footer />
  </>;
}
