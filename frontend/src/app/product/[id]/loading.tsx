import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function ProductLoading() {
  return <>
    <Header />
    <main className="site-container site-main py-6" role="status" aria-label="جاري تحميل تفاصيل المنتج">
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-9">
        <div className="aspect-square animate-pulse rounded-[24px] border border-[#d8ecf2] bg-[#e4f1f5]" aria-hidden="true"/>
        <div className="space-y-5" aria-hidden="true">
          <div className="h-4 w-1/3 animate-pulse rounded-full bg-[#e4f1f5]" />
          <div className="h-9 w-4/5 animate-pulse rounded-xl bg-[#e4f1f5]" />
          <div className="h-4 w-full animate-pulse rounded-full bg-[#e4f1f5]" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-[#e4f1f5]" />
          <div className="mt-8 h-28 animate-pulse rounded-[22px] bg-[#e4f1f5]" />
        </div>
      </div>
      <p className="sr-only">جاري تحميل المنتج...</p>
    </main>
    <Footer />
  </>;
}
