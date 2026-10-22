import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function ProductsLoading() {
  return <>
    <Header />
    <main className="site-container site-main py-5 md:py-8" role="status" aria-label="جاري تجهيز قائمة المنتجات">
      <div className="mb-5 rounded-[26px] border border-[#d0eaf5] bg-white p-6 md:p-8">
        <div className="h-4 w-28 animate-pulse rounded-full bg-[#dcecf2]" aria-hidden="true" />
        <div className="mt-4 h-9 max-w-md animate-pulse rounded-xl bg-[#dcecf2]" aria-hidden="true" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <div className="hidden h-80 animate-pulse rounded-[20px] bg-[#e4f1f5] lg:block" aria-hidden="true" />
        <div className="grid gap-3 min-[390px]:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {[0,1,2,3,4,5].map(key=><div key={key} className="overflow-hidden rounded-[22px] border border-[#cee7ef] bg-white p-3" aria-hidden="true">
            <div className="aspect-[4/3] animate-pulse rounded-2xl bg-[#e4f1f5]" />
            <div className="mt-4 h-3 w-1/3 animate-pulse rounded-full bg-[#e4f1f5]" />
            <div className="mt-3 h-5 w-4/5 animate-pulse rounded-full bg-[#e4f1f5]" />
            <div className="mt-5 h-6 w-1/2 animate-pulse rounded-full bg-[#e4f1f5]" />
          </div>)}
        </div>
      </div>
      <p className="sr-only">جاري تحميل المنتجات...</p>
    </main>
    <Footer />
  </>;
}
